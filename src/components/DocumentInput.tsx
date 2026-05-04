'use client';

import { useState, useId } from 'react';
import { SAMPLES, findSampleById } from '@/lib/samples';
import { detectPotentialPersonalInfoPattern } from '@/lib/personal-info-warning';
import { VoiceInputButton } from './VoiceInputButton';

interface Props {
  documentText: string;
  onChange: (text: string) => void;
  disabled: boolean;
  personalInfoWarningAcknowledged: boolean;
  onPersonalInfoWarningAcknowledgedChange: (checked: boolean) => void;
}

const MAX_LENGTH = 10_000;

export function DocumentInput({
  documentText,
  onChange,
  disabled,
  personalInfoWarningAcknowledged,
  onPersonalInfoWarningAcknowledgedChange,
}: Props) {
  const [fileStatus, setFileStatus] = useState<string | null>(null);
  // controlled select の表示値。サンプル読込後は選択をクリアして
  // 「同じサンプルを再度選んだら再ロード」できるようにする。
  const [selectedSampleId, setSelectedSampleId] = useState<string>('');
  const sampleSelectId = useId();

  async function handleFile(file: File | null) {
    if (!file) return;
    setFileStatus(`${file.name} を読み込み中...`);
    try {
      // .txt / .md は MIME 型が text/plain or text/markdown 等まちまちなので
      // 拡張子で判定。ブラウザが認識しないファイルでも text() で読めるなら受け入れる。
      const text = await file.text();
      const trimmed = text.length > MAX_LENGTH ? text.slice(0, MAX_LENGTH) : text;
      onChange(trimmed);
      const truncated = text.length > MAX_LENGTH ? `（${MAX_LENGTH}文字に切り詰め）` : '';
      setFileStatus(`${file.name} 読込完了 (${trimmed.length.toLocaleString()}文字${truncated})`);
    } catch (err) {
      setFileStatus(`読込失敗: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  function handleSampleChange(id: string) {
    if (!id) return;
    const sample = findSampleById(id);
    if (!sample) return;
    onChange(sample.text);
    setFileStatus(`サンプル「${sample.label}」を読み込みました`);
    // 即座に selection をリセットして同じサンプルを再選択可能に
    setSelectedSampleId('');
  }

  function handleVoiceTranscript(chunk: string) {
    // 既存テキストへ追記。前後にスペース or 改行を入れすぎず、自然な追加にする。
    const next = documentText.length === 0 ? chunk : `${documentText}${chunk}`;
    if (next.length > MAX_LENGTH) {
      onChange(next.slice(0, MAX_LENGTH));
    } else {
      onChange(next);
    }
  }

  const overLimit = documentText.length > MAX_LENGTH;
  const hasPotentialPersonalInfo = detectPotentialPersonalInfoPattern(documentText);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">医療文書</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <label htmlFor={sampleSelectId} className="text-slate-700 dark:text-slate-300">
            サンプル:
          </label>
          <select
            id={sampleSelectId}
            value={selectedSampleId}
            onChange={(e) => handleSampleChange(e.target.value)}
            disabled={disabled}
            className="min-h-11 rounded-md border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="">選択してください</option>
            {SAMPLES.map((sample) => (
              <option key={sample.id} value={sample.id}>
                {sample.label}（{sample.description}）
              </option>
            ))}
          </select>
          <label
            className={`inline-flex min-h-11 cursor-pointer items-center rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus-within:ring-2 focus-within:ring-emerald-500 ${
              disabled ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            .txt / .md を読込
            <input
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              className="hidden"
              disabled={disabled}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = '';
                void handleFile(file);
              }}
            />
          </label>
        </div>
      </div>
      <VoiceInputButton onTranscript={handleVoiceTranscript} disabled={disabled} />
      {fileStatus && <p className="text-xs text-slate-500 dark:text-slate-400">{fileStatus}</p>}
      <textarea
        value={documentText}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="架空の診療メモを貼り付けるか、サンプルから読み込んでください。実患者の情報は入力しないでください。"
        aria-label="医療文書テキスト入力"
        className="min-h-[280px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-sm font-mono leading-relaxed text-slate-900 dark:text-slate-100 placeholder:text-slate-400 disabled:opacity-50 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      {hasPotentialPersonalInfo && (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <p className="font-medium">個人情報らしき文字列が含まれている可能性があります。</p>
          <p className="mt-1">
            この警告はbest-effortであり、個人情報の完全検出を保証するものではありません。実患者情報は入力しないでください。
          </p>
          <label className="mt-2 flex items-start gap-2">
            <input
              type="checkbox"
              checked={personalInfoWarningAcknowledged}
              onChange={(e) => onPersonalInfoWarningAcknowledgedChange(e.target.checked)}
              disabled={disabled}
              className="mt-0.5 size-4 rounded border-amber-400 text-emerald-700 focus:ring-emerald-500"
            />
            <span>これは架空データであり、実患者情報ではないことを確認しました。</span>
          </label>
        </div>
      )}
      <div className="flex items-center justify-between text-xs">
        <span
          className={
            // text-slate-400 はライト bg-white で AA を満たさないため text-slate-500 に上げる
            overLimit
              ? 'font-semibold text-red-700 dark:text-red-400'
              : 'text-slate-600 dark:text-slate-400'
          }
        >
          {documentText.length.toLocaleString()}文字
          {overLimit && ` / 最大 ${MAX_LENGTH.toLocaleString()} を超えています`}
        </span>
        <span className="text-slate-600 dark:text-slate-400">
          最大 {MAX_LENGTH.toLocaleString()}文字
        </span>
      </div>
    </div>
  );
}
