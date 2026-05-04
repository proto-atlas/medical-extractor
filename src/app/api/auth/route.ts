import type { NextRequest } from 'next/server';
import { checkAccess } from '@/lib/auth';
import { checkRequestRateLimit, getClientIp } from '@/lib/rate-limit';
import type { ApiErrorResponse } from '@/lib/types';

/**
 * Lightweight password validation endpoint.
 * Used by the PasswordGate to verify the password before unlocking the main UI,
 * so users don't briefly see the app with an invalid password.
 *
 * Does not call Anthropic, does not consume any tokens.
 *
 * Rate limit: aggressive total-request throttling on /api/auth keyed by IP.
 * auth endpoint の総当たり耐性を補強する。
 * 共有秘密の総当たり耐性として OWASP Authentication Cheat Sheet 推奨に従う。
 * 認証前に rate limit を回すことで「正解パスワードを偶然引けるまで叩く」攻撃を抑止する
 * (タイミング攻撃の窓を狭める副次効果も狙う)。
 */
export async function POST(req: NextRequest): Promise<Response> {
  // 1. IP rate limit (認証前) — 共有秘密の総当たり防止
  // scope='auth' で /api/extract 本体の bucket と分離。これにより、ログイン確認が抽出 API の枠を
  // 消費しない、かつ抽出側の credential 連打が auth の枠を消費しない。
  const ip = getClientIp(req);
  const rate = await checkRequestRateLimit('auth', ip);
  if (!rate.allowed) {
    const body: ApiErrorResponse = {
      error: 'rate_limit',
      retryAfterSeconds: rate.retryAfterSeconds,
    };
    return Response.json(body, {
      status: 429,
      headers: { 'Retry-After': String(rate.retryAfterSeconds) },
    });
  }

  // 2. アクセスキー検証
  const expectedPassword = process.env.ACCESS_PASSWORD;
  if (!checkAccess(req.headers.get('Authorization'), expectedPassword)) {
    const body: ApiErrorResponse = { error: 'unauthorized' };
    return Response.json(body, { status: 401 });
  }
  return Response.json({ ok: true });
}
