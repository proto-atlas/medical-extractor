#!/usr/bin/env node
/* eslint-env node */
/**
 * 本番 URL に対する smoke テスト。
 *
 * 本番確認チェックリストを script 化し、production smoke evidence を生成する。
 *
 * 使い方:
 * PRODUCTION_URL=https://medical-extractor.atlas-lab.workers.dev node scripts/smoke-production.mjs
 *
 * 出力:
 * docs/evidence/production-smoke-{ISO_DATE}.md (人間用サマリ)
 * docs/evidence/production-smoke-{ISO_DATE}.json (生 result)
 *
 * 安全装置:
 * - PRODUCTION_URL 必須 (デフォルトなし、誤って localhost に投げない)
 * - rate-limit を消費する 6/11 連打は別フラグ (`--burst-rate-limit`) でのみ実行
 * (運用中の影響を避けるため、デフォルトは status / headers 検査のみ)
 * - Anthropic 課金経路 (/api/extract の正規 Bearer + body) は実行しない
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const EVIDENCE_DIR = join(REPO_ROOT, 'docs', 'evidence');
const ISO_DATE = new Date().toISOString().slice(0, 10);

const PRODUCTION_URL = process.env.PRODUCTION_URL;
const BURST_RATE_LIMIT = process.argv.includes('--burst-rate-limit');
const AUTH_LIMIT = 5;
const EXTRACT_AUTH_LIMIT = 10;
const PRIOR_UNAUTHORIZED_SMOKE_REQUESTS = 1;
const AUTH_EXPECTED_FIRST_429_ATTEMPT = AUTH_LIMIT - PRIOR_UNAUTHORIZED_SMOKE_REQUESTS + 1;
const EXTRACT_AUTH_EXPECTED_FIRST_429_ATTEMPT =
  EXTRACT_AUTH_LIMIT - PRIOR_UNAUTHORIZED_SMOKE_REQUESTS + 1;

const REQUIRED_HEADERS = [
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
  'strict-transport-security',
  'content-security-policy',
];
const FORBIDDEN_HEADERS = ['x-powered-by'];

if (!PRODUCTION_URL) {
  console.error('PRODUCTION_URL 環境変数が必須です');
  console.error(
    '例: PRODUCTION_URL=https://medical-extractor.atlas-lab.workers.dev node scripts/smoke-production.mjs',
  );
  process.exit(1);
}

const base = PRODUCTION_URL.replace(/\/$/, '');

async function fetchSafe(url, init) {
  try {
    const res = await fetch(url, init);
    return { ok: true, res };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function checkHeaders(res) {
  const found = {};
  const missing = [];
  for (const name of REQUIRED_HEADERS) {
    const v = res.headers.get(name);
    if (v) found[name] = v;
    else missing.push(name);
  }
  const forbidden = {};
  for (const name of FORBIDDEN_HEADERS) {
    const v = res.headers.get(name);
    if (v) forbidden[name] = v;
  }
  return { found, missing, forbidden };
}

async function checkStatic(path, expectedStatus) {
  const url = `${base}${path}`;
  const r = await fetchSafe(url, { method: 'GET', redirect: 'manual' });
  if (!r.ok) return { url, error: r.error, pass: false };
  const status = r.res.status;
  const pass = status === expectedStatus;
  const headerCheck = checkHeaders(r.res);
  return {
    url,
    status,
    expectedStatus,
    pass,
    headersFound: headerCheck.found,
    headersMissing: headerCheck.missing,
    headersForbidden: headerCheck.forbidden,
  };
}

async function checkAuthUnauthorized() {
  const url = `${base}/api/auth`;
  const r = await fetchSafe(url, { method: 'POST' });
  if (!r.ok) return { url, error: r.error, pass: false };
  let body = null;
  try {
    body = await r.res.json();
  } catch {
    /* ignore */
  }
  const pass = r.res.status === 401 && body?.error === 'unauthorized';
  return { url, status: r.res.status, expectedStatus: 401, body, pass };
}

async function checkExtractUnauthorized() {
  const url = `${base}/api/extract`;
  const r = await fetchSafe(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentText: '架空文書' }),
  });
  if (!r.ok) return { url, error: r.error, pass: false };
  let body = null;
  try {
    body = await r.res.json();
  } catch {
    /* ignore */
  }
  const pass = r.res.status === 401 && body?.error === 'unauthorized';
  return { url, status: r.res.status, expectedStatus: 401, body, pass };
}

