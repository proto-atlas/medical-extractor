'use client';

import { useEffect, useState } from 'react';
import { applyTheme, getStoredTheme, resolveTheme, storeTheme, type Theme } from '@/lib/theme';

const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: 'light', label: 'ライト', icon: '☀' },
  { value: 'system', label: '自動', icon: '◐' },
  { value: 'dark', label: 'ダーク', icon: '☾' },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getStoredTheme());
    setMounted(true);
  }, []);

  // system 選択時は OS の prefers-color-scheme 変更に追従する
  useEffect(() => {
    if (!mounted || theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'dark' : 'light');
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme, mounted]);

  function handleChange(next: Theme) {
    setTheme(next);
    storeTheme(next);
    applyTheme(resolveTheme(next));
  }

  // mount 前は SSR と CSR の差異で button の aria-pressed が不一致になるため描画しない。
  // h-12 は実体 (button min-h-11 + wrapper p-0.5 上下 + border 1px) とほぼ一致させ、
  // mount 前後のレイアウトシフトを抑える。
  if (!mounted) {
    return <div aria-hidden className="h-12 w-[200px]" />;
  }

  return (
    <div
      role="group"
      aria-label="テーマ切替"
      className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5 text-xs dark:border-slate-800 dark:bg-slate-900"
    >
      {OPTIONS.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleChange(opt.value)}
            aria-pressed={active}
            className={
              // min-h-11 で WCAG 2.5.5 (AAA) / WCAG 2.2 2.5.8 (AA) のボタン単体 44px target
              // を担保する。
              'inline-flex min-h-11 items-center justify-center rounded px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ' +
              (active
                ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100')
            }
          >
            <span aria-hidden className="mr-1">
              {opt.icon}
            </span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
