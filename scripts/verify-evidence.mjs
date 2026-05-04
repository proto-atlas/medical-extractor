#!/usr/bin/env node
/* eslint-env node */
/**
 * `npm run verify:evidence`。
 *
 * 公開レビューに必要な evidence 一式 (docs/evidence/*.md と docs/screenshots/*.png)
 * が揃っているか機械的に確認する。各 evidence は YYYY-MM-DD 付きのファイル名で運用する想定。
 * prefix が一致するファイルが 1 つ以上あれば pass。
 *
 * evidence の抜け漏れを防ぐためのスモークガード。
 * 個々の evidence の中身までは検査しない (それは人がレビューする)。
 */

import { readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findLatestEvidenceFile } from './evidence-files.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const REQUIRED_EVIDENCE_PREFIXES = ['a11y', 'lighthouse', 'soap-eval', 'dependency-audit'];

const REQUIRED_SCREENSHOTS = ['pc-empty.png', 'pc-result.png', 'sp-empty.png', 'sp-result.png'];

async function main() {
  const issues = [];
  const okLines = [];

  let evidenceFiles = [];
  try {
    evidenceFiles = await readdir(join(REPO_ROOT, 'docs', 'evidence'));
  } catch {
    issues.push('Missing directory: docs/evidence/');
  }
  for (const prefix of REQUIRED_EVIDENCE_PREFIXES) {
    const candidates =
      prefix === 'lighthouse'
        ? evidenceFiles.filter((file) => !file.includes('cleanup-note'))
        : evidenceFiles;
    const found = findLatestEvidenceFile(candidates, prefix);
    if (!found) {
      issues.push(`Missing evidence: docs/evidence/${prefix}-*.md`);
    } else {
      okLines.push(` ✓ ${prefix} → docs/evidence/${found}`);
    }
  }

  for (const name of REQUIRED_SCREENSHOTS) {
    const path = join(REPO_ROOT, 'docs', 'screenshots', name);
    try {
      const s = await stat(path);
      if (!s.isFile()) {
        issues.push(`Not a file: docs/screenshots/${name}`);
      } else {
        okLines.push(` ✓ docs/screenshots/${name}`);
      }
    } catch {
      issues.push(`Missing screenshot: docs/screenshots/${name}`);
    }
  }

  if (okLines.length > 0) {
    console.log('Present:');
    for (const l of okLines) console.log(l);
  }

  if (issues.length > 0) {
    console.error('');
    console.error('Missing evidence:');
    for (const i of issues) console.error(` - ${i}`);
    process.exit(1);
  }

  console.log('');
  console.log(
    `All required evidence present (${REQUIRED_EVIDENCE_PREFIXES.length} docs + ${REQUIRED_SCREENSHOTS.length} screenshots).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
