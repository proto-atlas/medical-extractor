'use client';

import type { SOAPData } from '@/lib/soap-schema';

interface Props {
  data: SOAPData;
}

interface SectionDef {
  key: keyof SOAPData;
  badge: string;
  label: string;
  subtitle: string;
  description: string;
  // S/O/A/P それぞれを視覚的に区別するアクセントカラー (Tailwind クラス)
  accent: string;
}

const SECTIONS: SectionDef[] = [
  {
    key: 'subjective',
    badge: 'S',
    label: 'Subjective',
    subtitle: '主観的情報',
    description: '患者の訴え・自覚症状',
    accent: 'border-sky-300 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-950/40',
  },
  {
    key: 'objective',
    badge: 'O',
    label: 'Objective',
    subtitle: '客観的情報',
    description: '検査所見・触診・画像',
    accent: 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/40',
  },
  {
    key: 'assessment',
    badge: 'A',
    label: 'Assessment',
    subtitle: '評価・診断',
    description: '病態解釈',
    accent: 'border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/40',
  },
  {
    key: 'plan',
    badge: 'P',
    label: 'Plan',
    subtitle: '計画・治療方針',
    description: '処方・次回予約',
    accent: 'border-purple-300 dark:border-purple-800 bg-purple-50/60 dark:bg-purple-950/40',
  },
];

export function SOAPViewer({ data }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {SECTIONS.map((section) => {
        const field = data[section.key];
        return (
          <article
            key={section.key}
            className={`rounded-lg border ${section.accent} p-4 shadow-sm`}
            aria-labelledby={`soap-${section.key}-heading`}
          >
            <header className="mb-3 flex items-center gap-3">
              <span
                aria-hidden
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-base font-bold text-white dark:bg-slate-100 dark:text-slate-900"
              >
                {section.badge}
              </span>
              <div>
                <h3
                  id={`soap-${section.key}-heading`}
                  className="text-sm font-semibold text-slate-900 dark:text-slate-100"
                >
                  {section.label}
                  <span className="ml-2 text-xs font-normal text-slate-600 dark:text-slate-400">
                    {section.subtitle}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  {section.description}
                </p>
              </div>
            </header>
            <p className="text-sm leading-relaxed text-slate-900 dark:text-slate-100">
              {field.text}
            </p>
            <details className="mt-3">
              <summary className="inline-flex min-h-11 cursor-pointer items-center rounded text-xs font-medium text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-300 dark:hover:text-slate-100">
                原文の引用元を表示
              </summary>
              <blockquote className="mt-2 border-l-2 border-slate-400 bg-white/60 px-3 py-2 text-xs italic text-slate-700 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                「{field.source_text}」
              </blockquote>
            </details>
          </article>
        );
      })}
    </div>
  );
}
