const WHITESPACE = /\s+/gu;

/**
 * source_text は原文の改行をまたぐことがあるため、空白差分だけは無視して照合する。
 * 句読点や文言の差し替えは許容しない。
 *
 * @param {string} sourceText
 * @param {string} documentText
 * @returns {boolean}
 */
export function sourceTextMatchesDocument(sourceText, documentText) {
  const source = normalizeCitationText(sourceText);
  if (source.length === 0) return false;
  return normalizeCitationText(documentText).includes(source);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function formatMarkdownCell(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length === 0) return '-';
  return text.replace(/\r?\n/gu, '<br>').replace(/\|/gu, '\\|');
}

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeCitationText(text) {
  return text.replace(WHITESPACE, '');
}
