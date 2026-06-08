# source_text検証記録

対象commit: `4e6b63903683a0eff895090cb75f85ff3d55f89d`

生成日: `2026-04-29`

確認種別: unit tests / route tests / SOAP実API評価review

結果: 通過時点の記録

## 対象

この検証記録は特定時点の記録です。臨床的な正しさを証明するものではありません。

`source_text` validationは、返された根拠文が空白正規化後の架空入力文書に含まれることだけを確認します。診断、コーディング、治療方針、意味の同等性、実臨床での安全性を検証するものではありません。

## runtime挙動

`/api/extract` はLLM tool outputを次の順で検証します。

1. Anthropic `tool_use` を必須にする。
2. ZodでSOAP structureを検証する。
3. `validateSOAPSourceTexts(documentText, parsed.data)` で `source_text` を確認する。
4. 不一致が見つかった場合、APIは `502` と `source_text_mismatch` を返す。
5. 不一致になった生の `source_text` は利用者に返さない。

## fieldごとの根拠

| ケース | field | 根拠source | 期待結果 | 確認方法 |
|---|---|---|---|---|
| exact / all fields | subjective | `右下奥歯の冷温水痛で来院` appears in fictional document text | 通過 | `src/lib/soap-schema.test.ts` |
| exact / all fields | objective | `上顎 7 番に軽度の動揺` appears in fictional document text | 通過 | `src/lib/soap-schema.test.ts` |
| exact / all fields | assessment | `う蝕C3 相当` appears in fictional document text | 通過 | `src/lib/soap-schema.test.ts` |
| exact / all fields | plan | `次回根管治療予約` appears in fictional document text | 通過 | `src/lib/soap-schema.test.ts` |
| normalized whitespace | objective | `上顎\n7 番に軽度の動揺` is matched after whitespace normalization | 通過 | `src/lib/soap-schema.test.ts` |
| missing source text | plan | `原文に存在しない計画` is not in the fictional document text | rejected with `{ field: "plan" }` | `src/lib/soap-schema.test.ts` |
| route mismatch handling | plan | mocked Anthropic tool output returns missing `source_text` | API returns `502 source_text_mismatch` | `src/app/api/extract/route.test.ts` |
| route data minimization | plan | mocked missing `source_text` contains raw text | API response does not contain raw mismatched text | `src/app/api/extract/route.test.ts` |
| 架空fixture | subjective | dental fictional fixture | SOAP実API評価で20/20項目を確認 | `docs/evidence/soap-eval-2026-04-28.md` |
| 架空fixture | objective | dental fictional fixture | SOAP実API評価で20/20項目を確認 | `docs/evidence/soap-eval-2026-04-28.md` |
| 架空fixture | assessment | dental fictional fixture | SOAP実API評価で20/20項目を確認 | `docs/evidence/soap-eval-2026-04-28.md` |
| 架空fixture | plan | dental fictional fixture | SOAP実API評価で20/20項目を確認 | `docs/evidence/soap-eval-2026-04-28.md` |

## 確認したコマンド

```text
node node_modules\vitest\vitest.mjs run --coverage
```

結果:

- 15 files passed
- 136 tests通過
- Statements: 94.11%
- Branches: 87.95%
- Functions: 100%
- Lines: 96.75%

## 実施していないこと

- 実患者データの入力。
- 臨床診断の妥当性検証。
- FHIR / ICD-10 / SNOMED CTコーディング。
- この検証記録のための実Anthropic再実行。実行結果は既存の架空fixture評価を参照する。
