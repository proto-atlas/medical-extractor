import Anthropic from '@anthropic-ai/sdk';
import type { NextRequest } from 'next/server';
import { MODEL } from '@/lib/models';
import { checkRequestRateLimit, getClientIp } from '@/lib/rate-limit';
import { checkAccess } from '@/lib/auth';
import {
  SOAPDataSchema,
  SOAP_TOOL_DESCRIPTION,
  SOAP_TOOL_INPUT_SCHEMA,
  SOAP_TOOL_NAME,
  validateSOAPSourceTexts,
  type SOAPData,
} from '@/lib/soap-schema';
import type { ApiErrorResponse, ExtractErrorCode } from '@/lib/types';

// 入力documentText最大 10,000 文字
const MAX_DOCUMENT_LENGTH = 10_000;

/**
 * Anthropic API呼び出しのタイムアウト (ms)。
 *
 * クライアント切断 / 上流応答停滞時にSDK呼び出しが無制限に
 * ぶら下がらないようper-request timeoutを明示する。30 秒はSOAP抽出の典型
 * 応答 (5〜10 秒) + ネットワーク揺らぎを許容する保守的な値。Anthropic SDKの
 * `RequestOptions.timeout` (ms) として渡される。
 */
const MAX_ANTHROPIC_TIMEOUT_MS = 30_000;

/**
 * /api/extractのリクエストボディをruntime validationする純関数。
 * `as ExtractRequest` キャストではなく
 * 構造的にnarrowする。routeハンドラから切り出して単体テストしやすくする目的も兼ねる。
 *
 * 注: languageは当初ja/enの指定を受ける設計だったがSYSTEM_PROMPT側で参照しないため、
 * 使われないAPI surfaceを出さないため削除した。
 */
export type ParseExtractRequestResult =
  | { ok: true; documentText: string }
  | { ok: false; error: ExtractErrorCode };

export function parseExtractRequest(
  input: unknown,
  maxLength: number = MAX_DOCUMENT_LENGTH,
): ParseExtractRequestResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'invalid_input' };
  }
  const obj = input as Record<string, unknown>;
  const documentText = typeof obj.documentText === 'string' ? obj.documentText.trim() : '';
  if (!documentText) {
    return { ok: false, error: 'invalid_input' };
  }
  if (documentText.length > maxLength) {
    return { ok: false, error: 'document_too_long' };
  }
  return { ok: true, documentText };
}

const SYSTEM_PROMPT =
  'あなたは医療文書からSOAP形式 (Subjective / Objective / Assessment / Plan) の各項目を構造化して抽出するアシスタントです。\n\n【最重要ルール】\n1. 必ず提供されたextract_soapツールを 1 回だけ呼び出して構造化されたJSONを返すこと。プレーンテキストでは答えない。\n2. 4 項目すべてを埋めること。原文に該当する記述が見当たらない場合でも空にせず "記載なし" 等の文字列を入れる。\n3. source_textには入力文書内の連続した短い原文をそのままコピーすること。複数箇所を結合せず、要約や言い換えもしない。text欄で要約する。\n4. 推測や憶測は避け、原文に書かれた事実のみから抽出する。\n5. 個人情報や患者識別情報があってもログに残さない (この応答以外で扱わない)。';

