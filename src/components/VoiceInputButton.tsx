'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createSpeechRecognition,
  isSpeechRecognitionAvailable,
  type SpeechRecognitionEvent,
  type SpeechRecognitionErrorEvent,
  type SpeechRecognitionInstance,
} from '@/lib/speech-recognition';

interface Props {
  // 確定したテキストを受け取る (継続的に append される想定)
  onTranscript: (chunk: string) => void;
  disabled?: boolean;
}

/**
 * Web Speech API 音声入力ボタン。
 * - ブラウザ非対応時はボタンを描画せず代わりに「非対応」テキストのみ表示。
 * - 録音中はボタン文言を切替、停止ボタンとして機能。
 * - 確定したテキスト (isFinal) のみ親に通知し、暫定 (interim) は捨てる。
 *   暫定を反映すると編集途中のカーソル位置が崩れたり、AI 抽出に不安定なテキストが
 *   流れ込む可能性があるため。
 * - エラー (no-speech / aborted / not-allowed 等) は内部 state に短いメッセージで保持し
 *   ボタン下に表示。
 */
export function VoiceInputButton({ onTranscript, disabled = false }: Props) {
  const [available, setAvailable] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // ブラウザ判定はマウント後 (SSR で window 参照不可)
  useEffect(() => {
    setAvailable(isSpeechRecognitionAvailable());
  }, []);

  // クリーンアップ: アンマウント時に走り続けないよう abort
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  function start() {
    setErrorMessage(null);
    const rec = createSpeechRecognition();
    if (!rec) {
      setErrorMessage('このブラウザは音声入力に対応していません。');
      return;
    }
    rec.onresult = (event: SpeechRecognitionEvent) => {
      // event.results は new + 既存全て、event.resultIndex 以降が新着分。
      // 確定 (isFinal=true) だけ確定テキストとして親に通知する。
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result?.isFinal) {
          const transcript = result[0]?.transcript ?? '';
          if (transcript) onTranscript(transcript);
        }
      }
    };
    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      const map: Record<string, string> = {
        'no-speech': '音声が検出されませんでした。',
        aborted: '中断されました。',
        'audio-capture': 'マイクが見つかりません。',
        'not-allowed': 'マイクの使用が許可されていません。ブラウザの設定をご確認ください。',
        network: 'ネットワークエラーが発生しました。',
        'service-not-allowed': '音声認識サービスがブロックされています。',
      };
      setErrorMessage(map[event.error] ?? `音声入力エラー: ${event.error}`);
      setIsListening(false);
    };
    rec.onend = () => {
      setIsListening(false);
    };
    rec.start();
    recognitionRef.current = rec;
    setIsListening(true);
  }

  function stop() {
    recognitionRef.current?.stop();
    // onend で setIsListening(false) されるので、ここでは何もしない
  }

  if (!available) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        音声入力はこのブラウザでは利用できません (Chrome / Edge / Safari で対応)。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={isListening ? stop : start}
        disabled={disabled}
        aria-pressed={isListening}
        className={`min-h-11 self-start rounded-md border px-3 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 ${
          isListening
            ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800'
        }`}
      >
        {isListening ? '録音停止' : '音声入力 (β)'}
      </button>
      {errorMessage && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
