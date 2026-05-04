'use client';

interface Props {
  onSubmit: () => void;
  isExtracting: boolean;
  canSubmit: boolean;
}

export function ExtractButton({ onSubmit, isExtracting, canSubmit }: Props) {
  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        aria-busy={isExtracting}
        className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none disabled:bg-slate-400 dark:focus-visible:ring-offset-slate-950 dark:disabled:bg-slate-700"
      >
        {isExtracting ? '抽出中...' : 'SOAP を抽出する'}
      </button>
    </div>
  );
}
