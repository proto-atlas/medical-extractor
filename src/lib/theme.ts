/**
 * テーマ切替のヘルパー。
 * 3 モード: 'light' | 'dark' | 'system'（systemはOSのprefers-color-scheme追従）。
 * 実体は <html class="dark"> の付け外しで、Tailwind v4 の @custom-variant darkと連動。
 * ちらつき防止の初期化はlayout.tsxのinline scriptが担当する。
 */

export const THEME_KEY = 'medical-extractor.theme';

export type Theme = 'light' | 'dark' | 'system';

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

export function applyTheme(resolved: 'light' | 'dark'): void {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // SSR / プライベートブラウズ等でlocalStorage不可のケースはsystemにフォールバック
  }
  return 'system';
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // 保存できなくても機能は動く
  }
}