async function checkAuthRateLimit() {
  // 直前の no-auth smoke が auth bucket を 1 回消費するため、
  // burst 内では 5 回目に 429 を期待 (auth scope は 5 req/60s)。
  const url = `${base}/api/auth`;
  const responses = [];
  for (let i = 0; i < 6; i++) {
    const r = await fetchSafe(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-key-for-burst-test' },
    });
    if (!r.ok) {
      responses.push({ attempt: i + 1, error: r.error });
      continue;
    }
    let body = null;
    try {
      body = await r.res.json();
    } catch {
      /* ignore */
    }
    responses.push({
      attempt: i + 1,
      status: r.res.status,
      retryAfter: r.res.headers.get('retry-after'),
      body,
    });
  }
  const first429Attempt = responses.find((r) => r.status === 429)?.attempt ?? null;
  const pass = first429Attempt === AUTH_EXPECTED_FIRST_429_ATTEMPT;
  return {
    url,
    responses,
    first429Attempt,
    expectedFirst429Attempt: AUTH_EXPECTED_FIRST_429_ATTEMPT,
    pass,
  };
}

async function checkExtractPreAuthRateLimit() {
  // 直前の no-auth smoke が extract-auth bucket を 1 回消費するため、
  // burst 内では 10 回目に 429 を期待 (extract-auth scope は 10 req/60s)。
  // Anthropic 課金は発生しない (auth check 前に弾かれる)
  const url = `${base}/api/extract`;
  const responses = [];
  for (let i = 0; i < 11; i++) {
    const r = await fetchSafe(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong-key-for-burst-test',
      },
      body: JSON.stringify({ documentText: '架空文書' }),
    });
    if (!r.ok) {
      responses.push({ attempt: i + 1, error: r.error });
      continue;
    }
    let body = null;
    try {
      body = await r.res.json();
    } catch {
      /* ignore */
    }
    responses.push({
      attempt: i + 1,
      status: r.res.status,
      retryAfter: r.res.headers.get('retry-after'),
      body,
    });
  }
  const first429Attempt = responses.find((r) => r.status === 429)?.attempt ?? null;
  const pass = first429Attempt === EXTRACT_AUTH_EXPECTED_FIRST_429_ATTEMPT;
  return {
    url,
    responses,
    first429Attempt,
    expectedFirst429Attempt: EXTRACT_AUTH_EXPECTED_FIRST_429_ATTEMPT,
    pass,
  };
}

function buildMarkdown(result) {
  const lines = [];
  lines.push('# Production Smoke Result');
  lines.push('');
  lines.push(`実施日: ${ISO_DATE}`);
  lines.push(`対象 URL: \`${base}\``);
  lines.push(
    `burst rate-limit 検証: ${BURST_RATE_LIMIT ? '実施' : 'スキップ (--burst-rate-limit で有効化)'}`,
  );
  lines.push('');
  lines.push('## 静的ルート');
  lines.push('');
  lines.push('| URL | 期待 | 実測 | pass | missing headers | forbidden headers |');
  lines.push('|---|---:|---:|---|---|---|');
  for (const r of result.staticRoutes) {
    const missing = r.headersMissing?.join(', ') || '-';
    const forbidden = Object.keys(r.headersForbidden ?? {}).join(', ') || '-';
    lines.push(
      `| ${r.url} | ${r.expectedStatus} | ${r.status ?? r.error ?? '?'} | ${r.pass ? '✓' : '✗'} | ${missing} | ${forbidden} |`,
    );
  }
  lines.push('');
  lines.push('## API ルート (Anthropic 課金なし経路)');
  lines.push('');
  lines.push('| URL | 期待 | 実測 | pass | error |');
  lines.push('|---|---:|---:|---|---|');
  lines.push(
    `| ${result.authUnauth.url} (Authorization なし) | 401 | ${result.authUnauth.status ?? '?'} | ${result.authUnauth.pass ? '✓' : '✗'} | ${JSON.stringify(result.authUnauth.body) ?? '-'} |`,
  );
  lines.push(
    `| ${result.extractUnauth.url} (Authorization なし) | 401 | ${result.extractUnauth.status ?? '?'} | ${result.extractUnauth.pass ? '✓' : '✗'} | ${JSON.stringify(result.extractUnauth.body) ?? '-'} |`,
  );
  lines.push('');
  if (BURST_RATE_LIMIT) {
    lines.push('## Rate-Limit Burst 検証');
    lines.push('');
    lines.push(
      '注意: 本検証は本番 rate-limit bucket を一時的に消費する。実行時刻と他利用者への影響を確認すること。',
    );
    lines.push('');
    lines.push('### auth scope (5 req/60s)');
    lines.push('');
    lines.push('| attempt | status | retry-after | body |');
    lines.push('|---:|---:|---|---|');
    for (const r of result.authBurst.responses) {
      lines.push(
        `| ${r.attempt} | ${r.status ?? '-'} | ${r.retryAfter ?? '-'} | ${JSON.stringify(r.body) ?? '-'} |`,
      );
    }
    lines.push('');
    lines.push(
      `${result.authBurst.expectedFirst429Attempt} 回目で 429 を期待: ${result.authBurst.pass ? '✓ pass' : '✗ fail'} (実測: ${result.authBurst.first429Attempt ?? 'なし'})`,
    );
    lines.push('');
    lines.push('### extract-auth scope (10 req/60s, 認証前 limiter)');
    lines.push('');
    lines.push('| attempt | status | retry-after | body |');
    lines.push('|---:|---:|---|---|');
    for (const r of result.extractBurst.responses) {
      lines.push(
        `| ${r.attempt} | ${r.status ?? '-'} | ${r.retryAfter ?? '-'} | ${JSON.stringify(r.body) ?? '-'} |`,
      );
    }
    lines.push('');
    lines.push(
      `${result.extractBurst.expectedFirst429Attempt} 回目で 429 を期待: ${result.extractBurst.pass ? '✓ pass' : '✗ fail'} (実測: ${result.extractBurst.first429Attempt ?? 'なし'})`,
    );
    lines.push('');
  }
  lines.push('## 総合判定');
  lines.push('');
  const allPass = [
    ...result.staticRoutes,
    result.authUnauth,
    result.extractUnauth,
    ...(BURST_RATE_LIMIT ? [result.authBurst, result.extractBurst] : []),
  ].every((r) => r.pass);
  lines.push(allPass ? '✓ all pass' : '✗ 1 件以上 fail');
  return lines.join('\n');
}

