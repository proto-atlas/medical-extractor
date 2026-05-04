import { expect, test, type Page } from '@playwright/test';
import { mockAuthOk } from './helpers';

/**
 * WCAG 2.5.5 (Level AAA) / WCAG 2.2 2.5.8 (Level AA) target-size 検査。
 *
 * 主要操作だけでなく interactive 要素全体を対象にする。
 *
 * - WCAG 2.5.8 AA: 24×24 CSS px 以上 (例外: inline text link 等)
 * - WCAG 2.5.5 AAA: 44×44 CSS px 以上
 *
 * 本リポは「主要操作 button は 44px 厳守、その他 visible interactive 要素は 24px 以上」を方針。
 * (`docs/DESIGN-DECISIONS.md` のアクセシビリティ方針と整合)
 *
 * 計測対象:
 * - button
 * - a[href] (ただし inline text link は spacing 例外として除外)
 * - input (ただし type=hidden / type=password は UA 制御で除外)
 * - select / textarea
 * - [role=button] / [role=link]
 *
 * 計測対象外:
 * - Next.js dev overlay (`nextjs-portal` Custom Element) — 本番に出ない要素
 * - input[type=hidden] — 不可視
 * - input[type=password] — autofill 等で UA 側のサイズ調整が入る、本番動作と乖離
 * - inline text link (`a[href]` で `closest('p, li')` 内) — WCAG 2.5.8 spacing 例外
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
      // a[href] で closest('p, li') 内のものは inline link 例外として除外。
      // 本リポの主要 a[href] (フッターのライセンスリンク等) は p / li 内に置かれない設計。
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
      // selector 化: id があればそれ、なければタグ + role + size summary
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
  test('login 画面: visible interactive 要素 (button + a + input + select 等) が WCAG AA (24px) を満たす', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByPlaceholder('アクセスキー')).toBeVisible();
    const sizes = await measureVisibleInteractives(page);
    expect(sizes.length).toBeGreaterThan(0);
    const violations = aaViolations(sizes);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('メイン画面 (login + 同意済): 全 visible interactive 要素が WCAG AA (24px) を満たす', async ({
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

  test('主要操作 button (開く / SOAP 抽出する / ログアウト) が WCAG AAA (44px) を満たす', async ({
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

    const extractBtn = page.getByRole('button', { name: 'SOAP を抽出する' });
    const extractBox = await extractBtn.boundingBox();
    expect(extractBox).not.toBeNull();
    expect(Math.min(extractBox!.width, extractBox!.height)).toBeGreaterThanOrEqual(WCAG_AAA_MIN);

    const logoutBtn = page.getByRole('button', { name: 'ログアウト' });
    const logoutBox = await logoutBtn.boundingBox();
    expect(logoutBox).not.toBeNull();
    expect(Math.min(logoutBox!.width, logoutBox!.height)).toBeGreaterThanOrEqual(WCAG_AAA_MIN);
  });
});
