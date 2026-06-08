import { expect, test, type Page } from '@playwright/test';
import { mockAuthOk } from './helpers';

/**
 * WCAG 2.5.5 (Level AAA) / WCAG 2.2 2.5.8 (Level AA) target-size検査。
 *
 * 主要操作だけでなくinteractive要素全体を対象にする。
 *
 * - WCAG 2.5.8 AA: 24×24 CSS px以上 (例外: inline text link等)
 * - WCAG 2.5.5 AAA: 44×44 CSS px以上
 *
 * 本リポは「主要操作buttonは 44px厳守、その他visible interactive要素は 24px以上」を方針。
 * (`docs/DESIGN-DECISIONS.md` のアクセシビリティ方針と整合)
 *
 * 計測対象:
 * - button
 * - a[href] (ただしinline text linkはspacing例外として除外)
 * - input (ただしtype=hidden / type=passwordはUA制御で除外)
 * - select / textarea
 * - [role=button] / [role=link]
 *
 * 計測対象外:
 * - Next.js dev overlay (`nextjs-portal` Custom Element): 本番に出ない要素
 * - input[type=hidden]: 不可視
 * - input[type=password]: autofill等でUA側のサイズ調整が入る、本番動作と乖離
 * - inline text link (`a[href]` で `closest('p, li')` 内): WCAG 2.5.8 spacing例外
 */

const E2E_PASSWORD = 'test-password-for-e2e';
const WCAG_AA_MIN = 24;
const WCAG_AAA_MIN = 44;

interface ElementSize {
  label: string;
  selector: string;
  role: string;
  width: number;
  height: number;
}

async function measureVisibleInteractives(page: Page): Promise<ElementSize[]> {
  return await page.evaluate(() => {
    const isVisible = (el: Element): boolean => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    const isInsideDevOverlay = (el: Element): boolean => {
      let cur: Element | null = el;
      while (cur) {
        const tag = cur.tagName?.toLowerCase();
        if (
          tag === 'nextjs-portal' ||
          (tag && tag.startsWith('nextjs-')) ||
          cur.getAttribute?.('data-nextjs-toast') !== null ||
          cur.getAttribute?.('data-nextjs-dev-tools-button') !== null
        ) {
          return true;
        }
        cur = cur.parentElement;
      }
      return false;
    };
    const isInlineTextLink = (el: Element): boolean => {
      // a[href] でclosest('p, li') 内のものはinline link例外として除外。
      // 本リポの主要a[href] (フッターのライセンスリンク等) はp / li内に置かれない設計。
      if (el.tagName?.toLowerCase() !== 'a') return false;
      const inFlow = el.closest('p, li');
      return inFlow !== null;
    };
    const isExcludedInput = (el: Element): boolean => {
      if (el.tagName?.toLowerCase() !== 'input') return false;
      const type = (el.getAttribute('type') ?? 'text').toLowerCase();
      return type === 'hidden' || type === 'password';
    };

    const SELECTOR = 'button, a[href], input, select, textarea, [role="button"], [role="link"]';
    const elements = Array.from(document.querySelectorAll(SELECTOR));
    const out: ElementSize[] = [];

    for (const el of elements) {
      if (!isVisible(el)) continue;
      if (isInsideDevOverlay(el)) continue;
      if (isExcludedInput(el)) continue;
      if (isInlineTextLink(el)) continue;

      const rect = el.getBoundingClientRect();
      const tag = el.tagName?.toLowerCase() ?? '';
      const role = el.getAttribute('role') ?? tag;
      const text = (el.textContent ?? '').trim().slice(0, 30);
      const aria = el.getAttribute('aria-label') ?? '';
      const placeholder = el.getAttribute('placeholder') ?? '';
      const label = text || aria || placeholder || `(${tag})`;
      // selector化: idがあればそれ、なければタグ + role + size summary
      const id = el.getAttribute('id');
      const selector = id ? `#${id}` : `${tag}[${role}]`;

      out.push({
        label,
        selector,
        role,
        width: rect.width,
        height: rect.height,
      });
    }
    return out;
  });
}

function aaViolations(sizes: ElementSize[]): ElementSize[] {
  return sizes.filter((s) => Math.min(s.width, s.height) < WCAG_AA_MIN);
}

test.describe('target-size (WCAG 2.5.5 AAA / 2.2 2.5.8 AA)', () => {
  test('login画面: visible interactive要素 (button + a + input + select等) がWCAG AA (24px) を満たす', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByPlaceholder('アクセスキー')).toBeVisible();
    const sizes = await measureVisibleInteractives(page);
    expect(sizes.length).toBeGreaterThan(0);
    const violations = aaViolations(sizes);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('メイン画面 (login + 同意済): 全visible interactive要素がWCAG AA (24px) を満たす', async ({
    page,
  }) => {
    await mockAuthOk(page);
    await page.goto('/');
    await page.evaluate(() =>
      window.localStorage.setItem('medical-extractor.privacy-acknowledged', '1'),
    );
    await page.goto('/');
    await page.getByPlaceholder('アクセスキー').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: '開く' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'medical-extractor' })).toBeVisible();
    const sizes = await measureVisibleInteractives(page);
    expect(sizes.length).toBeGreaterThan(0);
    const violations = aaViolations(sizes);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('主要操作button (開く / SOAP抽出する / ログアウト) がWCAG AAA (44px) を満たす', async ({
    page,
  }) => {
    await mockAuthOk(page);
    await page.goto('/');
    await page.evaluate(() =>
      window.localStorage.setItem('medical-extractor.privacy-acknowledged', '1'),
    );
    await page.goto('/');

    const openBtn = page.getByRole('button', { name: '開く' });
    await page.getByPlaceholder('アクセスキー').fill(E2E_PASSWORD);
    const openBox = await openBtn.boundingBox();
    expect(openBox).not.toBeNull();
    expect(Math.min(openBox!.width, openBox!.height)).toBeGreaterThanOrEqual(WCAG_AAA_MIN);

    await openBtn.click();
    await expect(page.getByRole('heading', { level: 1, name: 'medical-extractor' })).toBeVisible();

    const extractBtn = page.getByRole('button', { name: 'SOAPを抽出する' });
    const extractBox = await extractBtn.boundingBox();
    expect(extractBox).not.toBeNull();
    expect(Math.min(extractBox!.width, extractBox!.height)).toBeGreaterThanOrEqual(WCAG_AAA_MIN);

    const logoutBtn = page.getByRole('button', { name: 'ログアウト' });
    const logoutBox = await logoutBtn.boundingBox();
    expect(logoutBox).not.toBeNull();
    expect(Math.min(logoutBox!.width, logoutBox!.height)).toBeGreaterThanOrEqual(WCAG_AAA_MIN);
  });
});
