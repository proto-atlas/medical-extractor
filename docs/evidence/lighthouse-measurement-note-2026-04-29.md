# Lighthouse計測メモ (2026-04-29)

## 対象

- Project: `medical-extractor`
- 記録対象commit: `ad539026617c583a9f666d94069253e355e0be0d`
- 公開URL: `https://medical-extractor.atlas-lab.workers.dev/`
- 確認種別: Lighthouse計測手順確認
- 結果: procedure updated。新しいscore snapshotは採用しない

## 確認した挙動

2026-04-29 に本番URLでLighthouseを再実行したところ、Windows + Playwright Chromiumの組み合わせでprofile teardown `EPERM` が再現した。

同じ再実行ではLighthouse scoreが `0 / 0 / 0 / 0` になったため、正式なスコア証跡としては採用しない。生成された `lighthouse-2026-04-29.md` と `lighthouse-2026-04-29.json` は正式証跡に含めない。

採用中の正式スコアは、2026-04-28 のMicrosoft Edge headless (`CHROME_PATH`) で取得した以下のsnapshot:

| 計測条件 | Performance | Accessibility | Best Practices | SEO |
|---|---:|---:|---:|---:|
| desktop | 100 | 95 | 100 | 100 |
| mobile | 89 | 95 | 100 | 100 |

## scriptの防止策

`scripts/run-lighthouse.mjs` を更新し、以下を追加した:

- `CHROME_PATH` がある場合はMicrosoft Edge / Chrome stableを優先する
- `runtimeError` または全カテゴリ `0` の結果はevidenceとして書き出さない
- 有効なevidence書き出し後のChrome profile teardown failureは、score failureではなく環境依存の警告として扱う

## 安定した計測手順

Windowsで正式スコアを再取得する場合は、Edge / Chrome stableを `CHROME_PATH` で指定する。

```powershell
$env:CHROME_PATH = "<Edge or Chrome executable path>"
$env:LIGHTHOUSE_URL = "https://medical-extractor.atlas-lab.workers.dev/"
npm run lighthouse
```

Linux runnerを使える場合は、Linux上のChrome/Chromiumで同じURLを計測する。

## 実施していないこと

- 実際のAnthropic API呼び出し。
- rate-limit連打試験。
- 認証情報の推測。
- 実患者データやPHIの入力。
