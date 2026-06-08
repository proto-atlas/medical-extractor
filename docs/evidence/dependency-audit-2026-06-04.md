# 依存関係監査結果 (2026-06-04)

このファイルは、2026-06-04 時点の `npm audit --audit-level=high --json` 実行結果をまとめた特定時点の記録です。

## 実行内容

| 項目 | 内容 |
|---|---|
| command | `node --use-system-ca "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js" audit --audit-level=high --json` |
| result | exit 0 |
| info | 0 |
| low | 0 |
| moderate | 0 |
| high | 0 |
| critical | 0 |
| total | 0 |
| package-lock.json SHA-256 | `de1d8dd05551f3f642c0ff8ab50cb10fde1f4a93bae05f3fd08942eb09275fa5` |

package-lock.json SHA-256: de1d8dd05551f3f642c0ff8ab50cb10fde1f4a93bae05f3fd08942eb09275fa5

## 補足

2026-04-27 から 2026-04-29 の依存監査記録は、当時残っていた `moderate` advisoryの扱いを残す履歴です。現在のlockfileでは `npm audit fix` により解消済みで、`npm audit --audit-level=high --json` の `metadata.vulnerabilities.total` は 0 です。
