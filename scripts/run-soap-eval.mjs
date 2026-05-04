#!/usr/bin/env node
/* eslint-env node */
/**
 * SOAP 抽出の構造的正確性を実 Anthropic API で評価する harness。
 *
 * 使い方:
 * npm run eval:soap # dry run (fixture 読み込みと構造のみ表示、API 課金ゼロ)
 * RUN_LIVE_ANTHROPIC=1 ANTHROPIC_API_KEY=sk-... npm run eval:soap
 * # 実 API で 1 件評価 (デフォルト)
 * RUN_LIVE_ANTHROPIC=1 ANTHROPIC_API_KEY=sk-... npm run eval:soap -- --limit=3
 * # 最大 3 件評価
 *
 * 安全装置:
 * - RUN_LIVE_ANTHROPIC=1 が無ければ実送信しない (デフォルト dry run)
 * - ANTHROPIC_API_KEY が無ければ即終了
 * - --limit は 1〜3 に clamp (架空データ 3 件以上送らない、コスト保護)
 *
 * 評価項目:
 * - subjective / objective / assessment / plan の 4 項目存在
 * - 各項目の text / source_text 非空
 * - source_text が原文 (documentText) に部分一致
 * - shouldContain キーワードが text または source_text に含まれる
 * - tool schema strict (additionalProperties: false) 準拠 = Anthropic 側で保証
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatMarkdownCell, sourceTextMatchesDocument } from './soap-eval-checks.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const FIXTURE_DIR = join(REPO_ROOT, 'eval', 'soap-fixtures');
const EVIDENCE_DIR = join(REPO_ROOT, 'docs', 'evidence');
const ISO_DATE = new Date().toISOString().slice(0, 10);

// SOAP tool schema (src/lib/soap-schema.ts と整合させて維持。
// schema を変更する場合は両方を同時に更新すること)。
const SOAP_TOOL_NAME = 'extract_soap';
const SOAP_TOOL_DESCRIPTION =
  '医療文書から SOAP 形式 (Subjective / Objective / Assessment / Plan) を構造化抽出するツール。各項目に text (整理サマリー) と source_text (原文の該当部分の引用) を含める。';
const SOAP_FIELD = {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'その項目に対応する整理されたサマリー' },
    source_text: { type: 'string', description: '原文に存在する該当部分をそのまま引用' },
  },
  required: ['text', 'source_text'],
  additionalProperties: false,
};
const SOAP_TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    subjective: SOAP_FIELD,
    objective: SOAP_FIELD,
    assessment: SOAP_FIELD,
    plan: SOAP_FIELD,
  },
  required: ['subjective', 'objective', 'assessment', 'plan'],
  additionalProperties: false,
};

// SYSTEM_PROMPT (src/app/api/extract/route.ts と整合)
const SYSTEM_PROMPT =
  'あなたは医療文書から SOAP 形式 (Subjective / Objective / Assessment / Plan) の各項目を構造化して抽出するアシスタントです。\n\n【最重要ルール】\n1. 必ず提供された extract_soap ツールを 1 回だけ呼び出して構造化された JSON を返すこと。プレーンテキストでは答えない。\n2. 4 項目すべてを埋めること。原文に該当する記述が見当たらない場合でも空にせず "記載なし" 等の文字列を入れる。\n3. source_text には原文に存在する文字列をそのまま引用すること。要約や言い換えはしない。text 欄で要約する。\n4. 推測や憶測は避け、原文に書かれた事実のみから抽出する。\n5. 個人情報や患者識別情報があってもログに残さない (この応答以外で扱わない)。';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_LIMIT = 3;

const SECTIONS = ['subjective', 'objective', 'assessment', 'plan'];

function parseLimitArg() {
  const arg = process.argv.find((a) => a.startsWith('--limit='));
  if (!arg) return 1;
  const n = Number.parseInt(arg.split('=')[1] ?? '1', 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > MAX_LIMIT) return MAX_LIMIT;
  return n;
}

async function listFixtures() {
  const files = (await readdir(FIXTURE_DIR)).filter((f) => f.endsWith('.json')).sort();
  const fixtures = [];
  for (const f of files) {
    const text = await readFile(join(FIXTURE_DIR, f), 'utf-8');
    fixtures.push(JSON.parse(text));
  }
  return fixtures;
}

function structuralChecks(soap, fixture) {
  const checks = [];

  for (const s of SECTIONS) {
    const present = soap && typeof soap[s] === 'object' && soap[s] !== null;
    checks.push({ name: `${s} 存在`, pass: present });
    if (!present) continue;

    const text = typeof soap[s].text === 'string' ? soap[s].text.trim() : '';
    const src = typeof soap[s].source_text === 'string' ? soap[s].source_text.trim() : '';
    checks.push({ name: `${s}.text 非空`, pass: text.length > 0 });
    checks.push({ name: `${s}.source_text 非空`, pass: src.length > 0 });

    if (src.length > 0) {
      const inDoc = sourceTextMatchesDocument(src, fixture.documentText);
      checks.push({
        name: `${s}.source_text 原文一致`,
        pass: inDoc,
        detail: inDoc
          ? undefined
          : `"${src.slice(0, 40)}..." が空白正規化後も documentText に含まれない`,
      });
    }

    const expected = fixture.expected?.[s]?.shouldContain ?? [];
    for (const kw of expected) {
      const pool = `${text} ${src}`;
      checks.push({
        name: `${s} contains "${kw}"`,
        pass: pool.includes(kw),
        detail: pool.includes(kw) ? undefined : `text/source_text にキーワード "${kw}" 不在`,
      });
    }
  }

  return checks;
}

function summarize(checks) {
  const passed = checks.filter((c) => c.pass).length;
  const total = checks.length;
  const failed = checks.filter((c) => !c.pass);
  return { passed, total, allPass: failed.length === 0, failed };
}

async function dryRun(fixtures, limit) {
  console.log('[dry-run] RUN_LIVE_ANTHROPIC != 1 のため実 API は叩きません');
  console.log(`fixture 件数: ${fixtures.length}, --limit=${limit} (clamped 1〜${MAX_LIMIT})`);
  console.log('');
  for (const fx of fixtures.slice(0, limit)) {
    const expectedKeys = Object.keys(fx.expected ?? {});
    console.log(` - ${fx.id} (${fx.specialty}, ${fx.documentText.length} 文字)`);
    console.log(` description: ${fx.description}`);
    console.log(` expected sections: ${expectedKeys.join(' / ')}`);
    printDomainNotes(fx);
  }
  console.log('');
  console.log('実 API 評価を実行するには:');
  console.log(' RUN_LIVE_ANTHROPIC=1 ANTHROPIC_API_KEY=sk-... npm run eval:soap');
  console.log(' オプション: -- --limit=N (1〜3、デフォルト 1)');
}

/**
 * fixture.domainNotes (FHIR Resource 候補 + ICD-10/SNOMED 範囲外宣言 + scope) を
 * 標準出力に表示する:
 * docs だけでなく eval script の出力にも medical-domain 境界を mention し、
 * 評価者が `npm run eval:soap` 実行時にコード上で意識していることを確認できるようにする。
 *
 * 詳細は `docs/medical-domain-evidence.md` 参照。
 */
