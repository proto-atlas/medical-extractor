import type { Page } from '@playwright/test';

/**
 * E2Eから /api/authをroute mockし、認証OKを即座に返す。
 *
 * Why mock:
 *   - /api/authと /api/extractはsrc/lib/rate-limit.tsの同一IP-bucket
 *     (5 req/60s) を共有する。E2Eではprivacy / extract specで複数回
 *     loginが走るため、6 件目以降が 429 でフェイルする問題があった
 *     (ローカルnext devでプロセスが再利用される間bucketが残るため)。
 *   - authロジックの正当性はsrc/app/api/auth/route.test.tsで完結検証済。
 *     E2Eの意図は「認証通過後のUIフロー」なのでauthレスポンスを
 *     mockして問題ない。
 *   - auth.spec.tsは実 /api/authを見たいので **意図的にmockしない**
 *     (login 2 回でrate limit内に収まる)。
 */
export async function mockAuthOk(page: Page): Promise<void> {
  await page.route('**/api/auth', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
}

/**
 * /api/authから 429 (rate_limit) を返すmock。PasswordGateの 429 表示テストで使う。
 */
export async function mockAuthRateLimited(page: Page, retryAfterSeconds = 30): Promise<void> {
  await page.route('**/api/auth', async (route) => {
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      headers: { 'Retry-After': String(retryAfterSeconds) },
      body: JSON.stringify({ error: 'rate_limit', retryAfterSeconds }),
    });
  });
}
