# Lighthouse Report (Pending)

実施日: 2026-04-27
対象 URL: 未取得
状態: **Pending — 現時点では環境制約により正式スコア取得できず**

## 経緯

`scripts/run-lighthouse.mjs` + `npm run lighthouse` で local dev server (`http://localhost:3000/`) に対して Lighthouse を実行した結果、Windows 環境で以下の問題が発生:

1. `chrome-launcher` が Chrome stable をシステム上で見つけられない (`ChromeNotInstalledError`、本リポは Playwright 同梱の Chromium しか持たない)
2. Playwright 同梱の Chromium binary を `chromePath` で渡したところ Chrome 起動には成功したが、Lighthouse が navigate 後にすべてのカテゴリで score 0 を返した (headless + Windows + custom Chromium binary の組み合わせで Lighthouse の measurement protocol が安定しない既知の問題)
3. Chrome 終了時に `EPERM` (`%TEMP%\lighthouse.*` ディレクトリ削除権限拒否)

## 次のステップ (優先順)

1. **GitHub Actions (Linux runner) で実施**: ubuntu-latest + Google Chrome 標準インストールがあるため `chrome-launcher` がそのまま動く。`.github/workflows/ci.yml` に `npm run lighthouse` step を追加し artifact 保存する案
2. **本番 Cloudflare Workers URL に対して実施**: 認証ゲートがあるため login 画面 (`/`) のみ評価可能。dev mode より production の方が Performance score が安定する
3. **ローカル Windows でも Chrome stable をインストールして再評価**: ユーザー環境次第

## 取得時の目標

| カテゴリ | 目標 |
|---|---:|
| Performance | 90+ |
| Accessibility | 95+ |
| Best Practices | (記録のみ) |
| SEO | (記録のみ) |

Accessibility は現時点内で `e2e/a11y.spec.ts` (axe-core 4 シーン critical/serious 0) と `e2e/target-size.spec.ts` (WCAG AA 24px / 主要 button AAA 44px) で機械検証済 (`docs/evidence/a11y-2026-04-27.md`)。Lighthouse Accessibility は axe-core サブセットを内部で使うため、上記評価が pass している以上 95+ は届く見込み (推測 — 未実測)。

## 実行手順 (取得側で実施)

```bash
# 別ターミナルで dev server を起動
npm run dev
# 本ターミナルで Lighthouse 実行 (デフォルト http://localhost:3000/)
npm run lighthouse
# または本番 URL
LIGHTHOUSE_URL=https://medical-extractor.atlas-lab.workers.dev/ npm run lighthouse
```

成功時は `docs/evidence/lighthouse-{date}.json` (full report) と `docs/evidence/lighthouse-{date}.md` (スコアサマリ) が上書き保存される。
