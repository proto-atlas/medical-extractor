import { expect, test, type Page } from '@playwright/test';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mockAuthOk } from './helpers';

/**
 * README 用スクリーンショット取得スクリプト (Playwright Test 形式)。
 *
 * `npm run screenshots` (= `playwright test --project=screenshots`) で
 * 起動する専用 project。通常の chromium project (E2E 10 件) からは
 * playwright.config.ts の testIgnore で除外しているので、`npm run e2e`
 * のテスト件数には含まれない。
 *
 * 取得画像: docs/screenshots/{pc,sp}-{empty,result}.png の 4 枚
 *   - pc:  1280×800 viewport
 *   - sp:  393×852 viewport (iPhone 15 相当)
 *   - empty:  認証 + プライバシー同意済の空状態
 *   - result: サンプル「歯科」を選択 → 抽出ボタン後の SOAP 4 カード表示
 *
 * /api/auth と /api/extract は route mock。本番 deploy せずに撮れる
 * ようにし、Anthropic API 課金も発生させない。
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, '..', 'docs', 'screenshots');
const E2E_PASSWORD = 'test-password-for-e2e';

const MOCK_SOAP = {
  subjective: {
    text: '右下奥歯の冷温水痛、1 週間前から自覚',
    source_text: '右下奥歯の冷温水痛で来院',
  },
  objective: {
    text: '下顎右側 7 番に軽度動揺、根尖部透過像',
    source_text: '下顎右側 7 番に軽度の動揺',
  },
  assessment: {
    text: 'う蝕 C3 相当、歯髄炎',
    source_text: 'う蝕 C3 相当、歯髄炎による疼痛と判断',
  },
  plan: {
    text: '次回根管治療予約、抗生剤処方',
    source_text: '次回根管治療予約 (1 週後)',
  },
};

/**
 * Next.js 16 dev mode が描画する右下の Issues バッジ / dev tools オーバーレイを
 * README 用スクショから除外する。dev overlay は本番 (next build --webpack) には
 * 出ないため、製品としての見た目に含めるべきではない。
 *
 * 該当要素は `nextjs-portal` Custom Element として shadow DOM 経由で挿入される
 * (Next.js 16 系の dev tools 実装) ので、custom element 名を狙えば確実。
 */
const HIDE_DEV_OVERLAY_CSS = `
  nextjs-portal,
  [data-nextjs-toast],
  [data-nextjs-dev-tools-button],
  [data-nextjs-error-overlay] {
    display: none !important;
  }
`;

async function captureFlow(page: Page, prefix: string) {
  await mockAuthOk(page);
  await page.route('**/api/extract', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        soap: MOCK_SOAP,
        model: 'claude-haiku-4-5-20251001',
        usage: { input_tokens: 234, output_tokens: 156 },
      }),
    });
  });

  await page.goto('/');
  await page.evaluate(() =>
    window.localStorage.setItem('medical-extractor.privacy-acknowledged', '1'),
  );
  await page.goto('/');
  await page.getByPlaceholder('アクセスキー').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: '開く' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'medical-extractor' })).toBeVisible();
  // Next.js dev overlay を非表示にする (本番には出ない要素)
  await page.addStyleTag({ content: HIDE_DEV_OVERLAY_CSS });

  // 1) 認証直後の空状態
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${prefix}-empty.png`),
    fullPage: true,
  });

  // 2) サンプル「歯科」を選択 → 抽出 → SOAP 4 カード表示
  await page.getByLabel('サンプル:').selectOption('dental');
  await page.getByRole('button', { name: 'SOAP を抽出する' }).click();
  await expect(page.getByText('右下奥歯の冷温水痛、1 週間前から自覚')).toBeVisible();
  // 結果描画後に再度 dev overlay を非表示 (描画タイミングで再挿入されるケースに備える)
  await page.addStyleTag({ content: HIDE_DEV_OVERLAY_CSS });
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${prefix}-result.png`),
    fullPage: true,
  });
}

test.describe('README 用スクリーンショット', () => {
  test('PC (1280×800)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await captureFlow(page, 'pc');
  });

  test('SP (393×852, iPhone 15 相当)', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await captureFlow(page, 'sp');
  });
});