async function main() {
  console.log(`Production smoke target: ${base}`);
  console.log(
    `Burst rate-limit: ${BURST_RATE_LIMIT ? 'enabled' : 'disabled (--burst-rate-limit to enable)'}`,
  );
  console.log('');

  const staticRoutes = [];
  for (const [path, expected] of [
    ['/', 200],
    ['/icon.svg', 200],
    ['/opengraph-image.svg', 200],
    ['/_not-found', 404],
  ]) {
    process.stdout.write(` GET ${path} ... `);
    const r = await checkStatic(path, expected);
    staticRoutes.push(r);
    console.log(`${r.pass ? '✓' : '✗'} (${r.status ?? r.error ?? '?'})`);
  }

  process.stdout.write(' POST /api/auth (no auth) ... ');
  const authUnauth = await checkAuthUnauthorized();
  console.log(`${authUnauth.pass ? '✓' : '✗'} (${authUnauth.status ?? authUnauth.error ?? '?'})`);

  process.stdout.write(' POST /api/extract (no auth) ... ');
  const extractUnauth = await checkExtractUnauthorized();
  console.log(
    `${extractUnauth.pass ? '✓' : '✗'} (${extractUnauth.status ?? extractUnauth.error ?? '?'})`,
  );

  let authBurst = null;
  let extractBurst = null;
  if (BURST_RATE_LIMIT) {
    console.log('');
    console.log(' [burst] /api/auth × 6 (通常401 smokeで1回消費後、burst 5回目に429を期待)');
    authBurst = await checkAuthRateLimit();
    console.log(` → ${authBurst.pass ? `✓ ${authBurst.first429Attempt} 件目で 429` : '✗ fail'}`);
    console.log(' [burst] /api/extract × 11 (通常401 smokeで1回消費後、burst 10回目に429を期待)');
    extractBurst = await checkExtractPreAuthRateLimit();
    console.log(
      ` → ${extractBurst.pass ? `✓ ${extractBurst.first429Attempt} 件目で 429` : '✗ fail'}`,
    );
  }

  const result = {
    target: base,
    runAt: new Date().toISOString(),
    burstRateLimit: BURST_RATE_LIMIT,
    staticRoutes,
    authUnauth,
    extractUnauth,
    authBurst,
    extractBurst,
  };

  await mkdir(EVIDENCE_DIR, { recursive: true });
  const jsonPath = join(EVIDENCE_DIR, `production-smoke-${ISO_DATE}.json`);
  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf-8');
  const mdPath = join(EVIDENCE_DIR, `production-smoke-${ISO_DATE}.md`);
  await writeFile(mdPath, `${buildMarkdown(result)}\n`, 'utf-8');

  console.log('');
  console.log(`evidence written:`);
  console.log(` ${jsonPath}`);
  console.log(` ${mdPath}`);

  const allPass = [
    ...staticRoutes,
    authUnauth,
    extractUnauth,
    ...(BURST_RATE_LIMIT ? [authBurst, extractBurst] : []),
  ].every((r) => r && r.pass);
  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
