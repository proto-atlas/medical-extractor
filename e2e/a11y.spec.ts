import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockAuthOk } from './helpers';

/**
 * axe-coreによるa11y自動検査。
 *
 * WCAG 2.1 AA相当の自動検出可能な違反
 * (impact='critical' | 'serious') を 0 にすることを目標とする。
 *
 * Critical: スクリーンリーダーで完全に使えない、操作不能などのsevere障害。
 * Serious: 主要な障害があるが代替手段で操作可能。
 * Moderate / Minor: 望ましい改善だが阻害は少ない (本テストではfailさせない)。
 *
 * モック方針 (e2e/helpers.tsと整合):
 * - /api/authはmockAuthOkで 200 OK固定 (rate limitカスケード回避)
 * - /api/extractはSOAP結果テストでのみ 200 + mock SOAPを返す
 */

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
    text: 'う蝕C3 相当、歯髄炎',
    source_text: 'う蝕C3 相当、歯髄炎による疼痛と判断',
  },
  plan: {
    text: '次回根管治療予約、抗生剤処方',
    source_text: '次回根管治療予約 (1 週後)',
  },
};

interface AxeViolationLite {
  id: string;
  impact: string | null | undefined;
  help: string;
  nodes: { target: string; failureSummary?: string }[];
}

async function scanAndReport(page: Page): Promise<AxeViolationLite[]> {
  const results = await new AxeBuilder({ page })
    // Next.js dev overlay (`nextjs-portal` custom element) は本番に出ない要素のため除外
    .exclude('nextjs-portal')
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => ({
        target: Array.isArray(n.target) ? n.target.join(' >> ') : String(n.target),
        failureSummary: n.failureSummary ?? undefined,
      })),
    }));
}

test.describe('axe-core自動a11y検査', () => {
  test('login画面 (/) にcritical/serious違反なし', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByPlaceholder('アクセスキー')).toBeVisible();
    const blocking = await scanAndReport(page);
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test('プライバシーモーダル表示中にcritical/serious違反なし', async ({ page }) => {
    await mockAuthOk(page);
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.goto('/');
    await page.getByPlaceholder('アクセスキー').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: '開く' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const blocking = await scanAndReport(page);
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test('login + プライバシー同意済の空状態にcritical/serious違反なし', async ({ page }) => {
    await mockAuthOk(page);
    await page.goto('/');
    await page.evaluate(() =>
      window.localStorage.setItem('medical-extractor.privacy-acknowledged', '1'),
    );
    await page.goto('/');
    await page.getByPlaceholder('アクセスキー').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: '開く' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'medical-extractor' })).toBeVisible();
    const blocking = await scanAndReport(page);
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test('SOAP抽出結果画面 (4 カード表示) にcritical/serious違反なし', async ({ page }) => {
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
    await page.getByLabel('サンプル:').selectOption('dental');
    await page.getByRole('button', { name: 'SOAPを抽出する' }).click();
    await expect(page.getByText('右下奥歯の冷温水痛、1 週間前から自覚')).toBeVisible();
    const blocking = await scanAndReport(page);
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
