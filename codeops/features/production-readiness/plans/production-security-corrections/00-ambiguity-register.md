# Ambiguity Register: Production Security Corrections Plan

> **Status**: ✅ GATE PASSED — all 9 items resolved
> **Last Updated**: 2026-09-13 00:00
> **Planning Target**: `production-readiness/RD-01`
> **Context Artifacts**: RD-01, its passing preflight report, project guidance, and directly affected code/tests
> **Modification Set**: this plan register only until the gate passes
> **Scope Mode**: strict
> **CodeOps Artifact Schema**: 1

| # | Category | Ambiguity / Gap | Options Presented | User Decision | Status |
|---|---|---|---|---|---|
| AR-1 | UX & security | What exact public result represents unsupported stored TOTP parameters? | A: render the current enrollment/verification page with HTTP 503 and a new generic “verification unavailable; contact your administrator” message / B: return a plain generic HTTP 503 response | User accepted A: render the existing page with HTTP 503 and a generic contact-admin message. | ✅ Resolved |
| AR-2 | UX & security | How should enrollment display an exhausted TOTP attempt budget? | A: re-render the enrollment page with HTTP 429, `Retry-After`, the existing rate-limit message, and the existing enrollment data / B: redirect to the enrollment page with a rate-limit flag and lose the HTTP 429 response | User accepted A: return HTTP 429 with `Retry-After`, reuse the pending secret/QR, and do not regenerate enrollment or recovery data. | ✅ Resolved |
| AR-3 | Naming & terminology | Which stable internal diagnostics define invalid signing rows and unsupported TOTP configuration? | A: `SigningKeyCryptoError('Signing key record is invalid')` with event `signing-key-record-invalid`, and event `totp-configuration-unsupported`; never serialize the underlying error / B: other explicitly named fixed identifiers | User accepted A: use the fixed error and event identifiers and never serialize underlying errors or cryptographic/configuration values. | ✅ Resolved |
| AR-4 | Non-functional | Which exact verification set governs this security and CLI change? | A: focused red/green selectors during tasks, then `yarn verify`, `yarn test:ui`, `yarn harness:test`, `yarn assurance:harness --project security --profile production-security`, `yarn assurance:compat --select p1-admin` from a clean checkpoint, and `yarn docs:build` / B: a user-specified smaller set that still satisfies project security policy | User accepted A: use the complete listed matrix and no specialized aggregate, mutation, coverage, fault, or stability run. | ✅ Resolved |
| AR-5 | Imported signing-key design | Which accepted RD/preflight design governs key mutation, cache, and bootstrap? | Reuse the Admin transaction/post-commit hook; use a local cache generation; use a short PostgreSQL bootstrap lock | Imported user-approved PF-001, PF-005, and RD-01 AC-01–AC-05 decisions. | ✅ Resolved |
| AR-6 | Imported TOTP design | Which accepted RD/preflight design governs replay and fixed parameters? | One nullable PostgreSQL step; exact-row conditional update; transactional enrollment; fixed SHA1/6/30 contract | Imported user-approved PF-002–PF-004 and RD-01 AC-06–AC-11 decisions. | ✅ Resolved |
| AR-7 | Imported complexity boundary | Which supporting machinery may the plan add? | No service, worker, queue, Redis replay state, distributed coordination, provider hot reload, compatibility layer, dependency, or unrelated refactor | Imported user-approved RD-01 scope and preflight boundary. | ✅ Resolved |
| AR-8 | Imported operational boundary | What production configuration and provider-refresh contract applies? | Unequal external root keys; restart every Porta instance after key changes; verify committed state after restart | Imported user-approved PF-006–PF-010 and RD-01 AC-12/AC-14 decisions. | ✅ Resolved |
| AR-9 | Naming & terminology | Which internal error identifies unsupported persisted TOTP parameters? | `UnsupportedTotpConfigurationError('TOTP configuration is unsupported')` | User approved the exact class name and fixed message. | ✅ Resolved |

## Resolution Notes

**AR-1:** Option A preserves the user's form context, exposes no stored parameter, and tells the
user not to keep guessing. It adds one English locale key and reuses the existing rendering path.
Recommendation: A.

Independent security challenge: agreed. Detect unsupported parameters before OTP construction,
use a typed internal branch, preserve the current interaction, and disclose no stored values.

**AR-2:** Option A preserves the established 429 contract used by normal 2FA verification. A small
setup-rendering helper can reuse the existing view data without a new component or subsystem.
Recommendation: A.

Independent security challenge: agreed. Reuse the existing `2fa_verify` budget and stored pending
setup; do not regenerate the secret, QR source, or recovery codes.

**AR-3:** Option A makes the accepted preflight diagnostic requirements executable and testable.
The names follow existing lower-case structured event conventions. Recommendation: A.

Independent security challenge: agreed. The signing-key diagnostic may identify only `kid`;
neither diagnostic may include caught errors, secrets, codes, ciphertext, IVs, tags, or stored
configuration values.

**AR-4:** Option A is the smallest set that satisfies the repository's explicit server,
browser-facing, retained OIDC, production-security, CLI compatibility, and documentation gates.
No coverage, mutation, fault, stability, or aggregate assurance command is included.
Recommendation: A.

Independent security challenge: agreed. These gates cover distinct server, browser, OIDC,
production-security, CLI compatibility, and documentation boundaries. Run compatibility from a
clean checkpoint.

**AR-9:** The approved typed error follows the existing two-factor error hierarchy and lets the
routes distinguish invalid server state from an incorrect user code without a new support layer.

## Imported Confirmed Boundaries

- RD-01 and PF-001–PF-010 are approved and passed preflight.
- Key routes reuse the existing Admin transaction and post-commit hook.
- Replay consumption binds to the exact loaded TOTP row and verification state.
- No new service, worker, queue, distributed coordination, provider hot reload, or compatibility
  layer is permitted.
- The plan uses existing PostgreSQL, Redis rate limiting, encryption, cache, audit, CLI, and test
  infrastructure only.
