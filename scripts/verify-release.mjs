#!/usr/bin/env node
/* eslint-env node */
/**
 * `verify:evidence` の状態検査版。
 *
 * `verify:evidence` がファイル存在しか見ない弱点を補い、
 * release 前ゲートとして以下を機械検出する:
 *
 * 1. lighthouse-*.md の正式スコアファイルに "Pending" / "score 0" / "対象 URL: 未取得" → fail
 * 2. soap-eval-*.md が "mode: `dry-run`" のみで live 結果がない → fail
 * 3. dependency-audit-*.md の package-lock hash が現行と異なる → fail (stale)
 * 4. production-smoke-*.md または .json が存在しない → fail
 *
 * 設計:
 * - `verify:portfolio` はそのまま高速ローカルゲート (本ファイルは含めない)
 * - `verify:release` (本ファイル) は全 evidence が揃ったことを機械保証するゲート
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findLatestEvidenceFile } from './evidence-files.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const EVIDENCE_DIR = join(REPO_ROOT, 'docs', 'evidence');

/**
 * package-lock.json の SHA-256 を計算。dependency-audit-*.md に記録された
 * hash と比較することで、新規 dep 追加後の audit 未更新を検出する。
 */
async function computePackageLockHash() {
  const path = join(REPO_ROOT, 'package-lock.json');
  try {
    const content = await readFile(path, 'utf-8');
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

async function listEvidenceFiles() {
  try {
    return await readdir(EVIDENCE_DIR);
  } catch {
    return [];
  }
}

async function readEvidence(filename) {
  if (!filename) return null;
  try {
    return await readFile(join(EVIDENCE_DIR, filename), 'utf-8');
  } catch {
    return null;
  }
}

async function checkLighthouse(files) {
  const scoreFiles = files.filter((file) => !file.includes('cleanup-note'));
  const md = findLatestEvidenceFile(scoreFiles, 'lighthouse');
  if (!md) return { ok: false, reason: 'lighthouse-*.md not found' };
  const content = await readEvidence(md);
  if (!content) return { ok: false, reason: `failed to read ${md}` };
  if (!content.includes('| Performance |') || !content.includes('| Accessibility |')) {
    return { ok: false, reason: 'Lighthouse score table not found', file: md };
  }
  // Pending / score 0 / 対象 URL: 未取得 / 状態: Pending を検出
  const pendingMarkers = [
    'Pending',
    '対象 URL: 未取得',
    '状態: **Pending',
    '| Performance | 0 |',
    '| Accessibility | 0 |',
  ];
  const found = pendingMarkers.filter((m) => content.includes(m));
  if (found.length > 0) {
    return { ok: false, reason: `Pending マーカー検出: ${found.join(' / ')}`, file: md };
  }
  return { ok: true, file: md };
}

async function checkSoapEval(files) {
  const md = findLatestEvidenceFile(files, 'soap-eval');
  if (!md) return { ok: false, reason: 'soap-eval-*.md not found' };
  const content = await readEvidence(md);
  if (!content) return { ok: false, reason: `failed to read ${md}` };
  // mode: `dry-run` のみで live 結果がない場合は fail
  const isDryRunHeader = content.includes('mode: `dry-run`');
  const hasLiveResult = content.includes('mode: `live`') || content.includes('## 評価結果');
  if (isDryRunHeader && !hasLiveResult) {
    return {
      ok: false,
      reason: 'dry-run のみ、live 評価結果がない (RUN_LIVE_ANTHROPIC=1 で実行が必要)',
      file: md,
    };
  }
  return { ok: true, file: md };
}

async function checkDependencyAudit(files) {
  const md = findLatestEvidenceFile(files, 'dependency-audit');
  if (!md) return { ok: false, reason: 'dependency-audit-*.md not found' };
  const content = await readEvidence(md);
  if (!content) return { ok: false, reason: `failed to read ${md}` };

  // package-lock hash が evidence に記録されているか確認
  const recordedHash = content.match(/package-lock\.json\s+SHA-?256[:\s]+([a-f0-9]{64})/i);
  const currentHash = await computePackageLockHash();

  if (!recordedHash) {
    // hash 未記録 → stale 判定
    return {
      ok: false,
      reason: 'package-lock SHA-256 が evidence に未記録 (新規 dep 追加後の audit 再実行が必要)',
      file: md,
      currentHash,
    };
  }

  if (currentHash && recordedHash[1] !== currentHash) {
    return {
      ok: false,
      reason: `package-lock hash mismatch: evidence=${recordedHash[1].slice(0, 12)}... vs current=${currentHash.slice(0, 12)}... (新規 dep 追加後の audit 再実行が必要)`,
      file: md,
    };
  }

  return { ok: true, file: md };
}

async function checkProductionSmoke(files) {
  const md = findLatestEvidenceFile(files, 'production-smoke');
  const json = findLatestEvidenceFile(files, 'production-smoke', '.json');
  if (!md && !json) {
    return {
      ok: false,
      reason:
        'production-smoke-*.md / .json が存在しない (PRODUCTION_URL=... npm run smoke:production の実行が必要)',
    };
  }
  const mdContent = await readEvidence(md);
  if (md && mdContent?.includes('✗')) {
    return { ok: false, reason: 'production smoke に fail marker (✗) が含まれる', file: md };
  }
  const jsonContent = await readEvidence(json);
  if (json && jsonContent?.includes('"pass": false')) {
    return { ok: false, reason: 'production smoke JSON に pass=false が含まれる', file: json };
  }
  return { ok: true, file: md ?? json };
}

async function main() {
  console.log('verify:release — 全 evidence の状態検査');
  console.log('');

  const files = await listEvidenceFiles();
  if (files.length === 0) {
    console.error(`docs/evidence/ にファイルがありません: ${EVIDENCE_DIR}`);
    process.exit(1);
  }

  const results = [
    { name: 'Lighthouse', ...(await checkLighthouse(files)) },
    { name: 'SOAP eval (live)', ...(await checkSoapEval(files)) },
    { name: 'dependency audit (hash 鮮度)', ...(await checkDependencyAudit(files)) },
    { name: 'production smoke', ...(await checkProductionSmoke(files)) },
  ];

  let allOk = true;
  for (const r of results) {
    const mark = r.ok ? '✓' : '✗';
    console.log(`${mark} ${r.name}`);
    if (!r.ok) {
      console.log(` reason: ${r.reason}`);
      if (r.file) console.log(` file: docs/evidence/${r.file}`);
      allOk = false;
    } else if (r.file) {
      console.log(` file: docs/evidence/${r.file}`);
    }
  }

  console.log('');
  if (!allOk) {
    console.error('verify:release: FAIL (1 件以上の evidence が未完または stale)');
    console.error('以下を完遂し、再実行してください:');
    console.error(' - LIGHTHOUSE_URL=https://... npm run lighthouse');
    console.error(' - RUN_LIVE_ANTHROPIC=1 npm run eval:soap -- --limit=1');
    console.error(' - npm audit --audit-level=high (結果を dependency-audit-*.md に反映)');
    console.error(' - PRODUCTION_URL=https://... npm run smoke:production');
    process.exit(1);
  }
  console.log('verify:release: PASS (全 evidence 揃い)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
