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

  it('localStorageに値が無ければfalseを返す', () => {
    expect(isPrivacyAcknowledged()).toBe(false);
  });

  it('localStorageに "1" が入っていればtrueを返す', () => {
    window.localStorage.setItem(PRIVACY_KEY, '1');
    expect(isPrivacyAcknowledged()).toBe(true);
  });

  it('localStorageに "1" 以外の値が入っていればfalseを返す', () => {
    window.localStorage.setItem(PRIVACY_KEY, '0');
    expect(isPrivacyAcknowledged()).toBe(false);
  });
});

describe('setPrivacyAcknowledged', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('localStorageにPRIVACY_KEY = "1" を保存する', () => {
    setPrivacyAcknowledged();
    expect(window.localStorage.getItem(PRIVACY_KEY)).toBe('1');
  });

  it('呼び出し後にisPrivacyAcknowledgedがtrueになる', () => {
    setPrivacyAcknowledged();
    expect(isPrivacyAcknowledged()).toBe(true);
  });
});