interface ExtractResponse {
  soap: SOAPData;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/**
 * UIに渡すJSONエラーレスポンスを組み立てる。
 *
 * 内部詳細 (SDK message, Zod issues path/code, 環境変数名) はUIに出さない。
 * codeのみを返し、原因の詳細はconsole.errorで
 * サーバー側ログに残す方針。
 */
function jsonError(
  code: ExtractErrorCode,
  status: number,
  extra?: { retryAfterSeconds?: number; headers?: HeadersInit },
): Response {
  const body: ApiErrorResponse = { error: code };
  if (extra?.retryAfterSeconds !== undefined) {
    body.retryAfterSeconds = extra.retryAfterSeconds;
  }
  return Response.json(body, { status, headers: extra?.headers });
}

export async function POST(req: NextRequest): Promise<Response> {
  const ip = getClientIp(req);

  // 1. Pre-auth credential-attempt limiter (scope='extract-auth', 10 req/60s)
  // /api/extractに直接Bearer候補を投げる総当たり攻撃に対し、auth checkの前に
  // 軽量limiterを回す。auth (5) より緩めの 10 にすることで、正規UIユーザーが
  // 一度キーを間違えて再送する程度の挙動は許容しつつ、ボットの試行頻度を遅らせる。
  // bucketはscope分離されているため、authenticatedユーザーの本体抽出枠
  // (scope='extract') を消費しない。
  const preAuthRate = await checkRequestRateLimit('extract-auth', ip);
  if (!preAuthRate.allowed) {
    return jsonError('rate_limit', 429, {
      retryAfterSeconds: preAuthRate.retryAfterSeconds,
      headers: { 'Retry-After': String(preAuthRate.retryAfterSeconds) },
    });
  }

  // 2. 認証
  const expectedPassword = process.env.ACCESS_PASSWORD;
  if (!checkAccess(req.headers.get('Authorization'), expectedPassword)) {
    return jsonError('unauthorized', 401);
  }

  // 3. レート制限 (scope='extract', 5 req/60s/IP: 抽出本体 = Anthropic課金経路)
  const rate = await checkRequestRateLimit('extract', ip);
  if (!rate.allowed) {
    return jsonError('rate_limit', 429, {
      retryAfterSeconds: rate.retryAfterSeconds,
      headers: { 'Retry-After': String(rate.retryAfterSeconds) },
    });
  }

  // 4. リクエストボディ検証 (parseExtractRequest純関数でruntime narrowing)
  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return jsonError('invalid_input', 400);
  }
  const parsed = parseExtractRequest(bodyJson);
  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }
  const documentText = parsed.documentText;

  // 5. API key取得 (Workers Secret経由、コードにハードコードしない)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // 環境変数名そのものをUIに出さない (攻撃者にスタック推定材料を与えない)。
    // 詳細はサーバーログにのみ残す。
    console.error('[/api/extract] ANTHROPIC_API_KEY is not configured');
    return jsonError('server_misconfigured', 500);
  }

  // 6. Anthropic呼び出し (non-streaming + tool_useで構造化出力強制)
  // maxRetries: 0 で 429/5xx時のSDK自動リトライによる多重課金を防ぐ
  const client = new Anthropic({ apiKey, maxRetries: 0 });

  try {
    const message = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: [
          {
            name: SOAP_TOOL_NAME,
            description: SOAP_TOOL_DESCRIPTION,
            input_schema: SOAP_TOOL_INPUT_SCHEMA,
            // strict: trueでAnthropic側にもschema準拠を求める。
            // 2026-04-26 QAで 1 回schema違反 (subjectiveがinvalid_type) を観測したため有効化。
            // SDK 0.90 でサポート済み (Tool.strict?: boolean)。
            strict: true,
          },
        ],
        // tool_choiceでextract_soapを強制 → AIが必ず構造化出力を返す
        tool_choice: { type: 'tool', name: SOAP_TOOL_NAME },
        messages: [
          {
            role: 'user',
            content: `次の医療文書からSOAP 4 項目を抽出してください。\n\n---\n\n${documentText}`,
          },
        ],
      },
      {
        // クライアント切断時にSDK呼び出しを即時中断、
        // 上流応答停滞時はタイムアウトでcatchに流す。Anthropic SDK 0.90 の
        // RequestOptions.signal: AbortSignal、RequestOptions.timeout: numberを使用。
        signal: req.signal,
        timeout: MAX_ANTHROPIC_TIMEOUT_MS,
      },
    );

    // 6. tool_useブロック取得
    const toolUseBlock = message.content.find(
      (block) => block.type === 'tool_use' && block.name === SOAP_TOOL_NAME,
    );
    if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
      return jsonError('tool_use_missing', 502);
    }

    // 7. Zod検証でAI出力がSOAPスキーマに準拠するか機械的に確認
    const parsed = SOAPDataSchema.safeParse(toolUseBlock.input);
    if (!parsed.success) {
      // Zod issues (path / code) は内部詳細としてサーバーログにのみ残す。
      // UIにはcodeのみ返却する。
      console.error('[/api/extract] SOAP schema violation:', parsed.error.issues);
      return jsonError('schema_violation', 502);
    }

    // 8. source_textが入力本文に存在する根拠文か検証
    // raw source_textはログに出さず、失敗フィールド名だけを残す。
    const sourceTextValidation = validateSOAPSourceTexts(documentText, parsed.data);
    if (!sourceTextValidation.ok) {
      console.error(
        '[/api/extract] SOAP source_text mismatch:',
        sourceTextValidation.failures.map((failure) => failure.field),
      );
      return jsonError('source_text_mismatch', 502);
    }

    // 9. 成功レスポンス
    const response: ExtractResponse = {
      soap: parsed.data,
      model: MODEL,
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
        cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? undefined,
        cache_read_input_tokens: message.usage.cache_read_input_tokens ?? undefined,
      },
    };
    return Response.json(response);
  } catch (err) {
    // クライアント切断由来は 499 相当扱い (Cloudflare集計可)。
    // signalをSDK呼び出しに渡しているため、abort時はSDK内で
    // AbortErrorを投げて即座にcatchに流れる。req.signal.aborted判定はそのまま。
    if (req.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    // タイムアウトをupstream_unavailableから分離して
    // upstream_timeoutとして返す。Anthropic SDKはtimeout時に
    // APIConnectionTimeoutErrorを投げる (公式docs)。SDKのnamed exportは
    // 環境差で取得しにくいため、constructor nameとmessageで識別する。
    const errName = err instanceof Error ? err.constructor.name : '';
    const errMsg = err instanceof Error ? err.message : '';
    const isTimeout =
      errName === 'APIConnectionTimeoutError' ||
      /\btimeout\b/i.test(errMsg) ||
      /\btimed out\b/i.test(errMsg);
    if (isTimeout) {
      // タイムアウト発生をサーバーログに残す (上流応答時間の傾向把握用)。
      // raw messageはUIに出さず、code化したラベル (upstream_timeout) のみ返す。
      console.error('[/api/extract] upstream timeout:', err);
      return jsonError('upstream_timeout', 504);
    }
    // SDK例外の生messageはUIに出さない。原因はサーバーログにのみ残す
    // (AIレスポンス本文や入力documentTextも含めない、患者情報漏洩防止)。
    console.error('[/api/extract] upstream error:', err);
    return jsonError('upstream_unavailable', 500);
  }
}
