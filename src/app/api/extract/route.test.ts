import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Anthropic SDK をモック (実 API を叩かない、テスト時の課金ゼロ)。
// `new Anthropic(...)` で呼ばれるため class 構文で mock しないと
// "is not a constructor" になる (SDK 0.90 仕様)。
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

// vi.mock の hoisting が確定してから route を import する
const { POST, parseExtractRequest } = await import('./route');

// API レスポンス body の最小限型定義 (テスト用)。
// no-unsafe-member-access を回避するため、json() の戻り値を unknown ではなくこの型で扱う。
type ApiBody = {
  error?: string;
  retryAfterSeconds?: number;
  soap?: unknown;
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  schemaIssues?: unknown;
  issues?: unknown;
};

async function readBody(res: Response): Promise<ApiBody> {
  return (await res.json()) as ApiBody;
}

function makeReq(
  opts: {
    auth?: string;
    ip?: string;
    body?: unknown;
    bodyText?: string;
  } = {},
): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (opts.auth !== undefined) headers.set('Authorization', opts.auth);
  if (opts.ip) headers.set('CF-Connecting-IP', opts.ip);
  const body =
    opts.bodyText !== undefined
      ? opts.bodyText
      : opts.body !== undefined
        ? JSON.stringify(opts.body)
        : undefined;
  return new NextRequest('http://localhost/api/extract', {
    method: 'POST',
    headers,
    body,
  });
}

const validSoap = {
  subjective: { text: '頭痛', source_text: '頭痛の訴えあり' },
  objective: { text: '体温 37.2', source_text: '体温 37.2 度' },
  assessment: { text: '感冒疑い', source_text: '感冒の疑い' },
  plan: { text: '経過観察', source_text: '経過観察' },
};

const validDocumentText = '頭痛の訴えあり。体温 37.2 度。感冒の疑い。経過観察。';

