import type { NextRequest } from 'next/server';
import { checkAccess } from '@/lib/auth';
import { checkRequestRateLimit, getClientIp } from '@/lib/rate-limit';
import type { ApiErrorResponse } from '@/lib/types';

/**
 * 画面表示前にアクセスキーを確認する軽量エンドポイント。
 * 無効なアクセスキーで一瞬だけメイン画面が見える状態を避ける。
 *
 * Anthropicは呼ばず、トークンも消費しない。
 *
 * Rate limit: IP単位で /api/authの総リクエスト数を強めに制限する。
 * auth endpointの総当たり耐性を補強する。
 * 共有秘密の総当たり耐性としてOWASP Authentication Cheat Sheet推奨に従う。
 * 認証前にrate limitを回すことで「正解パスワードを偶然引けるまで叩く」攻撃を抑止する
 * (タイミング攻撃の窓を狭める副次効果も狙う)。
 */
export async function POST(req: NextRequest): Promise<Response> {
  // 1. IP rate limit (認証前): 共有秘密の総当たり防止
  // scope='auth' で /api/extract本体のbucketと分離。これにより、ログイン確認が抽出APIの枠を
  // 消費しない、かつ抽出側のcredential連打がauthの枠を消費しない。
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
