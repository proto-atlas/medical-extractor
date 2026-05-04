'use client';

import { EXPORT_FORMATS } from '@/lib/exporters';
import type { SOAPData } from '@/lib/soap-schema';

interface Props {
  data: SOAPData;
  // ファイル名のベース (拡張子を除く)。デフォルトは "soap-extraction"。
  baseFilename?: string;
}

/**
 * SOAP データを JSON / CSV / Markdown にエクスポートするダウンロードボタン群。
 * ブラウザ標準の Blob + a[download] 経由でローカル保存させる (サーバー往復なし、
 * 入力本文をサーバーに送らない SPEC のプライバシーポリシーと整合)。
 */
export function ExportButtons({ data, baseFilename = 'soap-extraction' }: Props) {
  function handleDownload(ext: 'json' | 'csv' | 'md', mimeType: string, content: string) {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${baseFilename}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // 即座に revoke すると Firefox 等でダウンロード前に URL が無効化される報告があるため
    // 次フレームに遅延させる
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-slate-500 dark:text-slate-400">エクスポート:</span>
      {EXPORT_FORMATS.map((format) => (
        <button
          key={format.ext}
          type="button"
          onClick={() => handleDownload(format.ext, format.mimeType, format.format(data))}
          className="min-h-11 min-w-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {format.ext.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
