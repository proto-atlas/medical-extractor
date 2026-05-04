'use client';

import { useEffect, useRef, useState } from 'react';
import { isPrivacyAcknowledged, setPrivacyAcknowledged } from '@/lib/privacy';

interface Props {
  // 同意済みのとき子要素を描画する。同意前は子要素の代わりにモーダルを表示。
  children: React.ReactNode;
}

/**
 * 初回アクセス時に表示されるプライバシー警告モーダル。
 * 「架空データのみ使用してください」の同意を促し、localStorage に記録する。
 * 一度同意すると以後表示されない (常時バナーは page.tsx 側で別途表示)。
 *
 * a11y:
 *   - role="dialog" / aria-modal / aria-labelledby
 *   - フォーカスをマウント直後に primary ボタンへ
 *   - ESC で閉じない (意図的に同意ボタンクリックのみ閉じられる)
 */
export function PrivacyDialog({ children }: Props) {
  const [acknowledged, setAcknowledged] = useState<boolean | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // SSR では localStorage 参照不可、マウント後に判定
  useEffect(() => {
    setAcknowledged(isPrivacyAcknowledged());
  }, []);

  useEffect(() => {
    if (acknowledged === false) {
      buttonRef.current?.focus();
    }
  }, [acknowledged]);

  function handleAcknowledge() {
    setPrivacyAcknowledged();
    setAcknowledged(true);
  }

  // マウント前 (acknowledged===null) は子要素を仮描画してハイドレーションを揃える。
  // マウント後に未同意なら overlay でモーダルを表示。
  if (acknowledged === null || acknowledged === true) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
        aria-hidden={false}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="privacy-dialog-title"
          aria-describedby="privacy-dialog-body"
          className="max-w-lg rounded-lg border border-amber-300 bg-white p-6 shadow-xl dark:border-amber-700 dark:bg-slate-950"
        >
          <h2
            id="privacy-dialog-title"
            className="mb-3 text-lg font-bold text-slate-900 dark:text-slate-100"
          >
            プライバシーに関する重要な注意
          </h2>
          <div
            id="privacy-dialog-body"
            className="space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300"
          >
            <p>
              本デモは <strong>架空データ専用</strong> です。
              実患者の医療情報を入力しないでください。
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs">
              <li>診断・治療・臨床判断には使用できません</li>
              <li>入力本文はサーバーログに記録されません</li>
              <li>抽出結果はサーバーに永続化されません (in-memory のみ)</li>
              <li>
                音声入力はブラウザ標準 API を使用しており、音声データは Apple / Google
                等のクラウドに送信される場合があります
              </li>
              <li>
                ブラウザ側のキャッシュ / localStorage には UI 設定 (テーマ等) のみ保存されます
              </li>
            </ul>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              この注意は同意後 1 度だけ表示されます。
            </p>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              ref={buttonRef}
              type="button"
              onClick={handleAcknowledge}
              className="min-h-11 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
            >
              理解しました
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
