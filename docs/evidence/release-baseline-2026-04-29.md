# release検証スナップショット (2026-04-29)

このファイルは特定時点の検証スナップショットです。リポジトリの最新HEADであることは主張しません。再確認時は、対象commitとCI runを外部入力として指定してください。

## 対象

- Project: `medical-extractor`
- 記録対象の実装commit: `44d1589c4d5626e38e7247c72b1a7312757f668c`
- 記録commit: このファイルを含むrepository commit
- 公開URL: `https://medical-extractor.atlas-lab.workers.dev`
- このsnapshotのCI run: リポジトリ内では固定しない。確認時は対象commitとCI runを外部入力として指定する。
- 手動deploy: 完了。Cloudflare Version IDは再deployごとに変わるため、このsnapshotでは [`deployment-2026-04-29.md`](./deployment-2026-04-29.md) に事実ログとして記録する。

## ローカル検証

`npm run verify:quality`

- typecheck: 通過
- lint: 通過
- test:coverage: 15 files / 136 tests通過
- coverage: Statements 94.11 / Branches 87.95 / Functions 100 / Lines 96.75
- build: 通過
- E2E Chromium: 18 / 18 通過
- verify:evidence: 通過
- verify:release: 通過

`npm run verify:release`

- Lighthouse: 通過 (`lighthouse-2026-04-28.md`)
- SOAP実API評価: 通過 (`soap-eval-2026-04-28.md`, 20/20 checks)
- dependency audit freshness: 通過 (`dependency-audit-2026-04-29.md`)
- 公開URL確認: 通過 (`production-check-2026-04-29.md`)

## 外部送信を伴う検証

- `RUN_LIVE_ANTHROPIC=1 npm run eval:soap -- --limit=1`
  - 架空fixture `dental-001` のみ送信
  - 実患者情報は含めない
  - 結果: 20/20 項目通過
- `npm audit --audit-level=high --json`
  - high: 0
  - critical: 0
  - moderate: 6
  - `package-lock.json SHA-256`: `61a825063a173234a5be1375d5dcc14ef828fd9f88f70531e1acbd21827afae2`

## 残存制約

- 本番rate-limit burst確認は 2026-04-28 snapshotで実施済み。2026-04-29 snapshotではrate-limit bucket消費を避けるため再実行していない。
- GitHub ActionsのCloudflare deploy jobはrepository secrets設定に依存する。
- Lighthouse 2026-04-28 はスコアJSON作成後のWindows profile teardownでCLI exit 1 になったが、JSONは生成済み。2026-04-29 に再現条件と0点レポート破棄方針を [`lighthouse-measurement-note-2026-04-29.md`](./lighthouse-measurement-note-2026-04-29.md) に記録済み。
