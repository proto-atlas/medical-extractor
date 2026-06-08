import { describe, expect, it } from 'vitest';

import { formatMarkdownCell, sourceTextMatchesDocument } from './soap-eval-checks.mjs';

describe('sourceTextMatchesDocument', () => {
  it('原文の改行をまたぐ引用は空白差分を無視して一致する', () => {
    const documentText = '触診では下顎右側 7 番に軽度の動揺あり。\nレントゲン所見あり。';
    const sourceText = '触診では下顎右側 7 番に軽度の動揺あり。レントゲン所見あり。';

    expect(sourceTextMatchesDocument(sourceText, documentText)).toBe(true);
  });

  it('原文にない文言を含む引用は一致しない', () => {
    const documentText = '次回根管治療予約、鎮痛薬を 3 日分処方。';
    const sourceText = '次回根管治療予約、鎮痛薬を 7 日分処方。';

    expect(sourceTextMatchesDocument(sourceText, documentText)).toBe(false);
  });

  it('空文字の引用は一致しない', () => {
    expect(sourceTextMatchesDocument('', '原文')).toBe(false);
  });

  it('Markdown表セル用に改行とパイプをエスケープする', () => {
    expect(formatMarkdownCell('1 行目\n2 | 行目')).toBe('1 行目<br>2 \\| 行目');
  });
});
