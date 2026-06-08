# 検証記録の対応表

## 対象

- Project: `medical-extractor`
- 公開URL: https://medical-extractor.atlas-lab.workers.dev
- Source: https://github.com/proto-atlas/medical-extractor
- 検証記録は特定時点の記録であり、最新HEADの状態を常に示すものではありません。
- 確認時は対象commitとCI runを指定してください。

## 対応表

| 確認内容 | 検証記録 | commit | 結果 |
|---|---|---:|---|
| TypeScript、lint、unit test、coverage、build、E2E、publish scan、検証記録の存在確認をrelease確認の対象にする | [release-baseline-2026-04-29.md](./release-baseline-2026-04-29.md) | ファイル参照 | 成功記録 |
| SOAP抽出は架空fixtureで評価できる | [soap-eval-2026-04-28.md](./soap-eval-2026-04-28.md) | ファイル参照 | 架空fixture 1件で20/20項目を確認 |
| Cloudflare Workersの手動deployを記録した | [deployment-2026-04-29.md](./deployment-2026-04-29.md) | ファイル参照 | 成功記録 |
| productionの静的routeと保護APIの疎通を確認した | [production-check-2026-04-29.md](./production-check-2026-04-29.md) / [production-check-2026-04-29.json](./production-check-2026-04-29.json) | ファイル参照 | 成功記録 |
| Firefox / WebKit / Mobile Chrome / Mobile SafariのE2Eを追加した | [cross-browser-check-2026-04-29.md](./cross-browser-check-2026-04-29.md) | `85952483c9ddf0a4322684fc22f6faa958e0cf0f` | GitHub Actions run `25102429281` 通過 |
| `source_text` validationは不一致の本文をrejectし、raw mismatch textを出さない | [source-text-validation-2026-04-29.md](./source-text-validation-2026-04-29.md) | `4e6b63903683a0eff895090cb75f85ff3d55f89d` | unit / route tests通過 |
| Lighthouseのデスクトップ/モバイルのスコアとWindows profile teardownの警告を記録した | [lighthouse-2026-04-28.md](./lighthouse-2026-04-28.md) / [lighthouse-measurement-note-2026-04-29.md](./lighthouse-measurement-note-2026-04-29.md) | ファイル参照 | desktop 100/95/100/100, mobile 89/95/100/100。0点の再計測は不採用 |
| axe-coreとtarget-sizeの確認結果を記録した | [a11y-2026-04-27.md](./a11y-2026-04-27.md) | ファイル参照 | critical / serious 0 |
| 依存脆弱性が残っていないことを確認した | [dependency-audit-2026-06-04.md](./dependency-audit-2026-06-04.md) / [npm-audit-2026-06-04.json](./npm-audit-2026-06-04.json) | ファイル参照 | 0 vulnerabilities |
| 医療領域として扱わない範囲を記録した | [../medical-domain-evidence.md](../medical-domain-evidence.md) | ファイル参照 | 対象外範囲を記録 |

## 公開範囲とアクセスキー範囲

| 範囲 | キー必須 | 補足 |
|---|---:|---|
| スクリーンショット | 不要 | Playwrightで応答を置き換えて生成。 |
| README / evidence | 不要 | 公開文書と特定時点の検証記録。 |
| `/api/auth` | 不要 | 実抽出の前に必要。誤ったキーはrate limit対象。 |
| `/api/extract` 実抽出 | 必要 | アクセスキーとrate limitで保護。 |
| `eval:soap` 実行モード | 手動確認 | 架空fixtureのみ。通常CIには含めない。 |

## 壊れやすいケースと扱い

| ケース | 実装上の扱い | 見える結果 |
|---|---|---|
| 実患者情報が入力される | UIで架空データ前提を表示し、個人情報らしき入力に警告を出す | 利用者に入力中止を促す |
| AIがschema外の値を返す | Anthropic tool schemaとZodで二段階検証する | 502で再試行を促し、Zod詳細はUIへ出さない |
| `source_text` が原文と一致しない | 不一致を検出してrejectする | mismatch本文をUIへ出さず、検証記録で扱いを追える |
| アクセスキーなしで抽出APIを呼ぶ | `/api/auth` と `/api/extract` を分けて制限する | 実抽出へ進めない |
| Rate Limiting bindingが使えないlocal環境 | 同じ閾値をメモリ上で再現する | local/testでも境界の振る舞いを確認できる |

## 既知の制約

| 制約 | 重要度 | 現在の扱い | 運用時の追加案 |
|---|---|---|---|
| 臨床システムではない | High | UIとdocsで架空データのみ、実患者データなし、診断・治療目的なしと明示する。個人情報らしき入力への警告はunit testとE2Eで確認する。 | 製品化する場合は法務、PHI、監査、同意、臨床レビューの体制が必要。 |
| Web Speech APIは音声をブラウザベンダー側に送る可能性がある | Medium | privacy dialogとdocsでvendor cloud riskを明示する。 | 音声入力を無効化するか、同意と契約を含む管理された音声処理基盤に切り替える。 |
| Rate Limiting bindingは濫用対策であり、厳密な全体利用量の会計ではない | Medium | アクセスキー、scoped rate limits、cache-assisted limiter、Anthropic spend limitを組み合わせる。 | より厳密にする場合はDurable Objectsなどの集中管理を追加する。 |
| 過去のmoderate advisory記録が残る | Low | 2026-04-27 から 2026-04-29 の記録は履歴として残す。2026-06-04 時点のauditは 0 vulnerabilities。 | 依存更新後は新しいaudit記録を追加する。 |

## 実施していないこと

- 認証情報の推測。
- 負荷試験。
- 制御なしの実API呼び出し。
- 実患者データやPHIの入力。
- 安全な低い閾値を設定しない状態でのproduction rate-limit連打試験。
