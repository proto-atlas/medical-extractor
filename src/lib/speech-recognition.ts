// Web Speech API (SpeechRecognition) のラッパーと最小限のTypeScript型定義。
//
// なぜ手動で型を書くか:
//   - SpeechRecognition / webkitSpeechRecognitionはTypeScriptのlib.dom.d.tsに
//     2026-04 時点でも完全には含まれていない (Chrome/Edge/Safariでしか動かない、prefix必要)。
//   - 既存の @types/dom-speech-recognition等のサードパーティ型を入れる選択肢もあるが
//     依存を増やしたくないので必要最小限をambientで書く。
//
// 互換性:
//   - Chrome / Edge / Safari (デスクトップ + Android Chrome): 標準SpeechRecognition or webkitSpeechRecognition
//   - Firefox: 未対応 (2026-04 時点)、isSpeechRecognitionAvailable() でfalseが返る
//   - iOS Safari: 14+ で対応
//
// プライバシー:
//   - 音声データはApple/Googleのサーバーに送信される (Web Speech APIの仕様、ブラウザ依存)。
//     これはサーバー上のsecretや本番ストレージとは無関係。ユーザー側の認知が必要。
//   - プライバシー警告バナーで間接的にユーザーへ通知済み。

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

export interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
  onstart: ((event: Event) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

interface WindowWithSpeechRecognition extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

/**
 * 現在の環境でWeb Speech APIが利用可能か判定。
 * SSR / Node実行時はfalseを返す。
 */
export function isSpeechRecognitionAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as WindowWithSpeechRecognition;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/**
 * SpeechRecognitionインスタンスを生成。利用不可ならnullを返す。
 * 言語はja-JP固定 (medical-extractorは日本語の医療文書を想定)。
 */
export function createSpeechRecognition(): SpeechRecognitionInstance | null {
  if (typeof window === 'undefined') return null;
  const w = window as WindowWithSpeechRecognition;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'ja-JP';
  recognition.maxAlternatives = 1;
  return recognition;
}

export type {
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent,
  SpeechRecognitionResult,
  SpeechRecognitionResultList,
};
