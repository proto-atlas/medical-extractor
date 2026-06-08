// @vitest-environment happy-dom
// happy-dom環境ではwindowはあるがSpeechRecognitionは無い前提でのテスト。
// 実ブラウザ動作は手動テストに委譲 (マイク権限 / 音声入力のモックは現実的でない)。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpeechRecognition, isSpeechRecognitionAvailable } from './speech-recognition';

describe('isSpeechRecognitionAvailable', () => {
  afterEach(() => {
    // 後続テストのためにwindowから差し込んだスタブを片付ける
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  });

  it('windowにSpeechRecognitionもwebkitSpeechRecognitionも無ければfalse', () => {
    expect(isSpeechRecognitionAvailable()).toBe(false);
  });

  it('window.SpeechRecognitionがあればtrue', () => {
    (window as unknown as Record<string, unknown>).SpeechRecognition = vi.fn();
    expect(isSpeechRecognitionAvailable()).toBe(true);
  });

  it('window.webkitSpeechRecognitionがあればtrue (Chrome/Safari prefix)', () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = vi.fn();
    expect(isSpeechRecognitionAvailable()).toBe(true);
  });
});

describe('createSpeechRecognition', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  });

  it('利用不可環境ではnullを返す', () => {
    expect(createSpeechRecognition()).toBeNull();
  });

  it('window.SpeechRecognitionがあればインスタンスを生成しja-JP / continuous / interimResultsを設定する', () => {
    // class構文で `new Ctor()` 互換のスタブを作る (vi.fn(() => obj) はcallはできるが
    // constructシグネチャを持たないため `new` 呼び出しでTypeErrorになる)
    const Ctor = class {
      continuous = false;
      interimResults = false;
      lang = '';
      maxAlternatives = 0;
      start = vi.fn();
      stop = vi.fn();
      abort = vi.fn();
      onresult = null;
      onerror = null;
      onend = null;
      onstart = null;
    };
    (window as unknown as Record<string, unknown>).SpeechRecognition = Ctor;

    const rec = createSpeechRecognition();
    expect(rec).not.toBeNull();
    expect(rec?.continuous).toBe(true);
    expect(rec?.interimResults).toBe(true);
    expect(rec?.lang).toBe('ja-JP');
    expect(rec?.maxAlternatives).toBe(1);
  });
});
