# Lighthouse計測記録（pending）

実施日: 2026-04-27
対象URL: 未取得
状態: **Pending: 現時点では環境制約により正式スコア取得できず**

## 経緯

`scripts/run-lighthouse.mjs` + `npm run lighthouse` でlocal dev server (`http://localhost:3000/`) に対してLighthouseを実行した結果、Windows環境で以下の問題が発生:

1. `chrome-launcher` がChrome stableをシステム上で見つけられない (`ChromeNotInstalledError`、本リポはPlaywright同梱のChromiumしか持たない)
2. Playwright同梱のChromium binaryを `chromePath` で渡したところChrome起動には成功したが、Lighthouseがnavigate後にすべてのカテゴリでscore 0 を返した (headless + Windows + custom Chromium binaryの組み合わせでLighthouseのmeasurement protocolが安定しない既知の問題)
3. Chrome終了時に `EPERM` (`%TEMP%\lighthouse.*` ディレクトリ削除権限拒否)

## 次のステップ (優先順)

1. **GitHub Actions (Linux runner) で実施**: ubuntu-latest + Google Chrome標準インストールがあるため `chrome-launcher` がそのまま動く。`.github/workflows/ci.yml` に `npm run lighthouse` stepを追加しartifact保存する案
2. **本番Cloudflare Workers URLに対して実施**: 認証ゲートがあるためlogin画面 (`/`) のみ評価可能。dev modeよりproductionの方がPerformance scoreが安定する
3. **ローカルWindowsでもChrome stableをインストールして再評価**: ユーザー環境次第

## 取得時の目標

| カテゴリ | 目標 |
|---|---:|
| Performance | 90+ |
| Accessibility | 95+ |
| Best Practices | (記録のみ) |
| SEO | (記録のみ) |

Accessibilityは現時点内で `e2e/a11y.spec.ts` (axe-core 4 シーンcritical/serious 0) と `e2e/target-size.spec.ts` (WCAG AA 24px / 主要button AAA 44px) で機械検証済 (`docs/evidence/a11y-2026-04-27.md`)。Lighthouse Accessibilityはaxe-coreサブセットを内部で使うため、上記評価が 通過 している以上 95+ は届く見込み (推測: 未実測)。

## 実行手順 (取得側で実施)

```bash
# 別ターミナルでdev serverを起動
npm run dev
# 本ターミナルでLighthouse実行 (デフォルトhttp://localhost:3000/)
npm run lighthouse
# または本番URL
LIGHTHOUSE_URL=https://medical-extractor.atlas-lab.workers.dev/ npm run lighthouse
```

成功時は `docs/evidence/lighthouse-{date}.json` (full report) と `docs/evidence/lighthouse-{date}.md` (スコアサマリ) が上書き保存される。
