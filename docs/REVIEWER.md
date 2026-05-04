# Reviewer Guide

## 30秒で見る

- Public demo: https://medical-extractor.atlas-lab.workers.dev
- Public materials: screenshots and evidence show the SOAP result UI without calling external AI APIs.
- Source: https://github.com/proto-atlas/medical-extractor

## 5分で見る

- Read the README feature list and privacy section.
- Check the evidence map: [docs/evidence/REVIEWER-INDEX.md](./evidence/REVIEWER-INDEX.md)
- Review the API boundary: `src/app/api/extract/route.ts`
- Review the SOAP schema: `src/lib/soap-schema.ts`
- Review design tradeoffs: [DESIGN-DECISIONS.md](./DESIGN-DECISIONS.md)

## 技術的な見どころ

- Anthropic `tool_use` を `tool_choice` で強制し、SOAP 4項目を自由文ではなく構造化JSONとして受け取る。
- Anthropic SDK の `input_schema` とサーバー側 Zod `safeParse` で、AI出力を二重に検証してからUIへ渡す。
- 各SOAP項目に `text` と `source_text` を持たせ、抽出結果と原文根拠の対応を確認できる。
- 実患者情報を扱わない架空データ前提、本文非永続、ログに本文を出さない設計で安全境界を明示している。
- Web Speech API は便利機能として提供しつつ、ブラウザベンダー側へ音声が送られる可能性をUIとdocsで明示している。

## 公開範囲とキー保護範囲

| Area | Access key | Notes |
|---|---:|---|
| Screenshots | No | Generated with Playwright route mocks, so no external AI API cost is incurred. |
| README / evidence | No | Public documentation and point-in-time verification logs. |
| Live SOAP extraction | Yes | Access-key gated to reduce abuse and unexpected API cost. |
| Live SOAP eval | Manual | Uses fictional fixtures only and is not part of normal CI. |

## 安全境界

This is a fictional-data demo. Do not enter real patient data. It is not for diagnosis, treatment, clinical decision-making, or PHI processing.

The app uses Web Speech API for optional voice input. Browser implementations may send audio to Apple, Google, or another browser vendor service. The UI and docs disclose this limitation.

## Evidence 方針

Evidence files are point-in-time logs, not a claim of latest HEAD. For third-party review, the reviewed commit and CI run should be specified externally.

Evidence should not include secrets, access keys, cookies, API keys, local filesystem paths, self-scoring context, or internal implementation-plan notes.

## デフォルトでは実施しないこと

- No credential guessing.
- No load test.
- No uncontrolled live AI calls.
- No real patient data or PHI input.
- No production 429 burst test unless the threshold can be reached safely with a small number of requests.
