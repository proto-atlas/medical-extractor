# Release Evidence Snapshot (2026-04-29)

このファイルは特定時点の検証スナップショットです。リポジトリの最新HEADであることは主張しません。第三者確認で対象にするcommitとCI runは、確認時に外部入力として指定してください。

## 対象

- Project: `medical-extractor`
- Evidence generated from implementation commit: `44d1589c4d5626e38e7247c72b1a7312757f668c`
- Evidence commit: このファイルを含む repository commit
- Public URL: `https://medical-extractor.atlas-lab.workers.dev`
- CI run observed for this snapshot: リポジトリ内では固定しない。第三者確認では対象commitとCI runを外部入力として指定する。
- Manual deploy: completed. Cloudflare Version ID は再deployごとに変わるため、このsnapshotでは [`deployment-2026-04-29.md`](./deployment-2026-04-29.md) に事実ログとして記録する。

## ローカル検証

`npm run verify:portfolio`

- typecheck: pass
- lint: pass
- test:coverage: 15 files / 136 tests pass
- coverage: Statements 94.11 / Branches 87.95 / Functions 100 / Lines 96.75
- build: pass
- E2E Chromium: 18 / 18 pass
- verify:evidence: pass
- verify:release: pass

`npm run verify:release`

- Lighthouse: pass (`lighthouse-2026-04-28.md`)
- SOAP eval live: pass (`soap-eval-2026-04-28.md`, 20/20 checks)
- dependency audit freshness: pass (`dependency-audit-2026-04-29.md`)
- production smoke: pass (`production-smoke-2026-04-29.md`)

## 外部送信を伴う検証

- `RUN_LIVE_ANTHROPIC=1 npm run eval:soap -- --limit=1`
  - 架空 fixture `dental-001` のみ送信
  - 実患者情報は含めない
  - 結果: 20/20 checks pass
- `npm audit --audit-level=high --json`
  - high: 0
  - critical: 0
  - moderate: 6
  - `package-lock.json SHA-256`: `61a825063a173234a5be1375d5dcc14ef828fd9f88f70531e1acbd21827afae2`

## 残存制約

- 本番 rate-limit burst smoke は 2026-04-28 snapshot で実施済み。2026-04-29 snapshot では rate-limit bucket 消費を避けるため再実行していない。
- GitHub Actions の Cloudflare deploy job は repository secrets 設定に依存する。
- Lighthouse 2026-04-28 はスコア JSON 作成後の Windows profile cleanup で CLI exit 1 になったが、JSON は生成済み。2026-04-29 に再現条件と0点レポート破棄方針を [`lighthouse-cleanup-note-2026-04-29.md`](./lighthouse-cleanup-note-2026-04-29.md) に記録済み。