describe('/api/extract POST', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    vi.stubEnv('ACCESS_PASSWORD', 'correct-password');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    // 内部詳細露出抑止検証時に console.error が呼ばれるのでテスト出力を汚さないよう抑止
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('Authorization 欠如なら 401 + error: unauthorized + Anthropic は呼ばれない', async () => {
    const res = await POST(makeReq({ ip: '203.0.115.10', body: { documentText: '架空文書' } }));
    expect(res.status).toBe(401);
    const body = await readBody(res);
    expect(body.error).toBe('unauthorized');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rate limit (extract scope) を超えると 429 + error: rate_limit', async () => {
    const ip = '203.0.115.11';
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'extract_soap', input: validSoap }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    for (let i = 0; i < 5; i++) {
      await POST(
        makeReq({
          auth: 'Bearer correct-password',
          ip,
          body: { documentText: validDocumentText },
        }),
      );
    }
    const blocked = await POST(
      makeReq({
        auth: 'Bearer correct-password',
        ip,
        body: { documentText: validDocumentText },
      }),
    );
    expect(blocked.status).toBe(429);
    const body = await readBody(blocked);
    expect(body.error).toBe('rate_limit');
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('pre-auth limiter (extract-auth scope) が 11 回目で 429、Anthropic は呼ばれない', async () => {
    // /api/extract に不正 Bearer を 10 回まで許す (extract-auth は 10/60s)、
    // 11 回目で auth check に到達する前に 429 を返す。Anthropic SDK は一切叩かない。
    const ip = '203.0.115.40';
    for (let i = 0; i < 10; i++) {
      const res = await POST(
        makeReq({ auth: 'Bearer wrong', ip, body: { documentText: '架空文書' } }),
      );
      // 認証は通らないが pre-auth は通っているので 401 が返る
      expect(res.status).toBe(401);
    }
    const blocked = await POST(
      makeReq({ auth: 'Bearer wrong', ip, body: { documentText: '架空文書' } }),
    );
    expect(blocked.status).toBe(429);
    const body = await readBody(blocked);
    expect(body.error).toBe('rate_limit');
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    // pre-auth で蹴られた + auth で蹴られた両方の経路で Anthropic は呼ばれていない
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('extract-auth bucket と extract bucket は独立: pre-auth に空きがあっても extract が枠切れなら 429', async () => {
    // 認証成功 5 回で extract scope 上限到達。
    // pre-auth は 5/10 消費なのでまだ余裕があるが、それでも本体側で 429。
    const ip = '203.0.115.41';
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'extract_soap', input: validSoap }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    for (let i = 0; i < 5; i++) {
      const res = await POST(
        makeReq({
          auth: 'Bearer correct-password',
          ip,
          body: { documentText: validDocumentText },
        }),
      );
      expect(res.status).toBe(200);
    }
    const blocked = await POST(
      makeReq({
        auth: 'Bearer correct-password',
        ip,
        body: { documentText: validDocumentText },
      }),
    );
    expect(blocked.status).toBe(429);
    expect((await readBody(blocked)).error).toBe('rate_limit');
  });

  it('JSON が壊れていれば 400 + invalid_input', async () => {
    const res = await POST(
      makeReq({
        auth: 'Bearer correct-password',
        ip: '203.0.115.12',
        bodyText: '{not json',
      }),
    );
    expect(res.status).toBe(400);
    const body = await readBody(res);
    expect(body.error).toBe('invalid_input');
  });

  it('documentText が空なら 400 + invalid_input', async () => {
    const res = await POST(
      makeReq({
        auth: 'Bearer correct-password',
        ip: '203.0.115.13',
        body: { documentText: '' },
      }),
    );
    expect(res.status).toBe(400);
    const body = await readBody(res);
    expect(body.error).toBe('invalid_input');
  });

  it('documentText が 10001 文字なら 400 + document_too_long', async () => {
    const res = await POST(
      makeReq({
        auth: 'Bearer correct-password',
        ip: '203.0.115.14',
        body: { documentText: 'a'.repeat(10_001) },
      }),
    );
    expect(res.status).toBe(400);
    const body = await readBody(res);
    expect(body.error).toBe('document_too_long');
  });

  it('ANTHROPIC_API_KEY 不在なら 500 + server_misconfigured (環境変数名は露出しない)', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const res = await POST(
      makeReq({
        auth: 'Bearer correct-password',
        ip: '203.0.115.15',
        body: { documentText: '架空文書' },
      }),
    );
    expect(res.status).toBe(500);
    const body = await readBody(res);
    expect(body.error).toBe('server_misconfigured');
    // 環境変数名そのものが UI 側に漏れていないことを保証
    expect(JSON.stringify(body)).not.toContain('ANTHROPIC_API_KEY');
  });

  it('SDK が tool_use を返さないなら 502 + tool_use_missing', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'プレーンテキスト' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const res = await POST(
      makeReq({
        auth: 'Bearer correct-password',
        ip: '203.0.115.16',
        body: { documentText: '架空文書' },
      }),
    );
    expect(res.status).toBe(502);
    const body = await readBody(res);
    expect(body.error).toBe('tool_use_missing');
  });

  it('schema 違反なら 502 + schema_violation (Zod issues 詳細は露出しない)', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'extract_soap',
          input: { subjective: 'wrong-shape' },
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const res = await POST(
      makeReq({
        auth: 'Bearer correct-password',
        ip: '203.0.115.17',
        body: { documentText: '架空文書' },
      }),
    );
    expect(res.status).toBe(502);
    const body = await readBody(res);
    expect(body.error).toBe('schema_violation');
    // path / code 等の Zod 詳細が漏れていないことを保証
    expect(body.schemaIssues).toBeUndefined();
    expect(body.issues).toBeUndefined();
  });

  it('source_text が入力本文に含まれないなら 502 + source_text_mismatch', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'extract_soap',
          input: {
            ...validSoap,
            plan: { text: '追加検査', source_text: '原文に存在しない計画' },
          },
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const res = await POST(
      makeReq({
        auth: 'Bearer correct-password',
        ip: '203.0.115.52',
        body: { documentText: validDocumentText },
      }),
    );
    expect(res.status).toBe(502);
    const body = await readBody(res);
    expect(body.error).toBe('source_text_mismatch');
    expect(JSON.stringify(body)).not.toContain('原文に存在しない計画');
  });

  it('SDK 例外時は 500 + upstream_unavailable (生 message は露出しない)', async () => {
    mockCreate.mockRejectedValue(new Error('Anthropic 502 internal stack trace'));
    const res = await POST(
      makeReq({
        auth: 'Bearer correct-password',
        ip: '203.0.115.18',
        body: { documentText: '架空文書' },
      }),
    );
    expect(res.status).toBe(500);
    const body = await readBody(res);
    expect(body.error).toBe('upstream_unavailable');
    expect(JSON.stringify(body)).not.toContain('Anthropic 502 internal');
  });

  it('正常系: tool_use + Zod pass で 200 + soap データ + model + usage', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'extract_soap', input: validSoap }],
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
      },
    });
    const res = await POST(
      makeReq({
        auth: 'Bearer correct-password',
        ip: '203.0.115.19',
        body: { documentText: validDocumentText },
      }),
    );
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.soap).toEqual(validSoap);
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.usage?.input_tokens).toBe(100);
    expect(body.usage?.output_tokens).toBe(50);
  });

  it('Anthropic timeout (APIConnectionTimeoutError 相当) なら 504 + upstream_timeout', async () => {
    // 上流応答停滞時は upstream_unavailable から分離して
    // upstream_timeout を返し、UI ラベル「AI サービスの応答がタイムアウト
    // しました。」が出る経路を確保する。
    class APIConnectionTimeoutError extends Error {
      constructor() {
        super('Request timed out');
        this.name = 'APIConnectionTimeoutError';
      }
    }
    mockCreate.mockRejectedValue(new APIConnectionTimeoutError());
    const res = await POST(
      makeReq({
        auth: 'Bearer correct-password',
        ip: '203.0.115.50',
        body: { documentText: '架空文書' },
      }),
    );
    expect(res.status).toBe(504);
    const body = await readBody(res);
    expect(body.error).toBe('upstream_timeout');
  });

  it('クライアント切断 (req.signal.aborted) なら 499、Anthropic upstream_unavailable に分類しない', async () => {
    // SDK 呼び出しに signal を渡したため、abort 時は SDK が
    // AbortError を throw → catch で req.signal.aborted を見て 499 を返す。
    // 既存挙動を保つ確認テスト。
    const controller = new AbortController();
    controller.abort();
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.set('Authorization', 'Bearer correct-password');
    headers.set('CF-Connecting-IP', '203.0.115.51');
    const req = new NextRequest('http://localhost/api/extract', {
      method: 'POST',
      headers,
      body: JSON.stringify({ documentText: '架空文書' }),
      signal: controller.signal,
    });
    mockCreate.mockRejectedValue(new Error('aborted'));
    const res = await POST(req);
    expect(res.status).toBe(499);
  });
});

