# デプロイ検証スナップショット (2026-04-29)

このファイルは、特定時点の手動デプロイ結果を記録する事実ログです。リポジトリの最新HEADであることは主張しません。再確認時は、対象commitとCI runを外部入力として指定してください。

## 対象

- Project: `medical-extractor`
- 公開URL: `https://medical-extractor.atlas-lab.workers.dev`
- 対象実装commit: `44d1589c4d5626e38e7247c72b1a7312757f668c`
- 生成日時: `2026-04-29`
- デプロイ先: Cloudflare Workers
- デプロイ方法: OpenNext for Cloudflare build + deployment

## デプロイ結果

- 結果: 通過
- Cloudflare version ID: `14a0ef7a-32ee-44d0-8343-bce53329e14d`
- Worker startup time: `22 ms`
- Worker URL: `https://medical-extractor.atlas-lab.workers.dev`

## 確認したbindings

- `WORKER_SELF_REFERENCE`: Service Binding
- `AUTH_RATE_LIMITER`: Rate Limiter, 5 requests / 60 seconds
- `EXTRACT_AUTH_RATE_LIMITER`: Rate Limiter, 10 requests / 60 seconds
- `EXTRACT_RATE_LIMITER`: Rate Limiter, 5 requests / 60 seconds
- `ASSETS`: Assets

## 公開URLの静的ルート確認

- `HEAD /`: 200, `content-type: text/html; charset=utf-8`, `server: cloudflare`
- browser描画後のaccess preview: 通過
- browser描画後のSOAP preview: 通過
- browser描画後のno-clinical-use warning: 通過
- title: `medical-extractor: 医療文書SOAP構造化抽出デモ`

## 補足

- この確認では実Anthropic APIを呼びません。
- この確認では認証情報の推測やrate-limit burst testingを行いません。
- OpenNext buildはWindows互換性warningを出しましたが、deploymentは完了しました。
