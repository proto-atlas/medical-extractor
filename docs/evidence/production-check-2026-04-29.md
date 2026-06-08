# 公開URL確認結果

実施日: 2026-04-29
対象URL: `https://medical-extractor.atlas-lab.workers.dev`
burst rate-limit検証: スキップ (--burst-rate-limitで有効化)

## 静的ルート

| URL | 期待 | 実測 | 通過 | missing headers | forbidden headers |
|---|---:|---:|---|---|---|
| https://medical-extractor.atlas-lab.workers.dev/ | 200 | 200 | ✓ | - | - |
| https://medical-extractor.atlas-lab.workers.dev/icon.svg | 200 | 200 | ✓ | - | - |
| https://medical-extractor.atlas-lab.workers.dev/opengraph-image.svg | 200 | 200 | ✓ | - | - |
| https://medical-extractor.atlas-lab.workers.dev/_not-found | 404 | 404 | ✓ | - | - |

## APIルート (Anthropic課金なし経路)

| URL | 期待 | 実測 | 通過 | error |
|---|---:|---:|---|---|
| https://medical-extractor.atlas-lab.workers.dev/api/auth (Authorizationなし) | 401 | 401 | ✓ | {"error":"unauthorized"} |
| https://medical-extractor.atlas-lab.workers.dev/api/extract (Authorizationなし) | 401 | 401 | ✓ | {"error":"unauthorized"} |

## 総合判定

✓ すべて通過
