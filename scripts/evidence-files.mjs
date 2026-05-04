const DATE_IN_FILENAME = /-(\d{4}-\d{2}-\d{2})(?:\.|-|$)/u;

/**
 * release evidence は同じ prefix で履歴を残すため、状態検査では最新日付を読む。
 *
 * @param {string[]} files
 * @param {string} prefix
 * @param {string} [suffix]
 * @returns {string | undefined}
 */
export function findLatestEvidenceFile(files, prefix, suffix = '.md') {
  const candidates = files
    .filter((file) => file.startsWith(`${prefix}-`) && file.endsWith(suffix))
    .map((file) => ({ file, date: extractEvidenceDate(file) }));

  if (candidates.length === 0) return undefined;

  candidates.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.file.localeCompare(a.file);
  });

  return candidates[0]?.file;
}

/**
 * @param {string} file
 * @returns {string}
 */
function extractEvidenceDate(file) {
  return file.match(DATE_IN_FILENAME)?.[1] ?? '';
}
