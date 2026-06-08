import { describe, expect, it } from 'vitest';
import { SAMPLES, findSampleById } from './samples';

describe('SAMPLES', () => {
  it('3 種のサンプルを提供する (一般内科 / 歯科 / 眼科)', () => {
    expect(SAMPLES).toHaveLength(3);
    const ids = SAMPLES.map((s) => s.id);
    expect(ids).toEqual(['internal', 'dental', 'ophthalmology']);
  });

  it('全サンプルにid / label / description / textが揃っている', () => {
    for (const sample of SAMPLES) {
      expect(sample.id).toBeTruthy();
      expect(sample.label).toBeTruthy();
      expect(sample.description).toBeTruthy();
      expect(sample.text.length).toBeGreaterThan(20);
    }
  });

  it('全サンプルが /api/extractの上限 10000 文字以内に収まる', () => {
    for (const sample of SAMPLES) {
      expect(sample.text.length).toBeLessThanOrEqual(10_000);
    }
  });

  it('サンプルtextはSOAP抽出に必要な情報を含む傾向がある (主観/客観/評価/計画的記述の存在を緩く検証)', () => {
    for (const sample of SAMPLES) {
      // 「来院」「所見」「処方」「予約」のいずれかが含まれていれば最低限のSOAP素材があると判定
      const keywords = ['来院', '所見', '処方', '予約', '診断', '判断'];
      const hasAny = keywords.some((k) => sample.text.includes(k));
      expect(hasAny).toBe(true);
    }
  });
});

describe('findSampleById', () => {
  it('既知idでサンプルを返す', () => {
    const sample = findSampleById('dental');
    expect(sample?.label).toBe('歯科');
  });

  it('未知idでundefinedを返す', () => {
    expect(findSampleById('unknown')).toBeUndefined();
  });

  it('空文字列でundefinedを返す', () => {
    expect(findSampleById('')).toBeUndefined();
  });
});