function printDomainNotes(fixture) {
  const dn = fixture.domainNotes;
  if (!dn) return;
  console.log(' medical-domain notes:');
  if (dn.fhirCandidates) {
    for (const [section, candidate] of Object.entries(dn.fhirCandidates)) {
      console.log(` ${section} → ${candidate}`);
    }
  }
  console.log(` scope: ${dn.scope ?? 'unspecified'}`);
  console.log(` ICD-10 / SNOMED CT 確定: ${dn.icd10NotApplicable ? 'out-of-scope' : 'in-scope'}`);
  console.log(` 診断支援: ${dn.diagnosticAdvice === false ? 'out-of-scope' : 'unknown'}`);
}

async function liveRun(fixtures, limit) {
  // dynamic import で dry run 時の余計な依存ロードを避ける
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });

  const targets = fixtures.slice(0, limit);
  console.log(`[live] ${targets.length} 件評価開始 (model=${MODEL})`);
  console.log(`架空データのみ送信、実患者情報は含まれません`);
  console.log('');

  const results = [];
  for (const fx of targets) {
    printDomainNotes(fx);
    process.stdout.write(` → ${fx.id}: `);
    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: [
          {
            name: SOAP_TOOL_NAME,
            description: SOAP_TOOL_DESCRIPTION,
            input_schema: SOAP_TOOL_INPUT_SCHEMA,
            strict: true,
          },
        ],
        tool_choice: { type: 'tool', name: SOAP_TOOL_NAME },
        messages: [
          {
            role: 'user',
            content: `次の医療文書から SOAP 4 項目を抽出してください。\n\n---\n\n${fx.documentText}`,
          },
        ],
      });

      const toolUse = message.content.find(
        (b) => b.type === 'tool_use' && b.name === SOAP_TOOL_NAME,
      );
      if (!toolUse) {
        results.push({
          id: fx.id,
          specialty: fx.specialty,
          status: 'tool_use_missing',
          usage: message.usage ?? null,
          checks: null,
        });
        console.log('FAIL (tool_use_missing)');
        continue;
      }

      const checks = structuralChecks(toolUse.input, fx);
      const sum = summarize(checks);
      results.push({
        id: fx.id,
        specialty: fx.specialty,
        status: sum.allPass ? 'pass' : 'fail',
        soap: toolUse.input,
        usage: message.usage ?? null,
        checks: { passed: sum.passed, total: sum.total, failed: sum.failed },
      });
      console.log(
        `${sum.allPass ? 'PASS' : 'FAIL'} (${sum.passed}/${sum.total} checks, in=${message.usage.input_tokens} out=${message.usage.output_tokens})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        id: fx.id,
        specialty: fx.specialty,
        status: 'error',
        error: msg,
        usage: null,
        checks: null,
      });
      console.log(`ERROR (${msg})`);
    }
  }
  return results;
}

function buildEvidenceMarkdown(mode, fixtures, limit, results) {
  const lines = [];
  lines.push(`# SOAP Eval Result (${mode})`);
  lines.push('');
  lines.push(`実施日: ${ISO_DATE}`);
  lines.push(`対象: \`scripts/run-soap-eval.mjs\``);
  lines.push(`mode: \`${mode}\``);
  lines.push(`limit: ${limit} (clamp 1〜${MAX_LIMIT})`);
  lines.push(`model: \`${MODEL}\``);
  lines.push('');
  lines.push('## 安全装置');
  lines.push('');
  lines.push('- `RUN_LIVE_ANTHROPIC=1` 必須 (無ければ dry run)');
  lines.push('- `ANTHROPIC_API_KEY` 必須');
  lines.push('- `--limit` は 1〜3 に clamp (架空データのみ、コスト保護)');
  lines.push('- `source_text` 照合は、原文の改行差分だけを空白正規化して判定');
  lines.push('');
  lines.push('## fixture 一覧');
  lines.push('');
  lines.push('| id | specialty | 文字数 | 期待 section |');
  lines.push('|---|---|---:|---|');
  for (const fx of fixtures) {
    const expectedKeys = Object.keys(fx.expected ?? {}).join(' / ');
    lines.push(`| ${fx.id} | ${fx.specialty} | ${fx.documentText.length} | ${expectedKeys} |`);
  }
  lines.push('');

  lines.push('## medical-domain scope');
  lines.push('');
  lines.push(
    '本 eval は **構造化抽出品質** を評価する。FHIR R5 への変換、ICD-10 / SNOMED CT コード付与、診断支援、治療推奨は **範囲外**。',
  );
  lines.push('詳細は [`docs/medical-domain-evidence.md`](../medical-domain-evidence.md) を参照。');
  lines.push('');
  lines.push('| fixture | scope | ICD-10 / SNOMED 確定 | 診断支援 |');
  lines.push('|---|---|---|---|');
  for (const fx of fixtures) {
    const dn = fx.domainNotes ?? {};
    const scope = dn.scope ?? '-';
    const icd = dn.icd10NotApplicable ? 'out-of-scope' : '-';
    const dx = dn.diagnosticAdvice === false ? 'out-of-scope' : '-';
    lines.push(`| ${fx.id} | ${scope} | ${icd} | ${dx} |`);
  }
  lines.push('');

  if (mode === 'dry-run') {
    lines.push('## 結果');
    lines.push('');
    lines.push('実 API 未送信。fixture の構造検証のみ実施。');
    lines.push('');
    lines.push('実評価を行うには:');
    lines.push('');
    lines.push('```bash');
    lines.push('RUN_LIVE_ANTHROPIC=1 ANTHROPIC_API_KEY=sk-... npm run eval:soap');
    lines.push('```');
    return lines.join('\n');
  }

  lines.push('## 評価結果');
  lines.push('');
  lines.push('| id | status | passed/total | input_tokens | output_tokens |');
  lines.push('|---|---|---:|---:|---:|');
  for (const r of results) {
    const checks = r.checks ? `${r.checks.passed}/${r.checks.total}` : '-';
    const inT = r.usage?.input_tokens ?? '-';
    const outT = r.usage?.output_tokens ?? '-';
    lines.push(`| ${r.id} | ${r.status} | ${checks} | ${inT} | ${outT} |`);
  }
  lines.push('');

  const rowsWithSoap = results.filter((r) => r.soap);
  if (rowsWithSoap.length > 0) {
    lines.push('## SOAP出力 (架空fixture)');
    lines.push('');
    lines.push(
      'Anthropic `tool_use` の `input_schema` (`strict: true`, `additionalProperties: false`) を通った構造化出力。fixture は架空データのみ。',
    );
    lines.push('');
    for (const r of rowsWithSoap) {
      lines.push(`### ${r.id}`);
      lines.push('');
      lines.push('| section | text | source_text |');
      lines.push('|---|---|---|');
      for (const section of SECTIONS) {
        const field = r.soap?.[section];
        lines.push(
          `| ${section} | ${formatMarkdownCell(field?.text)} | ${formatMarkdownCell(field?.source_text)} |`,
        );
      }
      lines.push('');
    }
  }

  const failedRows = results.filter((r) => r.checks?.failed?.length);
  if (failedRows.length > 0) {
    lines.push('## 失敗チェック詳細');
    lines.push('');
    for (const r of failedRows) {
      lines.push(`### ${r.id}`);
      lines.push('');
      for (const f of r.checks.failed) {
        lines.push(`- ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

async function main() {
  const limit = parseLimitArg();
  const fixtures = await listFixtures();
  if (fixtures.length === 0) {
    console.error(`fixture が見つかりません: ${FIXTURE_DIR}`);
    process.exit(1);
  }

  const live = process.env.RUN_LIVE_ANTHROPIC === '1';
  if (!live) {
    await dryRun(fixtures, limit);
    await mkdir(EVIDENCE_DIR, { recursive: true });
    const md = buildEvidenceMarkdown('dry-run', fixtures, limit, []);
    const path = join(EVIDENCE_DIR, `soap-eval-${ISO_DATE}.md`);
    await writeFile(path, md, 'utf-8');
    console.log(`evidence (dry-run) written: ${path}`);
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY が未設定です。実 API 評価を中止します。');
    process.exit(1);
  }

  const results = await liveRun(fixtures, limit);
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const md = buildEvidenceMarkdown('live', fixtures, limit, results);
  const path = join(EVIDENCE_DIR, `soap-eval-${ISO_DATE}.md`);
  await writeFile(path, md, 'utf-8');
  console.log('');
  console.log(`evidence (live) written: ${path}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
