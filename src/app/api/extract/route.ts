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

// 入力 documentText 最大 10,000 文字
const MAX_DOCUMENT_LENGTH = 10_000;

/**
 * Anthropic API 呼び出しのタイムアウト (ms)。
 *
 * クライアント切断 / 上流応答停滞時に SDK 呼び出しが無制限に
 * ぶら下がらないよう per-request timeout を明示する。30 秒は SOAP 抽出の典型
 * 応答 (5〜10 秒) + ネットワーク揺らぎを許容する保守的な値。Anthropic SDK の
 * `RequestOptions.timeout` (ms) として渡される。
 */
const MAX_ANTHROPIC_TIMEOUT_MS = 30_000;

/**
 * /api/extract のリクエストボディを runtime validation する純関数。
 * `as ExtractRequest` キャストではなく
 * 構造的に narrow する。route ハンドラから切り出して単体テストしやすくする目的も兼ねる。
 *
 * 注: language は当初 ja/en の指定を受ける設計だったが SYSTEM_PROMPT 側で参照しないため、
 * 使われない API surface を出さないため削除した。
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
  'あなたは医療文書から SOAP 形式 (Subjective / Objective / Assessment / Plan) の各項目を構造化して抽出するアシスタントです。\n\n【最重要ルール】\n1. 必ず提供された extract_soap ツールを 1 回だけ呼び出して構造化された JSON を返すこと。プレーンテキストでは答えない。\n2. 4 項目すべてを埋めること。原文に該当する記述が見当たらない場合でも空にせず "記載なし" 等の文字列を入れる。\n3. source_text には入力文書内の連続した短い原文をそのままコピーすること。複数箇所を結合せず、要約や言い換えもしない。text 欄で要約する。\n4. 推測や憶測は避け、原文に書かれた事実のみから抽出する。\n5. 個人情報や患者識別情報があってもログに残さない (この応答以外で扱わない)。';

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
 * UI に渡す JSON エラーレスポンスを組み立てる。
 *
 * 内部詳細 (SDK message, Zod issues path/code, 環境変数名) は UI に出さない。
 * code のみを返し、原因の詳細は console.error で
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
  // /api/extract に直接 Bearer 候補を投げる総当たり攻撃に対し、auth check の前に
  // 軽量 limiter を回す。auth (5) より緩めの 10 にすることで、正規 UI ユーザーが
  // 一度キーを間違えて再送する程度の挙動は許容しつつ、ボットの試行頻度を遅らせる。
  // bucket は scope 分離されているため、authenticated ユーザーの本体抽出枠
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

  // 3. レート制限 (scope='extract', 5 req/60s/IP — 抽出本体 = Anthropic 課金経路)
  const rate = await checkRequestRateLimit('extract', ip);
  if (!rate.allowed) {
    return jsonError('rate_limit', 429, {
      retryAfterSeconds: rate.retryAfterSeconds,
      headers: { 'Retry-After': String(rate.retryAfterSeconds) },
    });
  }

  // 4. リクエストボディ検証 (parseExtractRequest 純関数で runtime narrowing)
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

  // 5. API key 取得 (Workers Secret 経由、コードにハードコードしない)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // 環境変数名そのものを UI に出さない (攻撃者にスタック推定材料を与えない)。
    // 詳細はサーバーログにのみ残す。
    console.error('[/api/extract] ANTHROPIC_API_KEY is not configured');
    return jsonError('server_misconfigured', 500);
  }

  // 6. Anthropic 呼び出し (non-streaming + tool_use で構造化出力強制)
  // maxRetries: 0 で 429/5xx 時の SDK 自動リトライによる多重課金を防ぐ
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
            // strict: true で Anthropic 側が schema 完全準拠を保証する。
            // 2026-04-26 QA で 1 回 schema 違反 (subjective が invalid_type) を観測したため有効化。
            // SDK 0.90 でサポート済み (Tool.strict?: boolean)。
            strict: true,
          },
        ],
        // tool_choice で extract_soap を強制 → AI が必ず構造化出力を返す
        tool_choice: { type: 'tool', name: SOAP_TOOL_NAME },
        messages: [
          {
            role: 'user',
            content: `次の医療文書から SOAP 4 項目を抽出してください。\n\n---\n\n${documentText}`,
          },
        ],
      },
      {
        // クライアント切断時に SDK 呼び出しを即時中断、
        // 上流応答停滞時はタイムアウトで catch に流す。Anthropic SDK 0.90 の
        // RequestOptions.signal: AbortSignal、RequestOptions.timeout: number を使用。
        signal: req.signal,
        timeout: MAX_ANTHROPIC_TIMEOUT_MS,
      },
    );

    // 6. tool_use ブロック取得
    const toolUseBlock = message.content.find(
      (block) => block.type === 'tool_use' && block.name === SOAP_TOOL_NAME,
    );
    if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
      return jsonError('tool_use_missing', 502);
    }

    // 7. Zod 検証で AI 出力が SOAP スキーマに準拠するか機械的に確認
    const parsed = SOAPDataSchema.safeParse(toolUseBlock.input);
    if (!parsed.success) {
      // Zod issues (path / code) は内部詳細としてサーバーログにのみ残す。
      // UI には code のみ返却する。
      console.error('[/api/extract] SOAP schema violation:', parsed.error.issues);
      return jsonError('schema_violation', 502);
    }

    // 8. source_text が入力本文に存在する根拠文か検証
    // raw source_text はログに出さず、失敗フィールド名だけを残す。
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
    // クライアント切断由来は 499 相当扱い (Cloudflare 集計可)。
    // signal を SDK 呼び出しに渡しているため、abort 時は SDK 内で
    // AbortError を投げて即座に catch に流れる。req.signal.aborted 判定はそのまま。
    if (req.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    // タイムアウトを upstream_unavailable から分離して
    // upstream_timeout として返す。Anthropic SDK は timeout 時に
    // APIConnectionTimeoutError を投げる (公式 docs)。SDK の named export は
    // 環境差で取得しにくいため、constructor name と message で識別する。
    const errName = err instanceof Error ? err.constructor.name : '';
    const errMsg = err instanceof Error ? err.message : '';
    const isTimeout =
      errName === 'APIConnectionTimeoutError' ||
      /\btimeout\b/i.test(errMsg) ||
      /\btimed out\b/i.test(errMsg);
    if (isTimeout) {
      // タイムアウト発生をサーバーログに残す (上流応答時間の傾向把握用)。
      // raw message は UI に出さず、code 化したラベル (upstream_timeout) のみ返す。
      console.error('[/api/extract] upstream timeout:', err);
      return jsonError('upstream_timeout', 504);
    }
    // SDK 例外の生 message は UI に出さない。原因はサーバーログにのみ残す
    // (AI レスポンス本文や入力 documentText も含めない、患者情報漏洩防止)。
    console.error('[/api/extract] upstream error:', err);
    return jsonError('upstream_unavailable', 500);
  }
}
