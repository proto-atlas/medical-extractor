import type { Page } from '@playwright/test';

/**
 * E2E から /api/auth を route mock し、認証 OK を即座に返す。
 *
 * Why mock:
 *   - /api/auth と /api/extract は src/lib/rate-limit.ts の同一 IP-bucket
 *     (5 req/60s) を共有する。E2E では privacy / extract spec で複数回
 *     login が走るため、6 件目以降が 429 でフェイルする問題があった
 *     (ローカル next dev でプロセスが再利用される間 bucket が残るため)。
 *   - auth ロジックの正当性は src/app/api/auth/route.test.ts で完結検証済。
 *     E2E の意図は「認証通過後の UI フロー」なので auth レスポンスを
 *     mock して問題ない。
 *   - auth.spec.ts は実 /api/auth を見たいので **意図的に mock しない**
 *     (login 2 回で rate limit 内に収まる)。
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
 * /api/auth から 429 (rate_limit) を返す mock。PasswordGate の 429 表示テストで使う。
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
