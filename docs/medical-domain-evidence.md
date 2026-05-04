# Medical Domain Evidence

実施日: 2026-04-27
対象: `medical-extractor`
基準: 公開デモの医療ドメイン境界

## 目的

本デモは「架空の医療文書から SOAP 形式 (Subjective / Objective / Assessment / Plan) を AI で構造化抽出する」ことに範囲を限定する。本ファイルは以下を明確化する:

1. 医療標準 (FHIR R5 / ICD-10 / SNOMED CT) の参照範囲と**実装範囲外の事項**
2. プライバシー法令 (HIPAA / 個人情報保護法 / 匿名加工情報) における本デモの位置付け
3. 臨床ガイドラインに対する本デモの**距離感**
4. SOAP eval ハーネスでの medical-domain mention の出力ルール

実装方針: **「標準を知っている / 境界を引ける」を示すことが優先**、過剰な医療機能 (自動診断 / 自動コード付与 / 治療推奨) は意図的に範囲外にする。

## 1. SOAP 4 項目と FHIR R5 Resource 候補の対応 (参照のみ、実装しない)

参照: HL7 FHIR R5 仕様 (https://www.hl7.org/fhir/r5/)

| SOAP section | 候補 FHIR Resource | 関連属性 | 本デモでの扱い |
|---|---|---|---|
| Subjective (主観的情報) | `Observation` (category=`social-history` または `survey`) または `Condition.note` | `Observation.value[x]` (text 主体)、`Observation.note` | text + source_text 抽出のみ。FHIR resource への変換は未実装 |
| Objective (客観的情報) | `Observation` (category=`vital-signs` / `laboratory` / `imaging`) | `Observation.code`, `Observation.value[x]`, `Observation.referenceRange` | 数値抽出はテキストとして扱い、Quantity / Code への構造化変換は未実装 |
| Assessment (評価・診断) | `Condition` (https://www.hl7.org/fhir/r5/condition.html) | `Condition.code` (CodeableConcept)、`Condition.clinicalStatus`、`Condition.verificationStatus` | 病名らしき語の抽出のみ。ICD-10 / SNOMED CT コード確定とは扱わない (理由: §2 参照) |
| Plan (計画・治療方針) | `CarePlan` または `ServiceRequest` | `CarePlan.activity`, `ServiceRequest.code` | 処方薬名 / 次回予約 / 指示の抽出のみ。MedicationRequest 等への変換は未実装 |

### 採用しない理由 (現バージョンで FHIR 変換を実装しない判断)

1. FHIR R5 の `Condition.code.coding` には system (ICD-10 / SNOMED CT 等) と code が必須で、AI に直接コードを生成させると **誤コード付与の医療リスク**が増える (§2 で詳述)
2. 本デモは「LLM の構造化抽出能力」を示すことが目的で、「医療情報システムへの統合」を目的としない
3. FHIR 変換を実装すると新機能の動作検証が必要になり、既存の安定性 (E2E 17 件 / coverage 94+) を維持する検証コストが増える
4. 本デモでは「標準を知った上で範囲を引く判断」を優先し、過剰実装を避ける

将来実装する場合の設計案: `src/lib/fhir-mapper.ts` を新設し、`SOAPData → Bundle` の変換関数 + Zod による FHIR R5 partial schema 検証。本ファイル §1 の対応表を参照しながら段階的に実装。ただし**自動コード付与は範囲外を維持**。

## 2. ICD-10 / SNOMED CT との関係

参照:
- CMS ICD-10 (https://www.cms.gov/Medicare/Coding/ICD10/index): HIPAA 対象者にも適用。2026 年ファイル更新あり
- SNOMED CT (NLM): https://www.nlm.nih.gov/research/umls/Snomed/snomed_main.html。包括的な臨床用語体系

### 実装範囲

- **しない**: 自動 ICD-10 コード付与、自動 SNOMED CT コード付与、コード推奨
- **する**: SOAP fixture に「診断名らしき語を抽出しても、ICD-10 / SNOMED コード確定とは扱わない」ルールを `domainNotes` で明示
- **する**: README に「診断支援ではなく文書構造化デモ」と明記

### 採用しない理由

1. LLM がコード推奨を行うと、誤コード付与による**医療事故 / 保険請求誤り**のリスクが発生する
2. ICD-10 / SNOMED CT は専門医療資格を持つ符号化担当者が判定する領域で、LLM 単体での代替は採用評価でも臨床現場でも望ましくない
3. 本デモは「文書構造化」が範囲。コード化は範囲外と境界を引く方が誠実

## 3. プライバシー法令上の位置付け

### 3.1 HIPAA (米国)

参照: HHS HIPAA de-identification (https://www.hhs.gov/hipaa/for-professionals/privacy/special-topics/de-identification/index.html)

- HIPAA de-identification には **Expert Determination** と **Safe Harbor** の 2 方式
- Safe Harbor: 18 種の識別子 (氏名 / 住所 / 日付 / 電話番号 / Email / SSN / 医療記録番号 / etc.) を全て除去
- 本デモの位置付け: **HIPAA 適用外** (実 PHI を扱わない、米国医療機関での利用を想定しない)
- ただし fixture の架空データは「Safe Harbor 18 識別子相当を含めない」前提で作成 (年代だけ記載、氏名 / 生年月日 / 連絡先なし)

### 3.2 個人情報保護法 / 匿名加工情報 (日本)

参照: 個人情報保護委員会 (https://www.ppc.go.jp/personalinfo/tokumeikakouInfo/)

- 匿名加工情報: 個人を識別できず、かつ復元できないよう加工した個人情報
- 本デモの位置付け: **匿名加工情報処理ではない** (実患者情報を加工せず、最初から架空データ)
- 「架空データ前提デモ」と「匿名加工情報処理」を**混同しない**ことが重要

### 3.3 PrivacyDialog の役割

`src/components/PrivacyDialog.tsx` および `src/app/page.tsx` の常時バナー (line 101-107) で、利用者に以下を明示:

- 教育・採用評価目的の架空データ前提
- 実患者の医療情報を入力しない
- 入力本文はサーバーログに記録されない
- 抽出結果は永続化されない (in-memory のみ)

これは法令対応というより**利用者への警告**。実 PHI を入力された場合の処理方針は「警告のみで block しない」(技術的に防げない、利用者責任)。

## 4. 臨床ガイドラインとの距離

参照: Minds ガイドラインライブラリ (https://minds.jcqhc.or.jp/)

### 実装しない

- 自動診断
- 治療推奨
- ガイドライン適合性判定
- 投薬提案

### 将来検討範囲

- 抽出結果に関連し得る診療ガイドラインを**人間が確認するためのリンク候補**を表示する機能 (UI 補助のみ、診断助言ではない)
- ただし現時点では未実装、`docs/medical-domain-evidence.md` の参照リンクとして留める

## 5. SOAP eval ハーネスでの接続

`scripts/run-soap-eval.mjs` の出力 / `eval/soap-fixtures/*.json` 構造に以下を反映する:

### fixture の `domainNotes` フィールド

各 fixture (`internal-001.json` / `dental-001.json` / `ophthalmology-001.json`) に新規追加:

```json
{
 "domainNotes": {
 "fhirCandidates": {
 "subjective": "Observation (category: social-history)",
 "objective": "Observation (category: vital-signs / laboratory)",
 "assessment": "Condition (clinicalStatus / verificationStatus 必要)",
 "plan": "CarePlan / ServiceRequest"
 },
 "icd10NotApplicable": true,
 "scope": "structural-extraction-only",
 "diagnosticAdvice": false
 }
}
```

### `run-soap-eval.mjs` の出力に mention を追加

dry-run / live mode 両方で、各 fixture 評価結果の末尾に以下を出力:

```
medical-domain notes:
 - FHIR Resource 候補 (参照のみ): subjective→Observation, objective→Observation, assessment→Condition, plan→CarePlan/ServiceRequest
 - ICD-10 / SNOMED CT コード確定: 範囲外
 - 診断支援: 範囲外
 - scope: structural-extraction-only
```

これにより、`npm run eval:soap` を実行した際に medical-domain の境界が**標準出力に現れる**。docs/medical-domain-evidence.md だけでなく eval script 出力にも mention があることで、設計判断と検証手順がつながる。

### evidence ファイル (`docs/evidence/soap-eval-*.md`) にも反映

`buildEvidenceMarkdown()` 関数で出力する md に「medical-domain scope」セクションを追加。

## 6. 設計上の効果

- 医療ドメイン固有の課題 (コード化 / 法令 / 診断支援との境界) を、実装前提ではなく範囲設定として明示できる。
- FHIR / ICD-10 / SNOMED CT / HIPAA / 個人情報保護法への距離を文書化し、過剰な医療機能を避ける理由を説明できる。
- README と evidence から本ファイルへ辿れるため、デモの制約と設計判断を追いやすい。

## 7. 範囲外として明示する事項

本デモは以下を**意図的に実装しない**:

- 自動 ICD-10 / SNOMED CT コード付与
- 自動診断
- 治療推奨
- 投薬提案
- ガイドライン適合性判定
- 実 PHI / 実患者データの処理
- HIPAA 適合性 (Safe Harbor / Expert Determination)
- 匿名加工情報処理

これらは医療情報システム / EHR / 診療支援システムの領域であり、本デモの「LLM 構造化抽出能力デモ」とは別の専門領域。
