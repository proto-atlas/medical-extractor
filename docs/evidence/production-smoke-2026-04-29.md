# Production Smoke Result

実施日: 2026-04-29
対象 URL: `https://medical-extractor.atlas-lab.workers.dev`
burst rate-limit 検証: スキップ (--burst-rate-limit で有効化)

## 静的ルート

| URL | 期待 | 実測 | pass | missing headers | forbidden headers |
|---|---:|---:|---|---|---|
| https://medical-extractor.atlas-lab.workers.dev/ | 200 | 200 | ✓ | - | - |
| https://medical-extractor.atlas-lab.workers.dev/icon.svg | 200 | 200 | ✓ | - | - |
| https://medical-extractor.atlas-lab.workers.dev/opengraph-image.svg | 200 | 200 | ✓ | - | - |
| https://medical-extractor.atlas-lab.workers.dev/_not-found | 404 | 404 | ✓ | - | - |

## API ルート (Anthropic 課金なし経路)

| URL | 期待 | 実測 | pass | error |
|---|---:|---:|---|---|
| https://medical-extractor.atlas-lab.workers.dev/api/auth (Authorization なし) | 401 | 401 | ✓ | {"error":"unauthorized"} |
| https://medical-extractor.atlas-lab.workers.dev/api/extract (Authorization なし) | 401 | 401 | ✓ | {"error":"unauthorized"} |

## 総合判定

✓ all pass
