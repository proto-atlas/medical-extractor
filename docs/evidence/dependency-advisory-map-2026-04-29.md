# dependency advisory整理表 (2026-04-29)

このファイルは、`npm audit --audit-level=high --json` 後に残る `moderate` advisoryを整理した特定時点の記録です。

## 対象

- Project: `medical-extractor`
- 生成日: `2026-04-29`
- コマンド: `npm audit --audit-level=high --json`
- 結果: high/critical gateはpass
- high: 0
- critical: 0
- moderate: 6
- total vulnerabilities: 6
- 確認日: `2026-04-29`
- 次回確認条件: Next / OpenNext / AWS SDKの依存更新後、または次の公開review snapshot前

## advisory整理表

| Package | 直接依存 | 重要度 | Advisory / Source | Path | npmの提示修正 | アプリ側の露出 | 判断 |
|---|---:|---|---|---|---|---|---|
| `postcss` | なし | moderate | GHSA-qx2v-qp2m-jg93 / PostCSS stringifier XSS via unescaped `</style>` | `next` -> bundled `postcss` | `next@9.3.3`（semver-major downgrade） | 公開routeはCSSを受け取らず、ユーザー入力をPostCSSでstringifyしない。ユーザー入力はアクセスキーと架空の医療テキスト。 | Next 16からNext 9へ下げない。high/critical gateを維持し、Next/PostCSSの依存更新を追跡する。 |
| `next` | あり | moderate | via `postcss` | direct dependency | `next@9.3.3`（semver-major downgrade） | 上と同じ。Next内部のPostCSS依存から継承された検出。 | 現在のNext 16構成を維持する。強制downgradeはApp RouterとCloudflare targetを外すため、安全な修正として採用しない。 |
| `fast-xml-parser` | なし | moderate | GHSA-gh4j-gqv2-49f6 / XMLBuilder comment and CDATA delimiter injection | `@aws-sdk/xml-builder` -> `fast-xml-parser` | transitive fixあり。ただしtop-levelの安全な直接更新ではない。 | 確認したapp sourceには、ユーザー入力をXML parse/buildへ渡す経路はない。OpenNext/AWS SDK内部経由のruntime到達性を完全に証明したものではない。 | upstream依存更新を追跡する。到達可能なexploit pathが見つかるまではlocal overrideは入れない。 |
| `@aws-sdk/xml-builder` | なし | moderate | via `fast-xml-parser` | OpenNext / AWS SDK dependency tree | transitive fixあり | `fast-xml-parser` と同じ。app sourceには、ユーザー入力を意図的にXMLへ渡す経路はない。 | AWS SDK / OpenNextの依存更新を追跡する。 |
| `@opennextjs/aws` | なし | moderate | via `next` | `@opennextjs/cloudflare` -> `@opennextjs/aws` | `@opennextjs/cloudflare@1.14.1`（npm上はsemver-major扱い） | `next` / `postcss` から継承された検出。アプリlevelのrouteがこのpackageを直接露出する経路はない。 | moderateのtransitive検出を消す目的だけで、現在のデプロイ構成からOpenNextをdowngradeしない。 |
| `@opennextjs/cloudflare` | あり | moderate | via `@opennextjs/aws` and `next` | direct dependency | `@opennextjs/cloudflare@1.14.1`（npm上はsemver-major扱い） | deployment/runtime adapterとして使っている。検出されたmoderate chainは上記のtransitive依存から継承されたもの。 | 現在のOpenNext versionを維持する。upstream releaseでdowngradeなしに解消できる時点で再評価する。 |

## `npm audit fix --force` を使わない理由

`npm audit` は一部の依存関係について `next` を `9.3.3`、`@opennextjs/cloudflare` を `1.14.1` へ下げる経路を提示する。ただし、このアプリは現在のNext App Router / OpenNext Cloudflare構成を前提にしているため、patch-levelの安全な修正としては採用しない。

## 現在の方針

- CIは `high` と `critical` のadvisoryをブロックする。
- `moderate` advisoryは依存経路、露出範囲、対応判断を記録する。
- この記録にはsecret、アクセスキー、cookie、API key、実患者データを含めない。
- 次の対応は、upstreamのNext / OpenNext / AWS SDK依存更新後の再確認。
- 提案される修正経路が現在のNext / OpenNextデプロイ構成を置き換えるsemver-major downgradeを含むため、`npm audit fix --force` は使わない。

## 解消条件

| Advisory group | 解消条件 |
|---|---|
| `postcss` / `next` | Next 16互換の依存更新で、application frameworkをdowngradeせずに継承元のPostCSS advisoryが消えること。 |
| `fast-xml-parser` / `@aws-sdk/xml-builder` | AWS SDK / OpenNextの依存更新でadvisoryが消えること。または、到達可能なapp-level XML builder経路を確認し、直接修正すること。 |
| `@opennextjs/aws` / `@opennextjs/cloudflare` | 現行のOpenNext Cloudflare releaseで、Cloudflare deployment targetを変えずに継承されたmoderate chainが消えること。 |

## 再確認コマンド

```text
npm audit --audit-level=high --json
npm run lint
```
