# Dependency Audit (2026-04-29)

実施日: 2026-04-29
対象: `medical-extractor`
コマンド: `npm audit --audit-level=high --json`
判定: **Pass (0 high / 0 critical)**
package-lock.json SHA-256: 61a825063a173234a5be1375d5dcc14ef828fd9f88f70531e1acbd21827afae2

## 集計

| Severity | Count |
|---|---:|
| critical | 0 |
| high | 0 |
| moderate | 6 |
| low | 0 |
| info | 0 |
| **total** | **6** |

`--audit-level=high` は exit 0。moderate が残る場合も high / critical ではないため release gate はブロックしない。

## 参考: 全依存数

- prod: 365
- dev: 396
- optional: 169
- total: 859

## raw JSON

- [`npm-audit-2026-04-29.json`](./npm-audit-2026-04-29.json)
