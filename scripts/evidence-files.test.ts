import { describe, expect, it } from 'vitest';

import { findLatestEvidenceFile } from './evidence-files.mjs';

describe('findLatestEvidenceFile', () => {
  it('同じprefixの証跡が複数ある場合は最新日付のmdを返す', () => {
    expect(
      findLatestEvidenceFile(
        ['lighthouse-2026-04-27.md', 'lighthouse-2026-04-28.md', 'dependency-audit-2026-04-29.md'],
        'lighthouse',
      ),
    ).toBe('lighthouse-2026-04-28.md');
  });

  it('suffixを指定した場合は対象拡張子の中で最新日付を返す', () => {
    expect(
      findLatestEvidenceFile(
        [
          'production-smoke-2026-04-28.md',
          'production-smoke-2026-04-28.json',
          'production-smoke-2026-04-29.json',
        ],
        'production-smoke',
        '.json',
      ),
    ).toBe('production-smoke-2026-04-29.json');
  });

  it('対象prefixがない場合はundefinedを返す', () => {
    expect(findLatestEvidenceFile(['soap-eval-2026-04-29.md'], 'lighthouse')).toBeUndefined();
  });
});
