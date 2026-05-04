import { expect, test } from '@playwright/test';
import { mockAuthRateLimited } from './helpers';

// playwright.config.ts の webServer.env で注入しているテスト専用キー。
// 本番や .env.local のキーとは独立している。
const E2E_PASSWORD = 'test-password-for-e2e';

test.describe('認証ゲート', () => {
  test('正しいアクセスキーを入力するとメインUIが表示される', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByPlaceholder('アクセスキー')).toBeVisible();

    await page.getByPlaceholder('アクセスキー').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: '開く' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'medical-extractor' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ログアウト' })).toBeVisible();
  });

  test('誤ったアクセスキーを入力するとエラー表示されメインUIには進めない', async ({ page }) => {
    await page.goto('/');

    await page.getByPlaceholder('アクセスキー').fill('wrong-password');
    await page.getByRole('button', { name: '開く' }).click();

    await expect(page.getByText('アクセスキーが正しくありません。')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ログアウト' })).not.toBeVisible();
  });

  test('アクセスキー未入力では送信ボタンが無効化されている', async ({ page }) => {
    await page.goto('/');

    const submit = page.getByRole('button', { name: '開く' });
    await expect(submit).toBeDisabled();

    await page.getByPlaceholder('アクセスキー').fill('x');
    await expect(submit).toBeEnabled();
  });
});

test.describe('認証ゲート: rate_limit エラー表示', () => {
  // 429 でも 401 と同じ文言に見えると原因が分からないため、専用文言を確認する。
  // 429 でも「アクセスキーが正しくありません」と出る旧挙動を改善し、
  // ERROR_LABELS の rate_limit ラベルが表示されることを確認する。
  test('429 を受けると専用文言が表示される', async ({ page }) => {
    await mockAuthRateLimited(page);
    await page.goto('/');

    await page.getByPlaceholder('アクセスキー').fill('any-key');
    await page.getByRole('button', { name: '開く' }).click();

    const alert = page.getByRole('alert').filter({ hasText: '短時間に多くのリクエスト' });
    await expect(alert).toBeVisible();
    // 401 文言は出ないことを確認 (429 と 401 を区別している証拠)
    await expect(page.getByText('アクセスキーが正しくありません。')).not.toBeVisible();
  });
});
