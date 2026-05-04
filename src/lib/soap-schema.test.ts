import { describe, expect, it } from 'vitest';
import {
  SOAPDataSchema,
  SOAP_TOOL_INPUT_SCHEMA,
  SOAP_TOOL_NAME,
  validateSOAPSourceTexts,
} from './soap-schema';

const validSOAP = {
  subjective: { text: '右下奥歯の冷温水痛で来院', source_text: '右下奥歯の冷温水痛で来院' },
  objective: { text: '上顎7番に軽度動揺、根尖部透過像', source_text: '上顎 7 番に軽度の動揺' },
  assessment: { text: 'う蝕C3相当、神経処置必要', source_text: 'う蝕 C3 相当' },
  plan: { text: '次回根管治療予約、抗生剤処方', source_text: '次回根管治療予約' },
};

describe('SOAPDataSchema', () => {
  it('正常な 4 項目すべて揃ったデータを受理する', () => {
    const result = SOAPDataSchema.safeParse(validSOAP);
    expect(result.success).toBe(true);
  });

  it('subjective が欠けると拒否する', () => {
    const { subjective: _omit, ...withoutSubjective } = validSOAP;
    const result = SOAPDataSchema.safeParse(withoutSubjective);
    expect(result.success).toBe(false);
  });

  it('text が空文字だと拒否する', () => {
    const result = SOAPDataSchema.safeParse({
      ...validSOAP,
      objective: { text: '', source_text: '原文あり' },
    });
    expect(result.success).toBe(false);
  });

  it('source_text が空文字だと拒否する', () => {
    const result = SOAPDataSchema.safeParse({
      ...validSOAP,
      assessment: { text: '評価あり', source_text: '' },
    });
    expect(result.success).toBe(false);
  });

  it('text が文字列でないと拒否する', () => {
    const result = SOAPDataSchema.safeParse({
      ...validSOAP,
      plan: { text: 123, source_text: '原文' },
    });
    expect(result.success).toBe(false);
  });

  it('未知のキーが混入していたら拒否する (.strict() / Anthropic strict tool use と整合)', () => {
    const result = SOAPDataSchema.safeParse({
      ...validSOAP,
      extra_field: { text: '余計', source_text: '余計' },
    });
    expect(result.success).toBe(false);
  });

  it('SOAPField レベルでも未知のキーは拒否される (.strict() nested)', () => {
    const result = SOAPDataSchema.safeParse({
      ...validSOAP,
      subjective: { text: 'OK', source_text: 'OK', extra: '混入' },
    });
    expect(result.success).toBe(false);
  });

  it('SOAP_TOOL_INPUT_SCHEMA は extract_soap という名前と整合し required 4 項目を持つ', () => {
    expect(SOAP_TOOL_NAME).toBe('extract_soap');
    expect(SOAP_TOOL_INPUT_SCHEMA.required).toEqual([
      'subjective',
      'objective',
      'assessment',
      'plan',
    ]);
    expect(Object.keys(SOAP_TOOL_INPUT_SCHEMA.properties)).toEqual([
      'subjective',
      'objective',
      'assessment',
      'plan',
    ]);
  });

  it('SOAP_TOOL_INPUT_SCHEMA の各フィールドは text + source_text を required にしている', () => {
    for (const key of ['subjective', 'objective', 'assessment', 'plan'] as const) {
      const field = SOAP_TOOL_INPUT_SCHEMA.properties[key];
      expect(field.required).toEqual(['text', 'source_text']);
      expect(field.properties.text.type).toBe('string');
      expect(field.properties.source_text.type).toBe('string');
    }
  });

  it('SOAP_TOOL_INPUT_SCHEMA は strict tool use 必須の additionalProperties: false を全レベルで持つ', () => {
    // トップ
    expect(SOAP_TOOL_INPUT_SCHEMA.additionalProperties).toBe(false);
    // 各 nested
    for (const key of ['subjective', 'objective', 'assessment', 'plan'] as const) {
      const field = SOAP_TOOL_INPUT_SCHEMA.properties[key];
      expect(field.additionalProperties).toBe(false);
    }
  });
});

describe('validateSOAPSourceTexts', () => {
  it('source_text が入力本文に含まれていれば ok: true を返す', () => {
    const documentText =
      '右下奥歯の冷温水痛で来院。上顎 7 番に軽度の動揺を認める。う蝕 C3 相当。次回根管治療予約。';

    expect(validateSOAPSourceTexts(documentText, validSOAP)).toEqual({ ok: true });
  });

  it('source_text の空白差分は正規化して照合する', () => {
    const documentText =
      '右下奥歯の冷温水痛で来院。上顎 7 番に軽度の動揺。う蝕 C3 相当。次回根管治療予約。';
    const soap = {
      ...validSOAP,
      objective: { text: '上顎7番に軽度動揺', source_text: '上顎\n7 番に軽度の動揺' },
    };

    expect(validateSOAPSourceTexts(documentText, soap)).toEqual({ ok: true });
  });

  it('source_text の全角半角・記号・空白差分は正規化して照合する', () => {
    const documentText =
      '右下奥歯の冷温水痛で来院。上顎 7 番に軽度の動揺。う蝕 C3 相当。次回根管治療予約 (1 週後)、抗生剤 (アモキシシリン 250mg) と鎮痛薬を 3 日分処方。';
    const soap = {
      ...validSOAP,
      plan: {
        text: '次回根管治療予約と処方',
        source_text: '次回根管治療予約(1週後)、抗生剤(アモキシシリン250mg)と鎮痛薬を3日分処方',
      },
    };

    expect(validateSOAPSourceTexts(documentText, soap)).toEqual({ ok: true });
  });

  it('source_text が入力本文に含まれなければ field 名だけを返す', () => {
    const documentText =
      '右下奥歯の冷温水痛で来院。上顎 7 番に軽度の動揺。う蝕 C3 相当。次回根管治療予約。';
    const soap = {
      ...validSOAP,
      plan: { text: '外科処置', source_text: '原文に存在しない計画' },
    };

    expect(validateSOAPSourceTexts(documentText, soap)).toEqual({
      ok: false,
      failures: [{ field: 'plan' }],
    });
  });

  it('記載なし は欠落項目の明示マーカーとして許可する', () => {
    const documentText = '右下奥歯の冷温水痛で来院。上顎 7 番に軽度の動揺。う蝕 C3 相当。';
    const soap = {
      ...validSOAP,
      plan: { text: '記載なし', source_text: '記載なし' },
    };

    expect(validateSOAPSourceTexts(documentText, soap)).toEqual({ ok: true });
  });
});
