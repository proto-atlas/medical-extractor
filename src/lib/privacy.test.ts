// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PRIVACY_KEY, isPrivacyAcknowledged, setPrivacyAcknowledged } from './privacy';

describe('isPrivacyAcknowledged', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('localStorage に値が無ければ false を返す', () => {
    expect(isPrivacyAcknowledged()).toBe(false);
  });

  it('localStorage に "1" が入っていれば true を返す', () => {
    window.localStorage.setItem(PRIVACY_KEY, '1');
    expect(isPrivacyAcknowledged()).toBe(true);
  });

  it('localStorage に "1" 以外の値が入っていれば false を返す', () => {
    window.localStorage.setItem(PRIVACY_KEY, '0');
    expect(isPrivacyAcknowledged()).toBe(false);
  });
});

describe('setPrivacyAcknowledged', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('localStorage に PRIVACY_KEY = "1" を保存する', () => {
    setPrivacyAcknowledged();
    expect(window.localStorage.getItem(PRIVACY_KEY)).toBe('1');
  });

  it('呼び出し後に isPrivacyAcknowledged が true になる', () => {
    setPrivacyAcknowledged();
    expect(isPrivacyAcknowledged()).toBe(true);
  });
});
