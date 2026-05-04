// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { applyTheme, getStoredTheme, resolveTheme, storeTheme, THEME_KEY } from './theme';

function makeMqlMock(matches: boolean): MediaQueryList {
  return {
    matches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
    addListener: () => {},
    removeListener: () => {},
  } as MediaQueryList;
}

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    vi.restoreAllMocks();
  });

  describe('resolveTheme', () => {
    it('light を渡したら light を返す', () => {
      expect(resolveTheme('light')).toBe('light');
    });

    it('dark を渡したら dark を返す', () => {
      expect(resolveTheme('dark')).toBe('dark');
    });

    it('system + prefers-color-scheme: dark なら dark を返す', () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue(makeMqlMock(true));
      expect(resolveTheme('system')).toBe('dark');
    });

    it('system + prefers-color-scheme: light なら light を返す', () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue(makeMqlMock(false));
      expect(resolveTheme('system')).toBe('light');
    });
  });

  describe('applyTheme', () => {
    it('dark を渡すと html に dark クラスが付く', () => {
      applyTheme('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('light を渡すと html から dark クラスが取れる', () => {
      document.documentElement.classList.add('dark');
      applyTheme('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  describe('getStoredTheme', () => {
    it('未保存なら system にフォールバック', () => {
      expect(getStoredTheme()).toBe('system');
    });

    it('保存値が light なら light を返す', () => {
      localStorage.setItem(THEME_KEY, 'light');
      expect(getStoredTheme()).toBe('light');
    });

    it('保存値が dark なら dark を返す', () => {
      localStorage.setItem(THEME_KEY, 'dark');
      expect(getStoredTheme()).toBe('dark');
    });

    it('保存値が system なら system を返す', () => {
      localStorage.setItem(THEME_KEY, 'system');
      expect(getStoredTheme()).toBe('system');
    });

    it('保存値が不正な文字列なら system にフォールバック', () => {
      localStorage.setItem(THEME_KEY, 'pink');
      expect(getStoredTheme()).toBe('system');
    });
  });

  describe('storeTheme', () => {
    it('localStorage に保存される', () => {
      storeTheme('dark');
      expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    });

    it('保存値を上書きできる', () => {
      storeTheme('light');
      storeTheme('dark');
      expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    });
  });
});
