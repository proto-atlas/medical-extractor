import { describe, expect, it } from 'vitest';
import { detectPotentialPersonalInfoPattern } from './personal-info-warning';

describe('detectPotentialPersonalInfoPattern', () => {
  it('メールアドレスらしき文字列があれば true を返す', () => {
    expect(detectPotentialPersonalInfoPattern('連絡先 test@example.com')).toBe(true);
  });

  it('電話番号らしき文字列があれば true を返す', () => {
    expect(detectPotentialPersonalInfoPattern('連絡先 090-1234-5678')).toBe(true);
  });

  it('郵便番号らしき文字列があれば true を返す', () => {
    expect(detectPotentialPersonalInfoPattern('住所 123-4567')).toBe(true);
  });

  it('生年月日らしき日付があれば true を返す', () => {
    expect(detectPotentialPersonalInfoPattern('生年月日 1980/01/02')).toBe(true);
  });

  it('長い識別番号らしき数字があれば true を返す', () => {
    expect(detectPotentialPersonalInfoPattern('ID 123456789')).toBe(true);
  });

  it('架空サンプルの短い診療メモなら false を返す', () => {
    expect(detectPotentialPersonalInfoPattern('右下奥歯の冷温水痛で来院。次回根管治療予約。')).toBe(
      false,
    );
  });
});
