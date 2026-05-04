# Dependency Audit Report

実施日: 2026-04-27
対象: `medical-extractor` リポ
コマンド: `npm audit --audit-level=high` / `npm audit --json`
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

`--audit-level=high` を CI quality-gate (`.github/workflows/ci.yml` の `npm audit` step) はブロックしない判定。moderate 残は以下に評価を残す。

## moderate の内訳と評価

### 1. `postcss <8.5.10` — XSS via Unescaped `</style>` in CSS Stringify Output

- Advisory: https://github.com/advisories/GHSA-qx2v-qp2m-jg93
- CVSS: 6.1
- 経路: `next > postcss` (`node_modules/next/node_modules/postcss`)
- 本リポの直接 dependency の `postcss` は `^8.5.10` (修正版) で問題なし。Next 16 が内部 lock している `postcss` が 8.4.x のまま残存している
- **本リポでの実際のリスク**: 低。CSS Stringify は「ユーザー入力 → CSS 出力」の経路で発火するが、本リポは Tailwind CSS の build 時静的解析しかなく、ユーザー入力を CSS としてシリアライズするパスは存在しない
- **解消見込み**: 次回 Next リリースで内部 `postcss` が `8.5.10+` に上がる予定

### 2. `fast-xml-parser <5.7.0` — XML Comment / CDATA Injection via Unescaped Delimiters

- Advisory: https://github.com/advisories/GHSA-gh4j-gqv2-49f6
- CVSS: 6.1
- 経路: `@opennextjs/cloudflare > @opennextjs/aws > @aws-sdk/xml-builder > fast-xml-parser`
- **本リポでの実際のリスク**: 低。OpenNext は build 時に AWS SDK を Cloudflare Workers 互換へ shim するために `fast-xml-parser` を経由するが、ランタイムでユーザー入力を XML へシリアライズする経路は存在しない (`/api/extract` は JSON in/out のみ、AWS S3 等の連携なし)
- **解消見込み**: OpenNext 側の SDK 更新待ち

### 3. `next` / `@opennextjs/aws` / `@opennextjs/cloudflare` (transitive 伝搬)

上記 1 と 2 の `effects` として伝搬している項目。実体のリスクは postcss と fast-xml-parser に集約される。

## `npm audit fix --force` の評価

`npm audit fix --force` を実行すると `next` を `9.3.3` にダウングレード提案 (semver major、本プロジェクトの全機能と非互換)。**不採用**。

## 結論

| 観点 | 判定 |
|---|---|
| `--audit-level=high` ブロック | **Pass** |
| moderate 残のランタイムリスク | **低** (本リポの利用形態では発火経路なし) |
| アップストリーム更新待ち | postcss は次の Next リリース、fast-xml-parser は OpenNext 側 |
| 直近の追加対応 | なし。CI gate 通過のため moderate 許容を継続 |

## 参考: 全依存数

- prod: 364
- dev: 212
- optional: 168
- total: 674
