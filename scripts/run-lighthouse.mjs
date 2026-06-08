#!/usr/bin/env node
/* eslint-env node */
/**
 * ローカル / 本番URLに対してLighthouseを実行し、スコアとreportを保存する。
 *
 * 使い方:
 * 1. 別ターミナルでdev serverを起動
 * npm run dev
 * 2. 本スクリプトを実行
 * npm run lighthouse # http://localhost:3000/ を評価
 * LIGHTHOUSE_URL=https://example.workers.dev/ npm run lighthouse
 * # 任意URLを評価
 *
 * 出力: docs/evidence/lighthouse-{ISO_DATE}.json (full report)、
 * docs/evidence/lighthouse-{ISO_DATE}.md (スコアサマリ)
 *
 * 注意:
 * - next dev modeではHMR / React debug overheadでPerformance scoreが本番より下がる
 * (Lighthouse公式docs推奨は本番buildをnext startした結果)
 * - 認証ゲート (PasswordGate) があるため評価できるのはlogin画面 (/) のみ
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const EVIDENCE_DIR = join(REPO_ROOT, 'docs', 'evidence');
const ISO_DATE = new Date().toISOString().slice(0, 10);
// LIGHTHOUSE_URL環境変数で本番URLを渡す運用を推奨 (Linux runner / 本番URL)。
// localhost devサーバ計測はWindows + headlessでscore 0 になる既知問題があり、
// 現時点ではPending扱い (`docs/evidence/lighthouse-2026-04-27.md`)。
const TARGET_URL = process.env.LIGHTHOUSE_URL ?? 'http://localhost:3000/';
const IS_PRODUCTION_URL = TARGET_URL.startsWith('https://');

function buildMarkdown(url, scores, lhr) {
  const lines = [];
  lines.push('# Lighthouse Report');
  lines.push('');
  lines.push(`実施日: ${ISO_DATE}`);
  lines.push(`対象URL: \`${url}\``);
  lines.push(`Lighthouseバージョン: ${lhr.lighthouseVersion}`);
  lines.push(`Fetch time: ${lhr.fetchTime}`);
  lines.push('');
  lines.push('## スコア (0〜100)');
  lines.push('');
  lines.push('| カテゴリ | スコア |');
  lines.push('|---|---:|');
  lines.push(`| Performance | ${scores.performance} |`);
  lines.push(`| Accessibility | ${scores.accessibility} |`);
  lines.push(`| Best Practices | ${scores.bestPractices} |`);
  lines.push(`| SEO | ${scores.seo} |`);
  lines.push('');
  lines.push('## 注意事項');
  lines.push('');
  lines.push(`- 本評価は \`${url}\` に対する計測です`);
  lines.push(
    '- next dev modeではHMR / React debug overheadでPerformanceが本番より低く出る傾向あり',
  );
  lines.push('- Accessibility / Best Practices / SEOはdev / prodでほぼ同じスコア');
  lines.push('- 認証ゲート (PasswordGate) があるため評価できるのはlogin画面 (/) のみ');
  lines.push('');
  lines.push(
    'full reportは同じディレクトリの `lighthouse-{date}.json` をChrome DevToolsのLighthouseタブまたは [https://googlechrome.github.io/lighthouse/viewer/](https://googlechrome.github.io/lighthouse/viewer/) で読み込んでください。',
  );
  return lines.join('\n');
}

async function main() {
  console.log(`Lighthouse target: ${TARGET_URL}`);
  if (!IS_PRODUCTION_URL) {
    console.warn(
      'WARNING: localhost (http) を計測しています。Windows + headlessではscore 0 が返る既知問題があります。',
    );
    console.warn(
      '推奨: LIGHTHOUSE_URL=https://... でproduction URLを指定するか、Linux runnerで実行してください。',
    );
  }
  const { default: lighthouse } = await import('lighthouse');
  const { launch } = await import('chrome-launcher');
  // WindowsではPlaywright Chromiumのprofile teardownでEPERMになることがあるため、
  // CHROME_PATHが指定されている場合はEdge/Chrome stableを優先する。
  const { chromium: pwChromium } = await import('@playwright/test');
  const chromePath = process.env.CHROME_PATH ?? pwChromium.executablePath();

  const chrome = await launch({
    chromePath,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  let wroteEvidence = false;
  try {
    const result = await lighthouse(TARGET_URL, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    });

    if (!result) {
      console.error('Lighthouse returned no result');
      process.exit(1);
    }

    const lhr = result.lhr;
    const cats = lhr.categories;
    const scores = {
      performance: Math.round((cats.performance?.score ?? 0) * 100),
      accessibility: Math.round((cats.accessibility?.score ?? 0) * 100),
      bestPractices: Math.round((cats['best-practices']?.score ?? 0) * 100),
      seo: Math.round((cats.seo?.score ?? 0) * 100),
    };
    const hasRuntimeError = Boolean(lhr.runtimeError);
    const allScoresZero = Object.values(scores).every((score) => score === 0);

    if (hasRuntimeError || allScoresZero) {
      console.error('Lighthouse result is not acceptable evidence.');
      if (hasRuntimeError) {
        console.error(`runtimeError: ${JSON.stringify(lhr.runtimeError)}`);
      }
      console.error(`scores: ${JSON.stringify(scores)}`);
      throw new Error('Lighthouse result is not acceptable evidence.');
    }

    console.log('\nScores:');
    for (const [k, v] of Object.entries(scores)) {
      console.log(` ${k}: ${v}`);
    }

    await mkdir(EVIDENCE_DIR, { recursive: true });
    const jsonPath = join(EVIDENCE_DIR, `lighthouse-${ISO_DATE}.json`);
    await writeFile(jsonPath, result.report, 'utf-8');
    const mdPath = join(EVIDENCE_DIR, `lighthouse-${ISO_DATE}.md`);
    await writeFile(mdPath, buildMarkdown(TARGET_URL, scores, lhr), 'utf-8');
    wroteEvidence = true;

    console.log('\nevidence written:');
    console.log(` ${jsonPath}`);
    console.log(` ${mdPath}`);
  } finally {
    try {
      await chrome.kill();
    } catch (err) {
      if (!wroteEvidence) {
        throw err;
      }
      console.warn(
        'WARNING: Chrome profile teardown failed after valid evidence was written. Treat this as environment noise, not a Lighthouse score failure.',
      );
      console.warn(err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
