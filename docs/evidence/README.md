# 検証記録の目次

確認時に使えるように、各主張の根拠ファイルがどこにあるかを 1 ページで示す。

## 一覧

| 主張 | 記録 | 実施コマンド | 実施日 |
|---|---|---|---|
| axe-core 4 シーンcritical/serious 0 + target-size WCAG AA/AAA通過 (interactive要素全体) | [`a11y-2026-04-27.md`](./a11y-2026-04-27.md) | `npm run a11y` | 2026-04-27 |
| Lighthouseスコア (Performance / Accessibility / Best Practices / SEO) とmeasurement note | [`lighthouse-2026-04-28.md`](./lighthouse-2026-04-28.md) / [`lighthouse-measurement-note-2026-04-29.md`](./lighthouse-measurement-note-2026-04-29.md) / [`lighthouse-2026-04-27.md`](./lighthouse-2026-04-27.md) | Lighthouse 13.0.1 + Edge headless / measurement procedure check | 2026-04-28 / 2026-04-29 |
| release記録 / 検査結果 | [`release-baseline-2026-04-29.md`](./release-baseline-2026-04-29.md) | `npm run verify:quality` / `npm run verify:release` | 2026-04-29 |
| Firefox / WebKit / Mobile Chrome / Mobile Safariのbrowser E2E | [`cross-browser-check-2026-04-29.md`](./cross-browser-check-2026-04-29.md) | GitHub Actions `e2e-browser-matrix` | 2026-04-29 |
| `source_text` の原文照合・mismatch時のAPI挙動 | [`source-text-validation-2026-04-29.md`](./source-text-validation-2026-04-29.md) | Vitest unit / route tests + existing SOAP実API評価 | 2026-04-29 |
| 実際のAnthropic APIでのSOAP構造正確性 + medical-domain notes | [`soap-eval-2026-04-28.md`](./soap-eval-2026-04-28.md) | `RUN_LIVE_ANTHROPIC=1 npm run eval:soap -- --limit=1` | 架空fixture 1件で20/20項目を確認 |
| `npm audit --audit-level=high` で 0 vulnerabilities | [`dependency-audit-2026-06-04.md`](./dependency-audit-2026-06-04.md) / [`npm-audit-2026-06-04.json`](./npm-audit-2026-06-04.json) | `npm audit --audit-level=high --json` | 2026-06-04 |
| 本番URLのstaticルート / API確認 (Anthropic課金なし経路) | [`production-check-2026-04-29.md`](./production-check-2026-04-29.md) / [`production-check-2026-04-29.json`](./production-check-2026-04-29.json) | `PRODUCTION_URL=https://medical-extractor.atlas-lab.workers.dev npm run check:production` | 2026-04-29 |
| Cloudflare Workers手動デプロイ | [`deployment-2026-04-29.md`](./deployment-2026-04-29.md) | `opennextjs-cloudflare deploy` | 2026-04-29 |
| medical-domain (FHIR R5 / ICD-10 / HIPAA / 匿名加工情報) の参照と境界 | [`../medical-domain-evidence.md`](../medical-domain-evidence.md) | (docs参照、eval出力にmention) | 2026-04-27 |

## screenshot画像

READMEのDemoセクションに埋め込まれているPC / SPデモスクリーンショット。Playwright `screenshots` project (`npm run screenshots`) で再生成可能。`/api/auth` と `/api/extract` をrouteで応答置き換えするためAnthropic API課金ゼロ。

| ファイル | viewport | シーン |
|---|---|---|
| [`../screenshots/pc-empty.png`](../screenshots/pc-empty.png) | 1280×800 | 認証 + プライバシー同意済の空状態 |
| [`../screenshots/pc-result.png`](../screenshots/pc-result.png) | 1280×800 | サンプル「歯科」抽出後のSOAP 4 カード |
| [`../screenshots/sp-empty.png`](../screenshots/sp-empty.png) | 393×852 (iPhone 15 相当) | 同上 (SP) |
| [`../screenshots/sp-result.png`](../screenshots/sp-result.png) | 393×852 | 同上 (SP) |

すべてlocalhost dev mode撮影。本番URLから再撮影する場合も同じ `npm run screenshots` を使用する。

## 自動チェック

### `npm run verify:quality` (品質検査)

以下を順に走らせる:

1. `npm run typecheck`
2. `npm run lint`
3. `npm run test:coverage` (Vitest 15 files / 136 tests + coverage閾値)
4. `npm run build` (next build --webpack)
5. `npm run e2e -- --project=chromium` (19 件)
6. `npm run verify:evidence` (evidence 7 件 + screenshots 4 枚の存在確認)

CI (`.github/workflows/ci.yml`) もquality-checkジョブで同等を実行 (`screenshots` はCIで再生成せず存在検査のみ)。加えて `e2e-browser-matrix` でFirefox / WebKit / Mobile Chrome / Mobile Safariの安全境界を確認する。

### `npm run verify:release` (release検査)

`verify:quality` が主な検査をまとめて実行し、`verify:release` はevidenceの状態を追加で検査する:

1. `lighthouse-*.md` に `Pending` / `score 0` / `対象URL: 未取得` → fail
2. `soap-eval-*.md` が `mode: dry-run` のみで 実API結果がない → fail
3. `dependency-audit-*.md` のpackage-lock SHA-256 hashが現行と異なる → fail (stale)
4. `production-check-*.md` または `.json` が存在しない → fail

以下を完遂すれば 通過 する設計:

- `LIGHTHOUSE_URL=https://... npm run lighthouse`
- `RUN_LIVE_ANTHROPIC=1 npm run eval:soap -- --limit=1`
- `npm audit --audit-level=high` (結果を `dependency-audit-*.md` にSHA-256 込みで反映)
- `PRODUCTION_URL=https://... npm run check:production`

## 未確認 / 制約 (`verify:release` で機械検出される項目)

- **本番rate-limit burst確認** (`/api/auth` 429 / `/api/extract` 429): 2026-04-28 snapshotで実施し、通常401確認で1回消費した後のburst内で `/api/auth` は5回目、`/api/extract` は10回目に429を確認済み ([`production-check-2026-04-28.md`](./production-check-2026-04-28.md))。2026-04-29 snapshotではrate-limit bucket消費を避けるためburstは再実行しない。
- **Lighthouse measurement warning**: 2026-04-28 に本番URLで正式スコアJSONは取得済み。ただしWindows Temp profile teardownが `EPERM` を返してCLI自体はexit 1。スコアは生成済みJSONから抽出。2026-04-29 に再現条件と0点レポート破棄方針を [`lighthouse-measurement-note-2026-04-29.md`](./lighthouse-measurement-note-2026-04-29.md) に記録し、`scripts/run-lighthouse.mjs` は `runtimeError` または全カテゴリ0点をevidenceとして書き出さない。
- **dependency-auditのpackage-lock hash鮮度**: `verify:release` がSHA-256 hash mismatchを検出した場合は `npm audit --audit-level=high` を再実行し、hash込みでevidenceを更新する
