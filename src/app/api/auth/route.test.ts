import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

// API レスポンス body の最小限型 (no-unsafe-member-access 回避)
type ApiBody = {
  ok?: boolean;
  error?: string;
  retryAfterSeconds?: number;
};

async function readBody(res: Response): Promise<ApiBody> {
  return (await res.json()) as ApiBody;
}

function makeReq(opts: { auth?: string; ip?: string } = {}): NextRequest {
  const headers = new Headers();
  if (opts.auth !== undefined) headers.set('Authorization', opts.auth);
  if (opts.ip) headers.set('CF-Connecting-IP', opts.ip);
  return new NextRequest('http://localhost/api/auth', {
    method: 'POST',
    headers,
  });
}

describe('/api/auth POST', () => {
  beforeEach(() => {
    vi.stubEnv('ACCESS_PASSWORD', 'correct-password-xyz');
  });

  it('正しいパスワードなら 200 + { ok: true }', async () => {
    const res = await POST(makeReq({ auth: 'Bearer correct-password-xyz', ip: '203.0.113.20' }));
    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ ok: true });
  });

  it('間違ったパスワードなら 401 + ApiErrorResponse { error: unauthorized }', async () => {
    const res = await POST(makeReq({ auth: 'Bearer wrong', ip: '203.0.113.21' }));
    expect(res.status).toBe(401);
    expect(await readBody(res)).toEqual({ error: 'unauthorized' });
  });

  it('Authorization ヘッダなしなら 401 + ApiErrorResponse { error: unauthorized }', async () => {
    const res = await POST(makeReq({ ip: '203.0.113.22' }));
    expect(res.status).toBe(401);
    expect(await readBody(res)).toEqual({ error: 'unauthorized' });
  });

  it('5 回成功 + 6 回目は 429 + Retry-After ヘッダ + retryAfterSeconds', async () => {
    const ip = '203.0.113.23';
    for (let i = 0; i < 5; i++) {
      const ok = await POST(makeReq({ auth: 'Bearer correct-password-xyz', ip }));
      expect(ok.status).toBe(200);
    }
    const blocked = await POST(makeReq({ auth: 'Bearer correct-password-xyz', ip }));
    expect(blocked.status).toBe(429);
    const body = await readBody(blocked);
    expect(body.error).toBe('rate_limit');
    expect(body.retryAfterSeconds).toBeDefined();
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
  });

  it('rate limit は認証より先に評価される (誤パス連打でも 429 が先)', async () => {
    const ip = '203.0.113.24';
    for (let i = 0; i < 5; i++) {
      await POST(makeReq({ auth: 'Bearer wrong', ip }));
    }
    const blocked = await POST(makeReq({ auth: 'Bearer correct-password-xyz', ip }));
    expect(blocked.status).toBe(429);
  });
});
