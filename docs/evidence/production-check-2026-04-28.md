# 公開URL確認結果

実施日: 2026-04-28
対象URL: `https://medical-extractor.atlas-lab.workers.dev`
burst rate-limit検証: 実施

## 静的ルート

| URL | 期待 | 実測 | 通過 | missing headers | forbidden headers |
|---|---:|---:|---|---|---|
| https://medical-extractor.atlas-lab.workers.dev/ | 200 | 200 | ✓ | - | - |
| https://medical-extractor.atlas-lab.workers.dev/icon.svg | 200 | 200 | ✓ | - | - |
| https://medical-extractor.atlas-lab.workers.dev/opengraph-image.svg | 200 | 200 | ✓ | x-content-type-options, x-frame-options, referrer-policy, permissions-policy, strict-transport-security, content-security-policy | - |
| https://medical-extractor.atlas-lab.workers.dev/_not-found | 404 | 404 | ✓ | - | - |

## APIルート (Anthropic課金なし経路)

| URL | 期待 | 実測 | 通過 | error |
|---|---:|---:|---|---|
| https://medical-extractor.atlas-lab.workers.dev/api/auth (Authorizationなし) | 401 | 401 | ✓ | {"error":"unauthorized"} |
| https://medical-extractor.atlas-lab.workers.dev/api/extract (Authorizationなし) | 401 | 401 | ✓ | {"error":"unauthorized"} |

## Rate-Limit Burst検証

注意: 本検証は本番rate-limit bucketを一時的に消費する。実行時刻と他利用者への影響を確認すること。

### auth scope (5 req/60s)

| attempt | status | retry-after | body |
|---:|---:|---|---|
| 1 | 401 | - | {"error":"unauthorized"} |
| 2 | 401 | - | {"error":"unauthorized"} |
| 3 | 401 | - | {"error":"unauthorized"} |
| 4 | 401 | - | {"error":"unauthorized"} |
| 5 | 429 | 60 | {"error":"rate_limit","retryAfterSeconds":60} |
| 6 | 429 | 60 | {"error":"rate_limit","retryAfterSeconds":60} |

5 回目で 429 を期待: ✓ 通過 (実測: 5)

### extract-auth scope (10 req/60s, 認証前limiter)

| attempt | status | retry-after | body |
|---:|---:|---|---|
| 1 | 401 | - | {"error":"unauthorized"} |
| 2 | 401 | - | {"error":"unauthorized"} |
| 3 | 401 | - | {"error":"unauthorized"} |
| 4 | 401 | - | {"error":"unauthorized"} |
| 5 | 401 | - | {"error":"unauthorized"} |
| 6 | 401 | - | {"error":"unauthorized"} |
| 7 | 401 | - | {"error":"unauthorized"} |
| 8 | 401 | - | {"error":"unauthorized"} |
| 9 | 401 | - | {"error":"unauthorized"} |
| 10 | 429 | 60 | {"error":"rate_limit","retryAfterSeconds":60} |
| 11 | 429 | 60 | {"error":"rate_limit","retryAfterSeconds":60} |

10 回目で 429 を期待: ✓ 通過 (実測: 10)

## 総合判定

✓ すべて通過
