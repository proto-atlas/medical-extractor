import { describe, expect, it } from 'vitest';
import { ERROR_LABELS, labelFor } from './error-labels';
import type { ExtractErrorCode } from './types';

describe('error-labels', () => {
  it('unauthorizedは「アクセスキーが正しくありません」を返す', () => {
    expect(labelFor('unauthorized')).toBe('アクセスキーが正しくありません。');
  });

  it('rate_limitは「短時間に多くのリクエスト」を含むラベルを返す', () => {
    expect(labelFor('rate_limit')).toContain('短時間に多くのリクエスト');
  });

  it('schema_violationは内部詳細を含まず「AI出力の検証」のみを返す', () => {
    const label = labelFor('schema_violation');
    expect(label).toContain('AI出力の検証');
    // 内部詳細 (Zod issues) が漏れていないこと
    expect(label).not.toContain('path');
    expect(label).not.toContain('issues');
  });

  it('server_misconfiguredは環境変数名を含まないラベルを返す', () => {
    const label = labelFor('server_misconfigured');
    expect(label).toContain('サーバー設定エラー');
    expect(label).not.toContain('ANTHROPIC_API_KEY');
    expect(label).not.toContain('ACCESS_PASSWORD');
  });

  it('upstream_unavailableは「AIサービス」を含む汎用文言を返す', () => {
    expect(labelFor('upstream_unavailable')).toContain('AIサービス');
  });

  it('全ExtractErrorCodeに対応するラベルが定義されている', () => {
    const codes: ExtractErrorCode[] = [
      'unauthorized',
      'rate_limit',
      'invalid_input',
      'document_too_long',
      'schema_violation',
      'tool_use_missing',
      'upstream_unavailable',
      'server_misconfigured',
      'aborted',
      'unknown',
    ];
    for (const code of codes) {
      expect(ERROR_LABELS[code]).toBeTruthy();
      expect(typeof ERROR_LABELS[code]).toBe('string');
      expect(ERROR_LABELS[code].length).toBeGreaterThan(0);
    }
  });
});
