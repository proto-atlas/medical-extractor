# Reviewer Evidence Index

## Scope

- Project: `medical-extractor`
- Public URL: https://medical-extractor.atlas-lab.workers.dev
- Source: https://github.com/proto-atlas/medical-extractor
- Evidence files are point-in-time logs, not a claim of latest HEAD.
- For third-party review, the reviewed commit and CI run should be specified externally.

## Evidence Map

| Claim | Evidence | Generated commit | Result |
|---|---|---:|---|
| TypeScript, lint, unit tests, coverage, build, E2E, publish scan, and evidence guard are release-gated | [release-baseline-2026-04-29.md](./release-baseline-2026-04-29.md) | See file | pass snapshot |
| SOAP extraction can be evaluated with fictional fixtures | [soap-eval-2026-04-28.md](./soap-eval-2026-04-28.md) | See file | live fixture 20/20 checks pass |
| Cloudflare Workers manual deployment was recorded | [deployment-2026-04-29.md](./deployment-2026-04-29.md) | See file | pass snapshot |
| Production static routes and protected API smoke were checked | [production-smoke-2026-04-29.md](./production-smoke-2026-04-29.md) / [production-smoke-2026-04-29.json](./production-smoke-2026-04-29.json) | See file | pass snapshot |
| Firefox / WebKit / Mobile Chrome / Mobile Safari smoke E2E was added | [cross-browser-smoke-2026-04-29.md](./cross-browser-smoke-2026-04-29.md) | `85952483c9ddf0a4322684fc22f6faa958e0cf0f` | GitHub Actions run `25102429281` pass |
| `source_text` validation rejects mismatched evidence text without exposing raw mismatch text | [source-text-validation-2026-04-29.md](./source-text-validation-2026-04-29.md) | `4e6b63903683a0eff895090cb75f85ff3d55f89d` | unit / route tests pass |
| Lighthouse desktop and mobile scores were recorded, and Windows cleanup noise was documented | [lighthouse-2026-04-28.md](./lighthouse-2026-04-28.md) / [lighthouse-cleanup-note-2026-04-29.md](./lighthouse-cleanup-note-2026-04-29.md) | See files | desktop 100/95/100/100, mobile 89/95/100/100; invalid 0-score rerun not accepted |
| axe-core and target-size checks were recorded | [a11y-2026-04-27.md](./a11y-2026-04-27.md) | See file | critical/serious 0 |
| High and critical dependency advisories are blocked, and moderate advisories are mapped | [dependency-audit-2026-04-29.md](./dependency-audit-2026-04-29.md) / [dependency-advisory-map-2026-04-29.md](./dependency-advisory-map-2026-04-29.md) / [npm-audit-2026-04-29.json](./npm-audit-2026-04-29.json) | See files | 0 high / 0 critical, 6 moderate documented |
| Medical-domain boundaries are documented | [../medical-domain-evidence.md](../medical-domain-evidence.md) | See file | documented scope boundaries |

## Public / Key-Gated

| Area | Key required | Notes |
|---|---:|---|
| Screenshots | No | Generated through Playwright mocks. |
| README / evidence | No | Public documentation and point-in-time verification logs. |
| `/api/auth` | No | Required before live extraction. Wrong keys are rate-limited. |
| `/api/extract` live extraction | Yes | Access-key gated and rate-limited. |
| `eval:soap` live mode | Manual | Fictional fixtures only; not normal CI. |

## Known Constraints

| Constraint | Severity | Current handling | Next production-grade option |
|---|---|---|---|
| This is not a clinical system | High | UI and docs say fictional data only, no real patient data, and no diagnosis/treatment use. Best-effort personal-info warning is unit-tested and E2E-tested. | Formal product, legal, PHI, audit, consent, and clinical review process would be required. |
| Web Speech API may send audio to browser vendor services | Medium | Privacy dialog and docs disclose the vendor-cloud risk. | Disable voice input or use a controlled speech pipeline with explicit consent and contracts. |
| Rate Limiting binding is abuse protection, not exact global accounting | Medium | Access key, scoped rate limits, cache-assisted limiter, and Anthropic spend limit are layered. | Durable Objects or another centralized quota system for stricter global accounting. |
| Moderate npm advisories remain | Medium | CI blocks high/critical; moderate items are mapped with current exposure and remediation decision. | Track upstream updates and remove advisories when framework dependencies allow. |

## Not Performed

- No credential guessing.
- No load test.
- No uncontrolled live AI calls.
- No real patient data or PHI input.
- No production rate-limit burst test unless a safe low threshold is configured.