describe('parseExtractRequest (純関数)', () => {
  it('正常な documentText を ok: true で返す', () => {
    const result = parseExtractRequest({ documentText: '架空文書' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.documentText).toBe('架空文書');
  });

  it('前後空白を trim する', () => {
    const result = parseExtractRequest({ documentText: ' 架空文書 ' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.documentText).toBe('架空文書');
  });

  it('null は invalid_input', () => {
    expect(parseExtractRequest(null)).toEqual({ ok: false, error: 'invalid_input' });
  });

  it('object 以外 (string / number / array) は invalid_input', () => {
    expect(parseExtractRequest('string')).toEqual({ ok: false, error: 'invalid_input' });
    expect(parseExtractRequest(123)).toEqual({ ok: false, error: 'invalid_input' });
    // 配列は object なのでフォーマット的には通るが、documentText が string でない => invalid_input
    expect(parseExtractRequest([])).toEqual({ ok: false, error: 'invalid_input' });
  });

  it('documentText が文字列でないなら invalid_input', () => {
    expect(parseExtractRequest({ documentText: 123 })).toEqual({
      ok: false,
      error: 'invalid_input',
    });
    expect(parseExtractRequest({ documentText: null })).toEqual({
      ok: false,
      error: 'invalid_input',
    });
  });

  it('空文字 / 空白のみは invalid_input', () => {
    expect(parseExtractRequest({ documentText: '' })).toEqual({
      ok: false,
      error: 'invalid_input',
    });
    expect(parseExtractRequest({ documentText: ' ' })).toEqual({
      ok: false,
      error: 'invalid_input',
    });
  });

  it('上限超 (10001 文字) は document_too_long', () => {
    const result = parseExtractRequest({ documentText: 'a'.repeat(10_001) });
    expect(result).toEqual({ ok: false, error: 'document_too_long' });
  });

  it('上限ぎりぎり (10000 文字) は ok', () => {
    const result = parseExtractRequest({ documentText: 'a'.repeat(10_000) });
    expect(result.ok).toBe(true);
  });

  it('maxLength を引数で上書きできる', () => {
    const result = parseExtractRequest({ documentText: 'a'.repeat(101) }, 100);
    expect(result).toEqual({ ok: false, error: 'document_too_long' });
  });
});
