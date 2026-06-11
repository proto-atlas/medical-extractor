# 確認ガイド

## 30秒で見る

- 公開URL: https://medical-extractor.atlas-lab.workers.dev
- キーなしで確認できる範囲: スクリーンショットと検証記録。SOAP表示例は外部AI APIを呼ばずに確認できる
- GitHub: https://github.com/proto-atlas/medical-extractor

## 5分で見る

- READMEの機能一覧とプライバシー項目を読む
- 検証記録の対応表を見る: [docs/evidence/INDEX.md](./evidence/INDEX.md)
- 抽出APIの境界を見る: `src/app/api/extract/route.ts`
- SOAP schemaを見る: `src/lib/soap-schema.ts`
- 設計判断を見る: [DESIGN-DECISIONS.md](./DESIGN-DECISIONS.md)

## 技術的な見どころ

- Anthropic `tool_use` を `tool_choice` で強制し、SOAP 4項目を自由文ではなく構造化JSONとして受け取る。
- Anthropic SDKの `input_schema` とサーバー側Zod `safeParse` で、AI出力を二重に検証してからUIへ渡す。
- 各SOAP項目に `text` と `source_text` を持たせ、抽出結果と原文根拠の対応を確認できる。
- 実患者情報を扱わない架空データ前提、本文非永続、ログに本文を出さない設計で境界を明示している。
- Web Speech APIは便利機能として提供しつつ、ブラウザベンダー側へ音声が送られる可能性をUIとdocsで明示している。

## 公開範囲とキー保護範囲

| 項目 | アクセスキー | 補足 |
|---|---:|---|
| スクリーンショット | 不要 | Playwrightのroute応答置き換えで生成。外部AI APIの課金は発生しない |
| READMEと検証記録 | 不要 | 公開文書と特定時点の検証記録 |
| 実APIのSOAP抽出 | 必要 | 課金と乱用を抑えるためアクセスキーで保護 |
| 実APIのSOAP評価 | 手動 | 架空fixtureのみ。通常CIには含めない |

## 安全境界

このアプリは架空データ用のデモです。実患者データは入力しないでください。診断、治療、臨床判断、PHI処理には使いません。

音声入力はブラウザ標準のWeb Speech APIを使います。実装によっては、音声がApple、Google、またはブラウザベンダーのサービスへ送られる場合があります。この制約はUIとdocsで明示しています。

## 検証記録の扱い

`docs/evidence/` のファイルは特定時点の記録です。最新HEADと一致することは主張しません。再確認するときは、対象commitとCI runを別途指定します。

検証記録には、secret、アクセスキー、cookie、APIキー、ローカルファイルパスなど公開しない情報を除外し、確認日時・確認対象・確認手順・結果を公開文書に記録しています。

## 通常は実施しないこと

- 認証情報の総当たり
- 負荷試験
- 明示判断なしの実API呼び出し
- 実患者データやPHIの入力
- 少ないリクエストで閾値に届かない本番429の連続確認
