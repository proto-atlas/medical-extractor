import { expect, test, type Page } from '@playwright/test';
import { mockAuthOk } from './helpers';

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

async function loginAndAcknowledge(page: Page) {
  // /api/auth は rate-limit bucket を /api/extract と共有しているため、E2E で
  // 複数回 login すると 429 を引いてしまう。意図は「認証後の SOAP 抽出フロー」
  // なので auth レスポンスを mock する (理由詳細は e2e/helpers.ts)。
  await mockAuthOk(page);
  await page.goto('/');
  await page.evaluate(() =>
    window.localStorage.setItem('medical-extractor.privacy-acknowledged', '1'),
  );
  await page.goto('/');
  await page.getByPlaceholder('アクセスキー').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: '開く' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'medical-extractor' })).toBeVisible();
}

test.describe('SOAP 抽出フロー', () => {
  test('サンプル選択 → SOAP 抽出 → 4 カード + エクスポートボタン表示', async ({ page }) => {
    // /api/extract を route() でモックして AI への実際の課金を避ける
    await page.route('**/api/extract', async (route) => {
      const request = route.request();
      // Authorization ヘッダが付いていることを確認 (Bearer + テスト用パスワード)
      expect(request.headers()['authorization']).toBe(`Bearer ${E2E_PASSWORD}`);
      const body = (await request.postDataJSON()) as { documentText?: string };
      expect(body.documentText).toBeTruthy();

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

    await loginAndAcknowledge(page);

    // サンプル「歯科」を選択
    await page.getByLabel('サンプル:').selectOption('dental');

    // 抽出ボタン押下
    await page.getByRole('button', { name: 'SOAP を抽出する' }).click();

    // 4 カード表示確認
    await expect(page.getByRole('heading', { name: /Subjective/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Objective/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Assessment/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Plan/ })).toBeVisible();

    // モック応答の text が反映されている (source_text と部分一致しないユニーク文字列だけ assert)
    await expect(page.getByText('右下奥歯の冷温水痛、1 週間前から自覚')).toBeVisible();
    await expect(page.getByText('下顎右側 7 番に軽度動揺、根尖部透過像')).toBeVisible();

    // エクスポートボタン群 (JSON / CSV / MD) が表示
    await expect(page.getByRole('button', { name: 'JSON' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'CSV' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'MD' })).toBeVisible();
  });

  test('JSON エクスポートボタンクリックでダウンロードイベントが発生する', async ({ page }) => {
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

    await loginAndAcknowledge(page);
    await page.getByLabel('サンプル:').selectOption('dental');
    await page.getByRole('button', { name: 'SOAP を抽出する' }).click();
    await expect(page.getByRole('heading', { name: /Subjective/ })).toBeVisible();

    // JSON ダウンロードイベントを待ち受けてからクリック
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'JSON' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('soap-extraction.json');
  });

  test('429 レスポンスは ExtractErrorCode を日本語ラベルに変換して表示される', async ({ page }) => {
    // /api/extract は ExtractErrorCode 設計に統一済 (src/lib/types.ts)。
    // 旧形式 `{ error: "Rate limit exceeded..." }` は廃止され、
    // `{ error: 'rate_limit', retryAfterSeconds }` を ERROR_LABELS で
    // 日本語に変換して UI に出すようになっている (src/lib/error-labels.ts)。
    await page.route('**/api/extract', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        headers: { 'Retry-After': '30' },
        body: JSON.stringify({ error: 'rate_limit', retryAfterSeconds: 30 }),
      });
    });

    await loginAndAcknowledge(page);
    await page.getByLabel('サンプル:').selectOption('internal');
    await page.getByRole('button', { name: 'SOAP を抽出する' }).click();

    // role=alert で日本語ラベル (error-labels.ts の rate_limit エントリ) が出る
    const alert = page.getByRole('alert').filter({ hasText: '短時間に多くのリクエスト' });
    await expect(alert).toBeVisible();
  });

  test('個人情報らしき文字列ではbest-effort警告と確認チェックが必要になる', async ({ page }) => {
    await loginAndAcknowledge(page);

    await page
      .getByLabel('医療文書テキスト入力')
      .fill('架空患者メモ。連絡先 test@example.com。右下奥歯の冷温水痛で来院。');

    await expect(
      page.getByText('個人情報らしき文字列が含まれている可能性があります。'),
    ).toBeVisible();
    const submit = page.getByRole('button', { name: 'SOAP を抽出する' });
    await expect(submit).toBeDisabled();

    await page.getByLabel('これは架空データであり、実患者情報ではないことを確認しました。').check();
    await expect(submit).toBeEnabled();
  });
});
