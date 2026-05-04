import { expect, test, type Page } from '@playwright/test';
import { mockAuthOk } from './helpers';

const E2E_PASSWORD = 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/');
  await page.getByPlaceholder('アクセスキー').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: '開く' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'medical-extractor' })).toBeVisible();
}

test.describe('プライバシー警告モーダル', () => {
  test.beforeEach(async ({ page }) => {
    // /api/auth は /api/extract と rate-limit bucket を共有しているため、本ファイル
    // で複数テストの login を重ねると 429 で認証失敗 → モーダルが出ない、という
    // カスケード fail を起こす。privacy のテスト意図は「認証通過後のモーダル挙動」
    // なので auth レスポンスを mock する (理由詳細は e2e/helpers.ts)。
    await mockAuthOk(page);
    // 各テストは未同意状態から開始する。localStorage を確実にクリアするため、
    // navigator API が使える状態で goto してから clear する。
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
  });

  test('認証通過後にプライバシーモーダルが表示される (role=dialog / aria-modal)', async ({
    page,
  }) => {
    await login(page);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(
      dialog.getByRole('heading', { name: 'プライバシーに関する重要な注意' }),
    ).toBeVisible();
  });

  test('「理解しました」クリックでモーダルが閉じ、localStorage に同意が保存される', async ({
    page,
  }) => {
    await login(page);

    await page.getByRole('button', { name: '理解しました' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    const stored = await page.evaluate(() =>
      window.localStorage.getItem('medical-extractor.privacy-acknowledged'),
    );
    expect(stored).toBe('1');
  });

  test('localStorage に同意済みフラグがあればモーダルは表示されない', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() =>
      window.localStorage.setItem('medical-extractor.privacy-acknowledged', '1'),
    );

    await login(page);
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
