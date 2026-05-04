# Lighthouse Cleanup Note (2026-04-29)

## Scope

- Project: `medical-extractor`
- Evidence generated from commit: `ad539026617c583a9f666d94069253e355e0be0d`
- Public URL: `https://medical-extractor.atlas-lab.workers.dev/`
- Check type: Lighthouse measurement procedure hardening
- Result: procedure updated; no new score snapshot accepted

## Confirmed Behavior

2026-04-29 に本番 URL で Lighthouse を再実行したところ、Windows + Playwright Chromium の組み合わせで profile cleanup `EPERM` が再現した。

同じ再実行では Lighthouse score が `0 / 0 / 0 / 0` になったため、正式なスコア証跡としては採用しない。生成された `lighthouse-2026-04-29.md` と `lighthouse-2026-04-29.json` は削除し、コミットしていない。

採用中の正式スコアは、2026-04-28 の Microsoft Edge headless (`CHROME_PATH`) で取得した以下のsnapshot:

| Strategy | Performance | Accessibility | Best Practices | SEO |
|---|---:|---:|---:|---:|
| desktop | 100 | 95 | 100 | 100 |
| mobile | 89 | 95 | 100 | 100 |

## Script Guardrail

`scripts/run-lighthouse.mjs` を更新し、以下を追加した:

- `CHROME_PATH` がある場合は Microsoft Edge / Chrome stable を優先する
- `runtimeError` または全カテゴリ `0` の結果は evidence として書き出さない
- 有効な evidence 書き出し後の Chrome cleanup failure は、score failure ではなく環境 cleanup noise として警告扱いにする

## Stable Measurement Procedure

Windows で正式スコアを再取得する場合は、Edge / Chrome stable を `CHROME_PATH` で指定する。

```powershell
$env:CHROME_PATH = "<Edge or Chrome executable path>"
$env:LIGHTHOUSE_URL = "https://medical-extractor.atlas-lab.workers.dev/"
npm run lighthouse
```

Linux runner を使える場合は、Linux上のChrome/Chromiumで同じURLを計測する。

## Not Performed

- Live Anthropic API call
- Rate-limit burst test
- Credential guessing
- Real patient data / PHI input
