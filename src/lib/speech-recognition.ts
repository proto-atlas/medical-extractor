// Web Speech API (SpeechRecognition) のラッパーと最小限の TypeScript 型定義。
//
// なぜ手動で型を書くか:
//   - SpeechRecognition / webkitSpeechRecognition は TypeScript の lib.dom.d.ts に
//     2026-04 時点でも完全には含まれていない (Chrome/Edge/Safari でしか動かない、prefix 必要)。
//   - 既存の @types/dom-speech-recognition 等のサードパーティ型を入れる選択肢もあるが
//     依存を増やしたくないので必要最小限を ambient で書く。
//
// 互換性:
//   - Chrome / Edge / Safari (デスクトップ + Android Chrome): 標準 SpeechRecognition or webkitSpeechRecognition
//   - Firefox: 未対応 (2026-04 時点)、isSpeechRecognitionAvailable() で false が返る
//   - iOS Safari: 14+ で対応
//
// プライバシー:
//   - 音声データは Apple/Google のサーバーに送信される (Web Speech API の仕様、ブラウザ依存)。
//     これはサーバー上の secret や本番ストレージとは無関係。ユーザー側の認知が必要。
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
 * 現在の環境で Web Speech API が利用可能か判定。
 * SSR / Node 実行時は false を返す。
 */
export function isSpeechRecognitionAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as WindowWithSpeechRecognition;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/**
 * SpeechRecognition インスタンスを生成。利用不可なら null を返す。
 * 言語は ja-JP 固定 (medical-extractor は日本語の医療文書を想定)。
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
