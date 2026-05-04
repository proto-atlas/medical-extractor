# Reviewer Guide

## 30 seconds

- Public demo: https://medical-extractor.atlas-lab.workers.dev
- Public materials: screenshots and evidence show the SOAP result UI without calling external AI APIs.
- Source: https://github.com/proto-atlas/medical-extractor

## 5 minutes

- Read the README feature list and privacy section.
- Check the evidence map: [docs/evidence/REVIEWER-INDEX.md](./evidence/REVIEWER-INDEX.md)
- Review the API boundary: `src/app/api/extract/route.ts`
- Review the SOAP schema: `src/lib/soap-schema.ts`
- Review design tradeoffs: [DESIGN-DECISIONS.md](./DESIGN-DECISIONS.md)

## Public and Key-Gated Scope

| Area | Access key | Notes |
|---|---:|---|
| Screenshots | No | Generated with Playwright route mocks, so no external AI API cost is incurred. |
| README / evidence | No | Public documentation and point-in-time verification logs. |
| Live SOAP extraction | Yes | Access-key gated to reduce abuse and unexpected API cost. |
| Live SOAP eval | Manual | Uses fictional fixtures only and is not part of normal CI. |

## Safety Boundary

This is a fictional-data demo. Do not enter real patient data. It is not for diagnosis, treatment, clinical decision-making, or PHI processing.

The app uses Web Speech API for optional voice input. Browser implementations may send audio to Apple, Google, or another browser vendor service. The UI and docs disclose this limitation.

## Evidence Policy

Evidence files are point-in-time logs, not a claim of latest HEAD. For third-party review, the reviewed commit and CI run should be specified externally.

Evidence should not include secrets, access keys, cookies, API keys, local filesystem paths, self-scoring context, or internal implementation-plan notes.

## Not Performed by Default

- No credential guessing.
- No load test.
- No uncontrolled live AI calls.
- No real patient data or PHI input.
- No production 429 burst test unless the threshold can be reached safely with a small number of requests.
