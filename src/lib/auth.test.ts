import { describe, expect, it } from 'vitest';
import { checkAccess } from './auth';

describe('checkAccess', () => {
  const expected = 'correct-password-123';

  it('expectedが未設定ならfalseを返す', () => {
    expect(checkAccess('Bearer correct-password-123', undefined)).toBe(false);
  });

  it('expectedが空文字列ならfalseを返す', () => {
    expect(checkAccess('Bearer correct-password-123', '')).toBe(false);
  });

  it('authHeaderがnullならfalseを返す', () => {
    expect(checkAccess(null, expected)).toBe(false);
  });

  it('Bearer形式でないauthHeaderならfalseを返す', () => {
    expect(checkAccess('Basic dXNlcjpwYXNz', expected)).toBe(false);
  });

  it('Bearerのみでトークンが空ならfalseを返す', () => {
    expect(checkAccess('Bearer ', expected)).toBe(false);
  });

  it('完全一致すればtrueを返す', () => {
    expect(checkAccess(`Bearer ${expected}`, expected)).toBe(true);
  });

  it('先頭に半角スペース余分があってもBearer後ろのトリムで一致する', () => {
    expect(checkAccess(`Bearer   ${expected}`, expected)).toBe(true);
  });

  it('長さが違うトークンはfalseを返す（1文字短い）', () => {
    expect(checkAccess(`Bearer ${expected.slice(0, -1)}`, expected)).toBe(false);
  });

  it('長さが違うトークンはfalseを返す（1文字長い）', () => {
    expect(checkAccess(`Bearer ${expected}x`, expected)).toBe(false);
  });

  it('同じ長さで1文字だけ違うトークンはfalseを返す', () => {
    expect(checkAccess('Bearer correct-password-124', expected)).toBe(false);
  });

  it('Bearerが大文字小文字違いでも通る', () => {
    expect(checkAccess(`bearer ${expected}`, expected)).toBe(true);
    expect(checkAccess(`BEARER ${expected}`, expected)).toBe(true);
  });
});
