// SOAP 抽出結果のエクスポート整形ロジック (純関数)。
// ブラウザ依存 (Blob / URL.createObjectURL) は exporters.ts には書かず、
// 呼び出し側 (ExportButtons.tsx) で文字列を Blob 化 → a[download] でダウンロードさせる。
//
// テスト戦略:
//   - 純関数なので Vitest で正常系 / エスケープ / 改行の扱いを機械的に検証
//   - ブラウザ DOM 操作部分はテスト対象外 (component test or E2E で担保予定)

import type { SOAPData } from './soap-schema';

// CSV のフィールド項目 (label_key, key) を 1 箇所で管理し、各 exporter の表示順を統一。
// SOAP の S/O/A/P 順を保証する。
const SOAP_FIELDS: { key: keyof SOAPData; label: string; jaLabel: string }[] = [
  { key: 'subjective', label: 'Subjective', jaLabel: '主観的情報' },
  { key: 'objective', label: 'Objective', jaLabel: '客観的情報' },
  { key: 'assessment', label: 'Assessment', jaLabel: '評価・診断' },
  { key: 'plan', label: 'Plan', jaLabel: '計画・治療方針' },
];

/**
 * SOAP データを整形した JSON 文字列に。
 * pretty-print (indent 2) で人間が読める形にする。改行コードは LF。
 */
export function formatJson(soap: SOAPData): string {
  return JSON.stringify(soap, null, 2);
}

/**
 * SOAP データを CSV 文字列に。
 * RFC 4180 準拠: フィールド内に , / " / 改行 を含む場合は " で囲み、" は "" にエスケープ。
 * BOM は付けない (UTF-8、Excel で開く時は手動で UTF-8 として開く前提)。
 * ヘッダ行: "label,jaLabel,text,source_text"
 */
export function formatCsv(soap: SOAPData): string {
  const escape = (value: string): string => {
    if (/[",\r\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };
  const header = ['label', 'jaLabel', 'text', 'source_text'].join(',');
  const rows = SOAP_FIELDS.map((field) => {
    const data = soap[field.key];
    return [field.label, field.jaLabel, data.text, data.source_text].map(escape).join(',');
  });
  return [header, ...rows].join('\n');
}

/**
 * SOAP データを Markdown 文字列に。
 * 構造:
 *   # SOAP
 *
 *   ## Subjective (主観的情報)
 *
 *   <text>
 *
 *   > <source_text>
 *
 *   ## Objective ...
 */
export function formatMarkdown(soap: SOAPData): string {
  const sections = SOAP_FIELDS.map((field) => {
    const data = soap[field.key];
    return [
      `## ${field.label} (${field.jaLabel})`,
      '',
      data.text,
      '',
      `> ${data.source_text}`,
    ].join('\n');
  });
  return ['# SOAP', '', ...sections].join('\n\n');
}

export interface ExportFormat {
  ext: 'json' | 'csv' | 'md';
  mimeType: string;
  format: (soap: SOAPData) => string;
}

export const EXPORT_FORMATS: ExportFormat[] = [
  { ext: 'json', mimeType: 'application/json', format: formatJson },
  { ext: 'csv', mimeType: 'text/csv', format: formatCsv },
  { ext: 'md', mimeType: 'text/markdown', format: formatMarkdown },
];
