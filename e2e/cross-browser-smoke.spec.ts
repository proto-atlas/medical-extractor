import { expect, test, type Page } from '@playwright/test';
import { mockAuthOk } from './helpers';

const E2E_PASSWORD = 'test-password-for-e2e';

async function loginWithPrivacyAccepted(page: Page): Promise<void> {
  await mockAuthOk(page);
  await page.goto('/');
  await page.evaluate(() =>
    window.localStorage.setItem('medical-extractor.privacy-acknowledged', '1'),
  );
  await page.goto('/');
  await page.getByPlaceholder('アクセスキー').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: '開く' }).click();
}

test.describe('クロスブラウザ smoke', () => {
  test('認証後に安全境界の注意文と入力フォームが表示される', async ({ page }) => {
    await loginWithPrivacyAccepted(page);

    await expect(page.getByRole('heading', { level: 1, name: 'medical-extractor' })).toBeVisible();
    await expect(page.getByText('架空データ専用のデモです。')).toBeVisible();
    await expect(page.getByText('診断・治療・臨床判断には使用できません。')).toBeVisible();

    const textarea = page.getByLabel('医療文書テキスト入力');
    await expect(textarea).toBeVisible();
    await textarea.fill('架空の診療メモ。右下奥歯の冷温水痛で来院。');

    await expect(page.getByRole('button', { name: 'SOAP を抽出する' })).toBeEnabled();
  });
});
