# Evidence Index

第三者確認向けに、各主張の根拠ファイルがどこにあるかを 1 ページで示す。

## 一覧

| 主張 | Evidence | 実施コマンド | 実施日 |
|---|---|---|---|
| axe-core 4 シーン critical/serious 0 + target-size WCAG AA/AAA pass (interactive 要素全体) | [`a11y-2026-04-27.md`](./a11y-2026-04-27.md) | `npm run a11y` | 2026-04-27 |
| Lighthouse スコア (Performance / Accessibility / Best Practices / SEO) と cleanup note | [`lighthouse-2026-04-28.md`](./lighthouse-2026-04-28.md) / [`lighthouse-cleanup-note-2026-04-29.md`](./lighthouse-cleanup-note-2026-04-29.md) / [`lighthouse-2026-04-27.md`](./lighthouse-2026-04-27.md) | Lighthouse 13.0.1 + Edge headless / measurement procedure hardening | 2026-04-28 / 2026-04-29 |
| Release baseline / release gate | [`release-baseline-2026-04-29.md`](./release-baseline-2026-04-29.md) | `npm run verify:portfolio` / `npm run verify:release` | 2026-04-29 |
| Firefox / WebKit / Mobile Chrome / Mobile Safari の smoke E2E | [`cross-browser-smoke-2026-04-29.md`](./cross-browser-smoke-2026-04-29.md) | GitHub Actions `e2e-smoke-matrix` | 2026-04-29 |
| `source_text` の原文照合・mismatch時のAPI挙動 | [`source-text-validation-2026-04-29.md`](./source-text-validation-2026-04-29.md) | Vitest unit / route tests + existing live SOAP eval | 2026-04-29 |
| 実 Anthropic API での SOAP 構造正確性 + medical-domain notes | [`soap-eval-2026-04-28.md`](./soap-eval-2026-04-28.md) | `RUN_LIVE_ANTHROPIC=1 npm run eval:soap -- --limit=1` | live 20/20 checks pass |
| `npm audit --audit-level=high` で 0 high / 0 critical + moderate advisory map | [`dependency-audit-2026-04-29.md`](./dependency-audit-2026-04-29.md) / [`dependency-advisory-map-2026-04-29.md`](./dependency-advisory-map-2026-04-29.md) / [`npm-audit-2026-04-29.json`](./npm-audit-2026-04-29.json) | `npm audit --audit-level=high --json` | 2026-04-29 |
| 本番 URL の static ルート / API smoke (Anthropic 課金なし経路) | [`production-smoke-2026-04-29.md`](./production-smoke-2026-04-29.md) / [`production-smoke-2026-04-29.json`](./production-smoke-2026-04-29.json) | `PRODUCTION_URL=https://medical-extractor.atlas-lab.workers.dev npm run smoke:production` | 2026-04-29 |
| Cloudflare Workers 手動デプロイ | [`deployment-2026-04-29.md`](./deployment-2026-04-29.md) | `opennextjs-cloudflare deploy` | 2026-04-29 |
| medical-domain (FHIR R5 / ICD-10 / HIPAA / 匿名加工情報) の参照と境界 | [`../medical-domain-evidence.md`](../medical-domain-evidence.md) | (docs 参照、eval 出力に mention) | 2026-04-27 |

## docs/screenshots

README の Demo セクションに埋め込まれている PC / SP デモスクリーンショット。Playwright `screenshots` project (`npm run screenshots`) で再生成可能。`/api/auth` と `/api/extract` を route mock するため Anthropic API 課金ゼロ。

| ファイル | viewport | シーン |
|---|---|---|
| [`../screenshots/pc-empty.png`](../screenshots/pc-empty.png) | 1280×800 | 認証 + プライバシー同意済の空状態 |
| [`../screenshots/pc-result.png`](../screenshots/pc-result.png) | 1280×800 | サンプル「歯科」抽出後の SOAP 4 カード |
| [`../screenshots/sp-empty.png`](../screenshots/sp-empty.png) | 393×852 (iPhone 15 相当) | 同上 (SP) |
| [`../screenshots/sp-result.png`](../screenshots/sp-result.png) | 393×852 | 同上 (SP) |

すべて localhost dev mode 撮影。本番 URL から再撮影する場合も同じ `npm run screenshots` を使用する。

## 自動チェック

### `npm run verify:portfolio` (quality gate)

以下を順に走らせる:

1. `npm run typecheck`
2. `npm run lint`
3. `npm run test:coverage` (Vitest 15 files / 136 tests + coverage gate)
4. `npm run build` (next build --webpack)
5. `npm run e2e -- --project=chromium` (19 件)
6. `npm run verify:evidence` (evidence 7 件 + screenshots 4 枚の存在確認)

CI (`.github/workflows/ci.yml`) も quality-gate ジョブで同等を実行 (`screenshots` は CI で再生成せず存在検査のみ)。加えて `e2e-smoke-matrix` で Firefox / WebKit / Mobile Chrome / Mobile Safari の安全境界 smoke を実行する。

### `npm run verify:release` (release 前ゲート)

`verify:portfolio` がファイル存在しか見ない弱点を補強する状態検査ゲート:

1. `lighthouse-*.md` に `Pending` / `score 0` / `対象 URL: 未取得` → fail
2. `soap-eval-*.md` が `mode: dry-run` のみで live 結果がない → fail
3. `dependency-audit-*.md` の package-lock SHA-256 hash が現行と異なる → fail (stale)
4. `production-smoke-*.md` または `.json` が存在しない → fail

以下を完遂すれば pass する設計:

- `LIGHTHOUSE_URL=https://... npm run lighthouse`
- `RUN_LIVE_ANTHROPIC=1 npm run eval:soap -- --limit=1`
- `npm audit --audit-level=high` (結果を `dependency-audit-*.md` に SHA-256 込みで反映)
- `PRODUCTION_URL=https://... npm run smoke:production`

## 未確認 / 制約 (`verify:release` で機械検出される項目)

- **本番 rate-limit burst smoke** (`/api/auth` 429 / `/api/extract` 429): 2026-04-28 snapshot で実施し、通常401 smokeで1回消費した後のburst内で `/api/auth` は5回目、`/api/extract` は10回目に429を確認済み ([`production-smoke-2026-04-28.md`](./production-smoke-2026-04-28.md))。2026-04-29 snapshot では rate-limit bucket 消費を避けるため burst は再実行しない。
- **Lighthouse cleanup warning**: 2026-04-28 に本番 URL で正式スコア JSON は取得済み。ただし Windows Temp profile cleanup が `EPERM` を返して CLI 自体は exit 1。スコアは生成済み JSON から抽出。2026-04-29 に再現条件と0点レポート破棄方針を [`lighthouse-cleanup-note-2026-04-29.md`](./lighthouse-cleanup-note-2026-04-29.md) に記録し、`scripts/run-lighthouse.mjs` は `runtimeError` または全カテゴリ0点を evidence として書き出さない。
- **dependency-audit の package-lock hash 鮮度**: `verify:release` が SHA-256 hash mismatch を検出した場合は `npm audit --audit-level=high` を再実行し、hash 込みで evidence を更新する
