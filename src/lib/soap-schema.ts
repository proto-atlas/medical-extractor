import { z } from 'zod';

/**
 * 医療文書SOAP構造化抽出のスキーマ。
 *
 * 各フィールド (subjective / objective / assessment / plan) は:
 * - text: AIが抽出 / 整理した内容のサマリー
 * - source_text: 抽出元になった原文の引用 (Citations代替)
 *
 * AnthropicのCitations APIはstreaming + 文字位置返却が中心で、tool_useと
 * 同時に使うと出力解釈が複雑になるため、tool input内でsource_textを要求する
 * 方式を採用する (シンプル + Zod検証可能、引用先を 1 文字単位で原文に戻したい
 * 高度なUXは 改善 以降の改善余地)。
 */
// .strict() で未知のキー混入をZod側でも拒否する。
// Anthropicのstrict tool use (Tool.strict?: boolean + additionalProperties: false) と
// SDKが未知のキーを返したケースでもUIに流さないため、受信後にも検証する。
// (SOAP fieldもstrictに検証する)。
export const SOAPFieldSchema = z
  .object({
    text: z
      .string()
      .min(1, 'text is required')
      .describe('SOAP該当項目を整理したサマリー。患者文書から該当する内容を要約する。'),
    source_text: z
      .string()
      .min(1, 'source_text is required')
      .describe('原文中で当該項目の根拠となる箇所。原文をそのまま引用する。'),
  })
  .strict();

export const SOAPDataSchema = z
  .object({
    subjective: SOAPFieldSchema,
    objective: SOAPFieldSchema,
    assessment: SOAPFieldSchema,
    plan: SOAPFieldSchema,
  })
  .strict();

export type SOAPField = z.infer<typeof SOAPFieldSchema>;
export type SOAPData = z.infer<typeof SOAPDataSchema>;
export type SOAPSectionName = keyof SOAPData;

export interface SOAPSourceTextValidationFailure {
  field: SOAPSectionName;
}

export type SOAPSourceTextValidationResult =
  | { ok: true }
  | { ok: false; failures: SOAPSourceTextValidationFailure[] };

const SOAP_SECTION_NAMES = ['subjective', 'objective', 'assessment', 'plan'] as const;
const MISSING_SOURCE_TEXT_MARKERS = new Set(['記載なし']);
const SOURCE_TEXT_COMPACT_PATTERN =
  /[\s、。，．・･／/（）()\u005b\u005d［］【】「」『』"'“”‘’:：;；,，.．]/gu;

function normalizeForSourceMatch(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function compactForSourceMatch(value: string): string {
  return normalizeForSourceMatch(value).replace(SOURCE_TEXT_COMPACT_PATTERN, '');
}

function sourceTextAppearsInDocument(documentText: string, sourceText: string): boolean {
  const normalizedDocument = normalizeForSourceMatch(documentText);
  const normalizedSourceText = normalizeForSourceMatch(sourceText);
  if (normalizedDocument.includes(normalizedSourceText)) {
    return true;
  }

  const compactDocument = compactForSourceMatch(documentText);
  const compactSourceText = compactForSourceMatch(sourceText);
  return compactSourceText.length > 0 && compactDocument.includes(compactSourceText);
}

/**
 * LLMが返したsource_textを、入力本文に存在する根拠文として検証する。
 * 「記載なし」は、原文に該当箇所がないSOAP項目を空にしないための明示マーカーとして許可する。
 */
export function validateSOAPSourceTexts(
  documentText: string,
  soap: SOAPData,
): SOAPSourceTextValidationResult {
  const failures: SOAPSourceTextValidationFailure[] = [];

  for (const field of SOAP_SECTION_NAMES) {
    const sourceText = normalizeForSourceMatch(soap[field].source_text);
    if (MISSING_SOURCE_TEXT_MARKERS.has(sourceText)) {
      continue;
    }
    if (!sourceTextAppearsInDocument(documentText, sourceText)) {
      failures.push({ field });
    }
  }

  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}

/**
 * Anthropic tool_useに渡すJSON Schema (draft 2020-12)。
 * Zodから自動変換せず手書きするのは、Anthropic SDKの `Tool.InputSchema` 型が
 * `additionalProperties` 等を厳密に取るため (zod-to-json-schema系のライブラリは
 * 出力に揺らぎがあってSDK型と合わないケースが多い)。
 *
 * Zod側 (SOAPDataSchema) とJSON Schema側 (SOAP_TOOL_INPUT_SCHEMA) の整合は
 * soap-schema.test.tsで機械的に検証する (両方を同じ正常系データで通す)。
 */
export const SOAP_TOOL_NAME = 'extract_soap';

export const SOAP_TOOL_DESCRIPTION =
  '医療文書からSOAP形式 (Subjective主観 / Objective客観 / Assessment評価 / Plan計画) の各項目を抽出する。各項目にはtext (整理したサマリー) とsource_text (原文の該当箇所をそのまま引用) を必ず含めること。原文に対応する記述がない項目でも空にせず "記載なし" 等の文字列を入れる。';

// 注意: Anthropic SDKのTool.InputSchemaはrequiredをmutable string[] で受けるため、
// readonly tuple (as const) は使わない。
//
// `additionalProperties: false` はstrict tool use (Tool.strict?: boolean) を有効化する
// ための必須要件 (Anthropic公式docs `strict-tool-use` 全例で記載)。
// 入れ忘れるとAPIが 400 invalid_request_errorを返す。
// トップレベルだけでなくnested schema (subjective / objective / assessment / plan) にも必須。
function makeFieldSchema(description: string) {
  return {
    type: 'object',
    description,
    properties: {
      text: {
        type: 'string',
        description: 'SOAP該当項目を整理したサマリー。',
      },
      source_text: {
        type: 'string',
        description: '原文中で当該項目の根拠となる箇所。原文をそのまま引用する。',
      },
    },
    required: ['text', 'source_text'],
    additionalProperties: false,
  };
}

export const SOAP_TOOL_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    subjective: makeFieldSchema('主観的情報 (患者の訴え・自覚症状)'),
    objective: makeFieldSchema('客観的情報 (検査所見・触診・画像所見)'),
    assessment: makeFieldSchema('評価 (診断・病態解釈)'),
    plan: makeFieldSchema('計画 (治療方針・処方・次回予約)'),
  },
  required: ['subjective', 'objective', 'assessment', 'plan'],
  additionalProperties: false,
};
