# Cross-Browser Smoke Evidence

Evidence generated from commit: `85952483c9ddf0a4322684fc22f6faa958e0cf0f`

Generated at: `2026-04-29T19:01:10+09:00`

Public URL: https://medical-extractor.atlas-lab.workers.dev

Check type: GitHub Actions cross-browser smoke / local E2E confirmation

Result: pass snapshot

## Scope

This evidence is a point-in-time log. It does not claim to match the latest repository HEAD.

The goal is to cover the reviewer finding that the project previously had Chromium-focused E2E only.

## What Changed

- Added `e2e/cross-browser-smoke.spec.ts`.
- Added GitHub Actions job `e2e-smoke-matrix`.
- Matrix projects:
  - `firefox`
  - `webkit`
  - `mobile-chrome`
  - `mobile-safari`
- Existing Chromium E2E remains in the `e2e` job.
- `deploy` now depends on `quality-gate`, `e2e`, and `e2e-smoke-matrix`.

## Smoke Scenario

The matrix smoke checks that, after mocked auth and privacy acknowledgement:

- the app heading is visible,
- the fictional-only / no real patient data / no diagnosis boundary text is visible,
- the medical text input is visible,
- the extraction submit button is enabled after entering fictional text.

This smoke intentionally avoids live Anthropic API calls.

## GitHub Actions Result

Run: `25102429281`

Trigger: push to `main`

Commit: `85952483c9ddf0a4322684fc22f6faa958e0cf0f`

Overall status: success

| Job | Result |
|---|---|
| `quality-gate` | pass |
| `e2e` | pass |
| `e2e-smoke-matrix (firefox)` | pass |
| `e2e-smoke-matrix (webkit)` | pass |
| `e2e-smoke-matrix (mobile-chrome)` | pass |
| `e2e-smoke-matrix (mobile-safari)` | pass |
| `deploy` | pass, deploy steps skipped because Cloudflare secrets were absent |

Artifacts:

- Chromium Playwright report
- Firefox Playwright report
- WebKit Playwright report
- Mobile Chrome Playwright report
- Mobile Safari Playwright report

## Local Confirmation

Local checks on Windows:

| Command | Result | Notes |
|---|---|---|
| `node node_modules\typescript\bin\tsc --noEmit` | pass | typecheck |
| `node node_modules\eslint\bin\eslint.js .` | pass | lint |
| `node node_modules\prettier\bin\prettier.cjs --check .` | pass | formatting |
| `node node_modules\vitest\vitest.mjs run --coverage` | pass | 15 files / 136 tests |
| `node node_modules\next\dist\bin\next build --webpack` | pass | production build |
| `node node_modules\@playwright\test\cli.js test --project=chromium --workers=1` | pass | 19 tests |
| `node node_modules\@playwright\test\cli.js test e2e/cross-browser-smoke.spec.ts --project=mobile-chrome --workers=1` | pass | local mobile Chrome smoke |

Local Firefox / WebKit / Mobile Safari were not executed locally because their browser binaries were not installed in the Windows Playwright cache. The GitHub Actions matrix installed `chromium firefox webkit` and passed those projects on Ubuntu.

## Not Performed

- No live Anthropic API call.
- No credential guessing.
- No rate-limit burst test.
- No real patient data or PHI input.
