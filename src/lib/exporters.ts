// SOAP抽出結果のエクスポート整形ロジック (純関数)。
// ブラウザ依存 (Blob / URL.createObjectURL) はexporters.tsには書かず、
// 呼び出し側 (ExportButtons.tsx) で文字列をBlob化 → a[download] でダウンロードさせる。
//
// テスト戦略:
//   - 純関数なのでVitestで正常系 / エスケープ / 改行の扱いを機械的に検証
//   - ブラウザDOM操作部分はテスト対象外 (component test or E2Eで担保予定)

import type { SOAPData } from './soap-schema';

// CSVのフィールド項目 (label_key, key) を 1 箇所で管理し、各exporterの表示順を統一。
// SOAPのS/O/A/P順を保証する。
const SOAP_FIELDS: { key: keyof SOAPData; label: string; jaLabel: string }[] = [
  { key: 'subjective', label: 'Subjective', jaLabel: '主観的情報' },
  { key: 'objective', label: 'Objective', jaLabel: '客観的情報' },
  { key: 'assessment', label: 'Assessment', jaLabel: '評価・診断' },
  { key: 'plan', label: 'Plan', jaLabel: '計画・治療方針' },
];

/**
 * SOAPデータを整形したJSON文字列に。
 * pretty-print (indent 2) で人間が読める形にする。改行コードはLF。
 */
export function formatJson(soap: SOAPData): string {
  return JSON.stringify(soap, null, 2);
}

/**
 * SOAPデータをCSV文字列に。
 * RFC 4180 準拠: フィールド内に , / " / 改行 を含む場合は " で囲み、" は "" にエスケープ。
 * BOMは付けない (UTF-8、Excelで開く時は手動でUTF-8 として開く前提)。
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
 * SOAPデータをMarkdown文字列に。
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
