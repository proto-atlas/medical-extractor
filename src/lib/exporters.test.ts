import { describe, expect, it } from 'vitest';
import { formatJson, formatCsv, formatMarkdown, EXPORT_FORMATS } from './exporters';
import type { SOAPData } from './soap-schema';

const sampleSOAP: SOAPData = {
  subjective: {
    text: '右下奥歯の冷温水痛で来院',
    source_text: '右下奥歯の冷温水痛で来院',
  },
  objective: {
    text: '上顎7番に軽度動揺、根尖部透過像',
    source_text: '上顎 7 番に軽度の動揺',
  },
  assessment: {
    text: 'う蝕C3相当、神経処置必要',
    source_text: 'う蝕 C3 相当',
  },
  plan: {
    text: '次回根管治療予約、抗生剤処方',
    source_text: '次回根管治療予約',
  },
};

describe('formatJson', () => {
  it('SOAP データを 2 スペースインデントの JSON 文字列に整形する', () => {
    const json = formatJson(sampleSOAP);
    expect(json.startsWith('{\n  ')).toBe(true);
    expect(JSON.parse(json)).toEqual(sampleSOAP);
  });

  it('S/O/A/P 4 セクションすべてが含まれる', () => {
    const json = formatJson(sampleSOAP);
    expect(json).toContain('subjective');
    expect(json).toContain('objective');
    expect(json).toContain('assessment');
    expect(json).toContain('plan');
  });
});

describe('formatCsv', () => {
  it('1 行目はヘッダ "label,jaLabel,text,source_text"', () => {
    const csv = formatCsv(sampleSOAP);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('label,jaLabel,text,source_text');
  });

  it('S/O/A/P 順で 4 行のデータ行が出力される (合計 5 行)', () => {
    const csv = formatCsv(sampleSOAP);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[1]?.startsWith('Subjective,')).toBe(true);
    expect(lines[2]?.startsWith('Objective,')).toBe(true);
    expect(lines[3]?.startsWith('Assessment,')).toBe(true);
    expect(lines[4]?.startsWith('Plan,')).toBe(true);
  });

  it('カンマを含むフィールドは " で囲まれる', () => {
    const data: SOAPData = {
      ...sampleSOAP,
      plan: { text: '次回, 根管治療', source_text: '原文' },
    };
    const csv = formatCsv(data);
    expect(csv).toContain('"次回, 根管治療"');
  });

  it('" を含むフィールドは "" にエスケープされる', () => {
    const data: SOAPData = {
      ...sampleSOAP,
      assessment: { text: '評価 "C3"', source_text: '原文' },
    };
    const csv = formatCsv(data);
    expect(csv).toContain('"評価 ""C3"""');
  });

  it('改行を含むフィールドは " で囲まれる', () => {
    const data: SOAPData = {
      ...sampleSOAP,
      objective: { text: '所見1\n所見2', source_text: '原文' },
    };
    const csv = formatCsv(data);
    expect(csv).toContain('"所見1\n所見2"');
  });
});

describe('formatMarkdown', () => {
  it('# SOAP で始まり 4 セクションを含む', () => {
    const md = formatMarkdown(sampleSOAP);
    expect(md.startsWith('# SOAP')).toBe(true);
    expect(md).toContain('## Subjective (主観的情報)');
    expect(md).toContain('## Objective (客観的情報)');
    expect(md).toContain('## Assessment (評価・診断)');
    expect(md).toContain('## Plan (計画・治療方針)');
  });

  it('source_text は引用記号 > で表示される', () => {
    const md = formatMarkdown(sampleSOAP);
    expect(md).toContain('> 右下奥歯の冷温水痛で来院');
    expect(md).toContain('> 次回根管治療予約');
  });

  it('text と source_text の両方が含まれる', () => {
    const md = formatMarkdown(sampleSOAP);
    expect(md).toContain('う蝕C3相当、神経処置必要');
    expect(md).toContain('う蝕 C3 相当');
  });
});

describe('EXPORT_FORMATS', () => {
  it('json / csv / md の 3 形式が登録されている', () => {
    expect(EXPORT_FORMATS).toHaveLength(3);
    expect(EXPORT_FORMATS.map((f) => f.ext)).toEqual(['json', 'csv', 'md']);
  });

  it('各 format は呼び出すと文字列を返す', () => {
    for (const format of EXPORT_FORMATS) {
      const output = format.format(sampleSOAP);
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    }
  });

  it('各 format に MIME type が設定されている', () => {
    expect(EXPORT_FORMATS[0]?.mimeType).toBe('application/json');
    expect(EXPORT_FORMATS[1]?.mimeType).toBe('text/csv');
    expect(EXPORT_FORMATS[2]?.mimeType).toBe('text/markdown');
  });
});
