# ブラウザ別確認記録

記録対象commit: `85952483c9ddf0a4322684fc22f6faa958e0cf0f`

生成日時: `2026-04-29T19:01:10+09:00`

公開URL: https://medical-extractor.atlas-lab.workers.dev

確認種別: GitHub Actions cross-browser確認 / local E2E確認

結果: 通過記録

## 対象

この記録は特定時点の確認結果であり、最新のrepository HEADと一致することは主張しない。

目的は、以前のChromium中心のE2E確認より広いbrowserで挙動を確認することです。

## 変更内容

- `e2e/cross-browser-check.spec.ts`を追加。
- GitHub Actions job `e2e-browser-matrix`を追加。
- Matrix projects:
  - `firefox`
  - `webkit`
  - `mobile-chrome`
  - `mobile-safari`
- 既存のChromium E2Eは`e2e` jobに残しています。
- `デプロイ` jobは`quality-check`、`e2e`、`e2e-browser-matrix`に依存します。

## 確認シナリオ

このmatrixでは、mock authとprivacy acknowledgement後に次を確認します:

- アプリ見出しが表示されること。
- 架空データのみ、実患者データなし、診断用途ではないという境界文が表示されること。
- 医療テキスト入力欄が表示されること。
- 架空テキスト入力後に抽出submit buttonが有効になること。

この確認では、Anthropic実API呼び出しを意図的に避けています。

## GitHub Actions結果

Run: `25102429281`

実行契機: `main` へのpush

対象commit: `85952483c9ddf0a4322684fc22f6faa958e0cf0f`

全体結果: 成功

| Job | Result |
|---|---|
| `quality-check` | 通過 |
| `e2e` | 通過 |
| `e2e-browser-matrix (firefox)` | 通過 |
| `e2e-browser-matrix (webkit)` | 通過 |
| `e2e-browser-matrix (mobile-chrome)` | 通過 |
| `e2e-browser-matrix (mobile-safari)` | 通過 |
| `デプロイ` | Cloudflare secretsが未設定だったためdeployment stepsはskip |

成果物:

- ChromiumのPlaywright report
- FirefoxのPlaywright report
- WebKitのPlaywright report
- mobile ChromeのPlaywright report
- mobile SafariのPlaywright report

## ローカル確認

Windowsでのローカル確認:

| Command | Result | Notes |
|---|---|---|
| `node node_modules\typescript\bin\tsc --noEmit` | 通過 | typecheck |
| `node node_modules\eslint\bin\eslint.js .` | 通過 | lint |
| `node node_modules\prettier\bin\prettier.cjs --check .` | 通過 | formatting |
| `node node_modules\vitest\vitest.mjs run --coverage` | 通過 | 15 files / 136 tests |
| `node node_modules\next\dist\bin\next build --webpack` | 通過 | production build |
| `node node_modules\@playwright\test\cli.js test --project=chromium --workers=1` | 通過 | 19 tests |
| `node node_modules\@playwright\test\cli.js test e2e/cross-browser-check.spec.ts --project=mobile-chrome --workers=1` | 通過 | local mobile Chrome check |

localのFirefox / WebKit / Mobile Safariは、Windows Playwright cacheにbrowser binaryが入っていなかったため実行していません。GitHub Actions matrixでは `chromium firefox webkit` をinstallし、Ubuntu上で各projectがpassしました。

## 実施していないこと

- 実際のAnthropic API呼び出し。
- 認証情報の推測。
- rate-limit連打試験。
- 実患者データやPHIの入力。
