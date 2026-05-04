# Dependency Audit (2026-04-28)

実施日: 2026-04-28
対象: `medical-extractor`
コマンド: `npm audit --audit-level=high --json`
判定: **Pass (0 high / 0 critical)**

## 集計

| Severity | Count |
|---|---:|
| critical | 0 |
| high | 0 |
| moderate | 6 |
| low | 0 |
| info | 0 |
| **total** | **6** |

`--audit-level=high` は exit 0。moderate 6 件は残存している。

## 参考: 全依存数

- prod: 365
- dev: 396
- optional: 169
- total: 859

## moderate 残の扱い

moderate 6 件の出自と評価は [`dependency-audit-2026-04-27.md`](./dependency-audit-2026-04-27.md) に記録済み。high / critical ではないため CI quality-gate はブロックしない。
