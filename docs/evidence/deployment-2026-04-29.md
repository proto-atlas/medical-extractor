# Deployment Evidence Snapshot (2026-04-29)

このファイルは、特定時点の手動デプロイ結果を記録する事実ログです。リポジトリの最新HEADであることは主張しません。第三者確認で対象にするcommitとCI runは、確認時に外部入力として指定してください。

## Scope

- Project: `medical-extractor`
- Public URL: `https://medical-extractor.atlas-lab.workers.dev`
- Source implementation commit: `44d1589c4d5626e38e7247c72b1a7312757f668c`
- Generated at: `2026-04-29`
- Deployment target: Cloudflare Workers
- Deployment method: OpenNext for Cloudflare build + deploy

## Deploy Result

- Result: pass
- Cloudflare Version ID: `14a0ef7a-32ee-44d0-8343-bce53329e14d`
- Worker Startup Time: `22 ms`
- Worker URL: `https://medical-extractor.atlas-lab.workers.dev`

## Bindings Observed

- `WORKER_SELF_REFERENCE`: Service Binding
- `AUTH_RATE_LIMITER`: Rate Limiter, 5 requests / 60 seconds
- `EXTRACT_AUTH_RATE_LIMITER`: Rate Limiter, 10 requests / 60 seconds
- `EXTRACT_RATE_LIMITER`: Rate Limiter, 5 requests / 60 seconds
- `ASSETS`: Assets

## Production Static Smoke

- `HEAD /`: 200, `content-type: text/html; charset=utf-8`, `server: cloudflare`
- Browser-rendered access preview: pass
- Browser-rendered SOAP preview: pass
- Browser-rendered no-clinical-use warning: pass
- Title: `medical-extractor — 医療文書 SOAP 構造化抽出デモ`

## Notes

- This smoke does not call live Anthropic APIs.
- This smoke does not perform credential guessing or rate-limit burst testing.
- The OpenNext build printed a Windows compatibility warning; deployment completed successfully.
