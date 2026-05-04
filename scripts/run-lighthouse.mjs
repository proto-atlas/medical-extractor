#!/usr/bin/env node
/* eslint-env node */
/**
 * ローカル / 本番 URL に対して Lighthouse を実行し、スコアと report を保存する。
 *
 * 使い方:
 * 1. 別ターミナルで dev server を起動
 * npm run dev
 * 2. 本スクリプトを実行
 * npm run lighthouse # http://localhost:3000/ を評価
 * LIGHTHOUSE_URL=https://example.workers.dev/ npm run lighthouse
 * # 任意 URL を評価
 *
 * 出力: docs/evidence/lighthouse-{ISO_DATE}.json (full report)、
 * docs/evidence/lighthouse-{ISO_DATE}.md (スコアサマリ)
 *
 * 注意:
 * - next dev mode では HMR / React debug overhead で Performance score が本番より下がる
 * (Lighthouse 公式 docs 推奨は本番 build を next start した結果)
 * - 認証ゲート (PasswordGate) があるため評価できるのは login 画面 (/) のみ
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const EVIDENCE_DIR = join(REPO_ROOT, 'docs', 'evidence');
const ISO_DATE = new Date().toISOString().slice(0, 10);
// LIGHTHOUSE_URL 環境変数で本番 URL を渡す運用を推奨 (Linux runner / 本番 URL)。
// localhost dev サーバ計測は Windows + headless で score 0 になる既知問題があり、
// 現時点では Pending 扱い (`docs/evidence/lighthouse-2026-04-27.md`)。
const TARGET_URL = process.env.LIGHTHOUSE_URL ?? 'http://localhost:3000/';
const IS_PRODUCTION_URL = TARGET_URL.startsWith('https://');

function buildMarkdown(url, scores, lhr) {
  const lines = [];
  lines.push('# Lighthouse Report');
  lines.push('');
  lines.push(`実施日: ${ISO_DATE}`);
  lines.push(`対象 URL: \`${url}\``);
  lines.push(`Lighthouse バージョン: ${lhr.lighthouseVersion}`);
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
    '- next dev mode では HMR / React debug overhead で Performance が本番より低く出る傾向あり',
  );
  lines.push('- Accessibility / Best Practices / SEO は dev / prod でほぼ同じスコア');
  lines.push('- 認証ゲート (PasswordGate) があるため評価できるのは login 画面 (/) のみ');
  lines.push('');
  lines.push(
    'full report は同じディレクトリの `lighthouse-{date}.json` を Chrome DevTools の Lighthouse タブまたは [https://googlechrome.github.io/lighthouse/viewer/](https://googlechrome.github.io/lighthouse/viewer/) で読み込んでください。',
  );
  return lines.join('\n');
}

async function main() {
  console.log(`Lighthouse target: ${TARGET_URL}`);
  if (!IS_PRODUCTION_URL) {
    console.warn(
      'WARNING: localhost (http) を計測しています。Windows + headless では score 0 が返る既知問題があります。',
    );
    console.warn(
      '推奨: LIGHTHOUSE_URL=https://... で production URL を指定するか、Linux runner で実行してください。',
    );
  }
  const { default: lighthouse } = await import('lighthouse');
  const { launch } = await import('chrome-launcher');
  // Windows では Playwright Chromium のprofile cleanupでEPERMになることがあるため、
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
        'WARNING: Chrome cleanup failed after valid evidence was written. Treat this as environment cleanup noise, not a Lighthouse score failure.',
      );
      console.warn(err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
