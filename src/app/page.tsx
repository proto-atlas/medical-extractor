'use client';

import { useCallback, useMemo, useState } from 'react';
import { DocumentInput } from '@/components/DocumentInput';
import { ExtractButton } from '@/components/ExtractButton';
import { ExportButtons } from '@/components/ExportButtons';
import { SOAPViewer } from '@/components/SOAPViewer';
import { PasswordGate } from '@/components/PasswordGate';
import { PrivacyDialog } from '@/components/PrivacyDialog';
import { ThemeToggle } from '@/components/ThemeToggle';
import { MODEL_LABEL } from '@/lib/models';
import type { ApiErrorResponse, ExtractResponse } from '@/lib/types';
import { labelFor } from '@/lib/error-labels';
import { detectPotentialPersonalInfoPattern } from '@/lib/personal-info-warning';

export default function Home() {
  return (
    <PasswordGate>
      {(password, clearPassword) => (
        <PrivacyDialog>
          <MedicalExtractorApp password={password} onLogout={clearPassword} />
        </PrivacyDialog>
      )}
    </PasswordGate>
  );
}

function MedicalExtractorApp({ password, onLogout }: { password: string; onLogout: () => void }) {
  const [documentText, setDocumentText] = useState('');
  const [result, setResult] = useState<ExtractResponse | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [personalInfoWarningAcknowledged, setPersonalInfoWarningAcknowledged] = useState(false);

  const hasPotentialPersonalInfo = useMemo(
    () => detectPotentialPersonalInfoPattern(documentText),
    [documentText],
  );
  const canSubmit = useMemo(
    () =>
      documentText.trim().length > 0 &&
      !isExtracting &&
      (!hasPotentialPersonalInfo || personalInfoWarningAcknowledged),
    [documentText, hasPotentialPersonalInfo, isExtracting, personalInfoWarningAcknowledged],
  );

  const handleDocumentTextChange = useCallback((text: string) => {
    setDocumentText(text);
    setPersonalInfoWarningAcknowledged(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (isExtracting) return;
    setError(null);
    setResult(null);
    setIsExtracting(true);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${password}`,
        },
        body: JSON.stringify({ documentText }),
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      // 429 など error ボディは ApiErrorResponse の型で受ける。
      // res.ok でない場合に res.json() が落ちる可能性があるので catch しておく。
      let data: ExtractResponse | ApiErrorResponse;
      try {
        data = (await res.json()) as ExtractResponse | ApiErrorResponse;
      } catch {
        setError(labelFor('upstream_unavailable'));
        return;
      }
      if (!res.ok) {
        const errorBody = data as ApiErrorResponse;
        // 内部 code を日本語ラベルに変換して表示 (raw error を UI に出さない)
        setError(labelFor(errorBody.error));
        return;
      }
      setResult(data as ExtractResponse);
    } catch (err) {
      // ネットワーク失敗等の生 message は UI に出さず、固定ラベルへ寄せる
      console.error('[Home] /api/extract fetch failed:', err);
      setError(labelFor('upstream_unavailable'));
    } finally {
      setIsExtracting(false);
    }
  }, [documentText, password, isExtracting, onLogout]);

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-2 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight">medical-extractor</h1>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              onClick={onLogout}
              className="min-h-11 rounded-md px-3 py-2 text-xs text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-300 dark:hover:text-slate-100"
            >
              ログアウト
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          架空の医療文書から SOAP 形式 (Subjective / Objective / Assessment / Plan) を AI
          が構造化抽出します。
          {MODEL_LABEL} + Anthropic tool_use + Zod 検証で動作。
        </p>
        <div
          role="alert"
          className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <strong>プライバシーに関する注意:</strong>{' '}
          架空データ専用のデモです。実患者の医療情報は入力しないでください。入力本文はサーバーログに記録されず、永続化もされません。
          診断・治療・臨床判断には使用できません。
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="flex flex-col gap-4">
          <DocumentInput
            documentText={documentText}
            onChange={handleDocumentTextChange}
            disabled={isExtracting}
            personalInfoWarningAcknowledged={personalInfoWarningAcknowledged}
            onPersonalInfoWarningAcknowledgedChange={setPersonalInfoWarningAcknowledged}
          />
          <ExtractButton
            onSubmit={() => void handleSubmit()}
            isExtracting={isExtracting}
            canSubmit={canSubmit}
          />
          {result && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3 text-xs text-slate-600 dark:text-slate-400">
              <p>
                <span className="font-medium">モデル:</span> {result.model}
              </p>
              <p className="mt-1">
                <span className="font-medium">トークン:</span> 入力{' '}
                {result.usage.input_tokens.toLocaleString()} / 出力{' '}
                {result.usage.output_tokens.toLocaleString()}
                {result.usage.cache_creation_input_tokens !== undefined &&
                  result.usage.cache_creation_input_tokens > 0 && (
                    <>
                      {' '}
                      (キャッシュ書込 {result.usage.cache_creation_input_tokens.toLocaleString()})
                    </>
                  )}
                {result.usage.cache_read_input_tokens !== undefined &&
                  result.usage.cache_read_input_tokens > 0 && (
                    <> (キャッシュ読込 {result.usage.cache_read_input_tokens.toLocaleString()})</>
                  )}
              </p>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            >
              {error}
            </div>
          )}
          {result ? (
            <>
              <SOAPViewer data={result.soap} />
              <ExportButtons data={result.soap} />
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-600 dark:text-slate-400">
              抽出結果は SOAP 4 カードで右側に表示されます。
            </div>
          )}
        </section>
      </div>

      <footer className="mt-8 border-t border-slate-200 dark:border-slate-800 pt-4 text-xs text-slate-500 dark:text-slate-400">
        Next.js + Cloudflare Workers + Anthropic tool_use + Zod。架空データ前提のデモ実装。
      </footer>
    </main>
  );
}
