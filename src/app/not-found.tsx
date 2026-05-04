import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ページが見つかりません | medical-extractor',
};

/**
 * 404 ブランド統一ページ。Next.js 標準の白ページではなく、案内 + トップへ戻る導線を持つ。
 * アプリのトーンに合わせた 404 表示。
 *
 * 注意: このページは PasswordGate / PrivacyDialog の外側で表示される
 * (404 は app/page の前段で評価される)。state や内部 API リンクを持たない最小 UI。
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-6 text-center">
      <p className="text-sm font-semibold tracking-widest text-emerald-700 dark:text-emerald-400">
        404
      </p>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
        ページが見つかりません
      </h1>
      <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        指定された URL のページは存在しないか、移動した可能性があります。
      </p>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none dark:focus-visible:ring-offset-slate-950"
      >
        トップへ戻る
      </Link>
    </main>
  );
}
