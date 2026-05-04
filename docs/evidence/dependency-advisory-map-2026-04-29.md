# Dependency Advisory Map (2026-04-29)

This file is a point-in-time log for the `moderate` advisories that remain after `npm audit --audit-level=high --json`.

## Scope

- Project: `medical-extractor`
- Generated at: `2026-04-29`
- Command: `npm audit --audit-level=high --json`
- Result: pass for high/critical gate
- high: 0
- critical: 0
- moderate: 6
- total vulnerabilities: 6
- Tracking reviewed at: `2026-04-29`
- Next recheck condition: after Next / OpenNext / AWS SDK dependency updates, or before the next public review snapshot

## Advisory Map

| Package | Direct | Severity | Advisory / Source | Path | Fix suggested by npm | App exposure | Decision |
|---|---:|---|---|---|---|---|---|
| `postcss` | No | moderate | GHSA-qx2v-qp2m-jg93 / PostCSS stringifier XSS via unescaped `</style>` | `next` -> bundled `postcss` | `next@9.3.3` (semver-major downgrade) | Public routes do not accept CSS or ask PostCSS to stringify user-controlled CSS. User-controlled inputs are the access key and fictional medical text. | Do not downgrade Next 16 to Next 9. Keep the high/critical gate, monitor upstream Next/PostCSS dependency updates. |
| `next` | Yes | moderate | via `postcss` | direct dependency | `next@9.3.3` (semver-major downgrade) | Same as above. The finding is inherited from Next's internal PostCSS dependency. | Keep the current Next 16 stack. A forced downgrade would remove the current App Router / Cloudflare target and is not a safe remediation. |
| `fast-xml-parser` | No | moderate | GHSA-gh4j-gqv2-49f6 / XMLBuilder comment and CDATA delimiter injection | `@aws-sdk/xml-builder` -> `fast-xml-parser` | transitive fix available, but not as a safe direct top-level update | Reviewed app source does not expose XML parsing or XML building to user input. Full transitive runtime reachability through OpenNext/AWS SDK internals is not exhaustively proven. | Track upstream dependency updates. Do not add a local override unless a reachable exploit path is identified. |
| `@aws-sdk/xml-builder` | No | moderate | via `fast-xml-parser` | OpenNext / AWS SDK dependency tree | transitive fix available | Same as `fast-xml-parser`; no intentional user-controlled XML path exists in the app source. | Track upstream AWS SDK / OpenNext dependency updates. |
| `@opennextjs/aws` | No | moderate | via `next` | `@opennextjs/cloudflare` -> `@opennextjs/aws` | `@opennextjs/cloudflare@1.14.1` (reported as semver-major by npm) | The report is inherited from `next` / `postcss`. No app-level route exposes this package directly. | Do not downgrade OpenNext from the deployed stack only to satisfy a moderate transitive report. |
| `@opennextjs/cloudflare` | Yes | moderate | via `@opennextjs/aws` and `next` | direct dependency | `@opennextjs/cloudflare@1.14.1` (reported as semver-major by npm) | The package is part of the deployment/runtime adapter. The reported moderate chain is inherited from transitive dependencies above. | Keep the current OpenNext version. Re-evaluate when upstream releases remove the transitive findings without downgrading the stack. |

## Why Not `npm audit fix --force`

`npm audit` suggests downgrading `next` to `9.3.3` and `@opennextjs/cloudflare` to `1.14.1` for parts of the graph. This is not accepted because the application is built on the current Next App Router / OpenNext Cloudflare stack, and the suggested change is not a safe patch-level remediation.

## Current Policy

- CI blocks `high` and `critical` advisories.
- `moderate` advisories are documented with path, exposure, and decision.
- No secret, access key, cookie, API key, or real patient data is recorded in this evidence.
- The next remediation step is to retest after upstream Next / OpenNext / AWS SDK dependency updates.
- `npm audit fix --force` is not used because the suggested remediation path includes semver-major downgrades that would replace the current Next / OpenNext deployment stack.

## Resolution Conditions

| Advisory group | Resolution condition |
|---|---|
| `postcss` / `next` | A Next 16-compatible dependency update removes the inherited PostCSS advisory without downgrading the application framework. |
| `fast-xml-parser` / `@aws-sdk/xml-builder` | AWS SDK / OpenNext dependency updates remove the advisory, or a reachable app-level XML builder path is identified and patched directly. |
| `@opennextjs/aws` / `@opennextjs/cloudflare` | A current OpenNext Cloudflare release removes the inherited moderate chain without changing the Cloudflare deployment target. |

## Recheck Commands

```text
npm audit --audit-level=high --json
npm run lint
```
