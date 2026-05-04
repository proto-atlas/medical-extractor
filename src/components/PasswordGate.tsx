'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { STORAGE_KEY } from '@/lib/auth';
import { labelFor } from '@/lib/error-labels';
import type { ApiErrorResponse, ExtractErrorCode } from '@/lib/types';

interface Props {
  children: (password: string, clearPassword: () => void) => ReactNode;
}

type VerifyResult =
  | { ok: true }
  | { ok: false; code: ExtractErrorCode; retryAfterSeconds?: number };

/**
 * /api/auth を呼んで結果を ExtractErrorCode に正規化する。
 *
 * 確認した認証 UI 課題「認証 UI が 429 と 401 を区別しない」への対応。
 * boolean だと 429 (rate_limit) でも「アクセスキーが正しくありません」と表示され、
 * 利用者が誤りに気付けない。ApiErrorResponse の error code を返して呼び出し側で
 * labelFor() で日本語化する設計に統一する (raw error を UI に出さない方針も継続)。
 */
async function verifyPassword(candidate: string): Promise<VerifyResult> {
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { Authorization: `Bearer ${candidate}` },
    });
    if (res.ok) return { ok: true };
    let body: Partial<ApiErrorResponse> | null = null;
    try {
      body = (await res.json()) as Partial<ApiErrorResponse>;
    } catch {
      // body が JSON でない場合は status から推定する
    }
    if (body?.error) {
      return {
        ok: false,
        code: body.error,
        retryAfterSeconds: body.retryAfterSeconds,
      };
    }
    if (res.status === 429) return { ok: false, code: 'rate_limit' };
    if (res.status === 401) return { ok: false, code: 'unauthorized' };
    return { ok: false, code: 'unknown' };
  } catch {
    // ネットワーク失敗等。サーバ到達不能なので upstream_unavailable に寄せる
    return { ok: false, code: 'upstream_unavailable' };
  }
}

/**
 * 401 (unauthorized) は失効キーとして localStorage を消すべき。
 * 一方 429 / 通信失敗は一時的な失敗なので保存済みキーを残し、再試行可能にする。
 */
function shouldClearStoredKey(code: ExtractErrorCode): boolean {
  return code !== 'rate_limit' && code !== 'upstream_unavailable';
}

export function PasswordGate({ children }: Props) {
  const [password, setPassword] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setHydrated(true);
      return;
    }
    // 保存されたアクセスキーをサーバー検証してからメイン UI を出す
    // (失効キー = 401 は自動削除、429 / 通信失敗は一時的なので残す)。
    setVerifying(true);
    void verifyPassword(stored).then((result) => {
      if (result.ok) {
        setPassword(stored);
      } else if (shouldClearStoredKey(result.code)) {
        localStorage.removeItem(STORAGE_KEY);
      }
      setVerifying(false);
      setHydrated(true);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const candidate = input.trim();
    if (!candidate) return;
    setError(null);
    setVerifying(true);
    const result = await verifyPassword(candidate);
    setVerifying(false);
    if (result.ok) {
      localStorage.setItem(STORAGE_KEY, candidate);
      setPassword(candidate);
    } else {
      // ExtractErrorCode を ERROR_LABELS の日本語に変換して表示
      // (rate_limit は「短時間に多くのリクエスト...」、unauthorized は
      // 「アクセスキーが正しくありません」など、code ごとに別文言)
      setError(labelFor(result.code));
    }
  }

  function clearPassword() {
    localStorage.removeItem(STORAGE_KEY);
    setPassword(null);
    setInput('');
    setError(null);
  }

  if (!hydrated) return null;

  if (!password) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6">
        <div className="flex w-full flex-col gap-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-sm">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              medical-extractor
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              アクセスキーをご入力ください。
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
              （ご案内のアクセスキーをお使いください）
            </p>
          </div>
          <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
            <label htmlFor="access-password" className="sr-only">
              アクセスキー
            </label>
            <input
              id="access-password"
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="アクセスキー"
              autoFocus
              autoComplete="current-password"
              disabled={verifying}
              className="w-full min-h-11 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
            />
            {error && (
              <p role="alert" className="text-xs text-red-700 dark:text-red-300">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={!input.trim() || verifying}
              className="w-full min-h-11 rounded-md bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-400 dark:disabled:bg-slate-700 px-4 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
            >
              {verifying ? '確認中...' : '開く'}
            </button>
          </form>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-500">
          live AI API のコスト保護のため、アクセスキーをお持ちの方のみ利用できます。
        </p>
      </main>
    );
  }

  return <>{children(password, clearPassword)}</>;
}
