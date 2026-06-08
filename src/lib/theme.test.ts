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
    it('lightを渡したらlightを返す', () => {
      expect(resolveTheme('light')).toBe('light');
    });

    it('darkを渡したらdarkを返す', () => {
      expect(resolveTheme('dark')).toBe('dark');
    });

    it('system + prefers-color-scheme: darkならdarkを返す', () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue(makeMqlMock(true));
      expect(resolveTheme('system')).toBe('dark');
    });

    it('system + prefers-color-scheme: lightならlightを返す', () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue(makeMqlMock(false));
      expect(resolveTheme('system')).toBe('light');
    });
  });

  describe('applyTheme', () => {
    it('darkを渡すとhtmlにdarkクラスが付く', () => {
      applyTheme('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('lightを渡すとhtmlからdarkクラスが取れる', () => {
      document.documentElement.classList.add('dark');
      applyTheme('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  describe('getStoredTheme', () => {
    it('未保存ならsystemにフォールバック', () => {
      expect(getStoredTheme()).toBe('system');
    });

    it('保存値がlightならlightを返す', () => {
      localStorage.setItem(THEME_KEY, 'light');
      expect(getStoredTheme()).toBe('light');
    });

    it('保存値がdarkならdarkを返す', () => {
      localStorage.setItem(THEME_KEY, 'dark');
      expect(getStoredTheme()).toBe('dark');
    });

    it('保存値がsystemならsystemを返す', () => {
      localStorage.setItem(THEME_KEY, 'system');
      expect(getStoredTheme()).toBe('system');
    });

    it('保存値が不正な文字列ならsystemにフォールバック', () => {
      localStorage.setItem(THEME_KEY, 'pink');
      expect(getStoredTheme()).toBe('system');
    });
  });

  describe('storeTheme', () => {
    it('localStorageに保存される', () => {
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
