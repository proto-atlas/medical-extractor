# Source Text Validation Evidence

Evidence generated from commit: `4e6b63903683a0eff895090cb75f85ff3d55f89d`

Generated at: `2026-04-29`

Check type: unit tests / route tests / live SOAP eval review

Result: pass snapshot

## Scope

This evidence is a point-in-time log. It does not claim to prove clinical correctness.

`source_text` validation only checks that the returned evidence text appears in the fictional input document after whitespace normalization. It does not verify medical diagnosis, coding, treatment correctness, semantic equivalence, or real-world clinical safety.

## Runtime Behavior

`/api/extract` validates the LLM tool output in this order:

1. Anthropic `tool_use` is required.
2. Zod validates the SOAP structure.
3. `validateSOAPSourceTexts(documentText, parsed.data)` checks `source_text`.
4. If a mismatch is found, the API returns `502` with `source_text_mismatch`.
5. Raw mismatched `source_text` is not returned to the user.

## Field-Level Evidence

| Case | Field | Evidence source | Expected result | Confirmed by |
|---|---|---|---|---|
| exact / all fields | subjective | `右下奥歯の冷温水痛で来院` appears in fictional document text | pass | `src/lib/soap-schema.test.ts` |
| exact / all fields | objective | `上顎 7 番に軽度の動揺` appears in fictional document text | pass | `src/lib/soap-schema.test.ts` |
| exact / all fields | assessment | `う蝕 C3 相当` appears in fictional document text | pass | `src/lib/soap-schema.test.ts` |
| exact / all fields | plan | `次回根管治療予約` appears in fictional document text | pass | `src/lib/soap-schema.test.ts` |
| normalized whitespace | objective | `上顎\n7 番に軽度の動揺` is matched after whitespace normalization | pass | `src/lib/soap-schema.test.ts` |
| missing source text | plan | `原文に存在しない計画` is not in the fictional document text | rejected with `{ field: "plan" }` | `src/lib/soap-schema.test.ts` |
| route mismatch handling | plan | mocked Anthropic tool output returns missing `source_text` | API returns `502 source_text_mismatch` | `src/app/api/extract/route.test.ts` |
| route data minimization | plan | mocked missing `source_text` contains raw text | API response does not contain raw mismatched text | `src/app/api/extract/route.test.ts` |
| live fixture | subjective | dental fictional fixture | 20/20 live SOAP checks pass | `docs/evidence/soap-eval-2026-04-28.md` |
| live fixture | objective | dental fictional fixture | 20/20 live SOAP checks pass | `docs/evidence/soap-eval-2026-04-28.md` |
| live fixture | assessment | dental fictional fixture | 20/20 live SOAP checks pass | `docs/evidence/soap-eval-2026-04-28.md` |
| live fixture | plan | dental fictional fixture | 20/20 live SOAP checks pass | `docs/evidence/soap-eval-2026-04-28.md` |

## Verified Commands

```text
node node_modules\vitest\vitest.mjs run --coverage
```

Result:

- 15 files passed
- 136 tests passed
- Statements: 94.11%
- Branches: 87.95%
- Functions: 100%
- Lines: 96.75%

## Not Performed

- No real patient data input.
- No clinical diagnosis validation.
- No FHIR / ICD-10 / SNOMED CT coding.
- No live Anthropic re-run for this evidence file; live result is referenced from the existing fictional fixture eval.
