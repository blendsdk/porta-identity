# Device Authorization — Requirements Validation

> **Status**: Complete
> **Validated**: 2026-11-24
> **CodeOps Artifact Schema**: 1

## Document Set

| Document | Status | Dependencies |
| --- | --- | --- |
| [Ambiguity Register](00-ambiguity-register.md) | ✅ 36 / 36 resolved | — |
| [README](README.md) | ✅ Complete | AR |
| [RD-01 Provider Capability](RD-01-provider-capability.md) | ✅ Approved | — |
| [RD-02 Tenant-Safe Verification](RD-02-tenant-safe-verification.md) | ✅ Approved | RD-01 |
| [RD-03 Client Contracts](RD-03-client-contracts.md) | ✅ Approved | RD-01 |
| [RD-04 CLI Device Login](RD-04-cli-device-login.md) | ✅ Approved | RD-01, RD-03 |
| [RD-05 Security Operations](RD-05-security-operations.md) | ✅ Approved | RD-01–RD-04 |

## Cross-Reference Validation

| Check | Result |
| --- | --- |
| Every RD has an explicit dependency statement | ✅ |
| Every scope decision cites an AR entry | ✅ |
| Every AR is referenced by at least one RD or the README | ✅ AR-7, AR-33 and AR-34 are owned by the README and feature structure |
| README index links resolve | ✅ |
| No orphaned feature | ✅ |
| No circular RD dependency | ✅ RD-01 → RD-02/RD-03/RD-05; RD-03 → RD-04 |
| No “Must Have” contradicts another RD’s “Won’t Have” | ✅ |
| No unresolved ambiguity remains | ✅ |

## Key Contradiction Review

| Potential Conflict | Resolution |
| --- | --- |
| AR-6 says user-code limits are per IP; AR-27 keys them by IP + session | RD-05 checks both the primary IP+session budget and the per-IP aggregate from AR-36 |
| AR-6 says device authorization is per IP + client; rotating client IDs could reset it | RD-05 adds the AR-36 per-IP aggregate |
| RD-01 promises `expired_token`; the adapter filters expired rows | RD-01 retains the row for 900 seconds after expiry and keeps the provider payload `exp` at 600 seconds |
| RD-01 uses a unique user code; the provider supplies a probabilistic code | RD-01 adds a partial unique index and fails closed on the rare collision |
| RD-02 rejects cross-tenant codes; the provider looks up codes globally | RD-02 adds an organization check before the provider callback and hardens the interaction organization |
| RD-03 allows zero redirect URIs; the existing schema requires one | RD-03 changes the Zod boundary and enforces the narrow device-only rule in the shared validator |
| RD-03 makes the device grant explicit opt-in; the CLI needs the admin client to have it | New `porta init` includes it; existing installations use the documented explicit update |
| RD-04 needs an ID token without a nonce; the existing verifier requires one | RD-04 adds a device-specific verifier and leaves the authorization-code verifier unchanged |
| RD-05 must not trip the generic token limiter while polling | RD-05 exempts the device grant from the generic limiter and applies the device-specific limits |

## “Did You Consider” Checklist

| # | Concern | Addressed? | Where |
| --- | --- | --- | --- |
| 1 | Audit logging / activity trail | Yes | RD-05 |
| 2 | Data export | N/A — device codes are not exported; the existing GDPR count covers approved rows | RD-05 |
| 3 | API versioning | Yes — lockstep release boundary, no new API version | RD-03, AR-32 |
| 4 | Rate limiting | Yes | RD-05 |
| 5 | Error messages and user-facing UX | Yes | RD-02, RD-04 |
| 6 | Empty states | Yes — code entry and generic invalid states | RD-02 |
| 7 | Loading states | Yes — CLI polling; browser pages are static | RD-04 |
| 8 | Accessibility | Yes — labels, focus, keyboard, page quality | RD-02 |
| 9 | Mobile responsiveness | Yes — existing page layout and branding | RD-02 |
| 10 | Backup and disaster recovery | N/A — existing PostgreSQL operations | — |
| 11 | Monitoring and alerting | Yes — structured logs and audit events; no new dashboard | RD-05 |
| 12 | Email notifications | N/A — existing magic-link and 2FA delivery only | — |
| 13 | Search | N/A — no new list view | — |
| 14 | Pagination | N/A — no new list view | — |
| 15 | File upload | N/A | — |
| 16 | Soft delete vs hard delete | Yes — DeviceCode rows are hard-deleted by expiry, deletion, logout or revocation | RD-01, RD-05 |
| 17 | Timezone handling | Yes — absolute TTLs and monotonic CLI deadline | RD-01, RD-04 |
| 18 | Localization | Yes — English and Dutch | RD-02 |
| 19 | Terms of service / privacy policy | N/A — no new user-facing terms or data collection | RD-05 |
| 20 | GDPR / retention / right to delete | Yes — no device PII; short retention; deletion paths | RD-05 |
| 21 | Session management / timeout | Yes — SSO reuse, session revocation and grant cleanup | RD-02, RD-05 |
| 22 | Graceful degradation / offline behavior | Yes — Redis failure policy and CLI no-retry/ambiguous-exchange behavior | RD-04, RD-05 |
| 23 | Admin / super-admin capabilities | Yes — existing client permissions and control-plane authority | RD-03 |
| 24 | User onboarding / first-time experience | Yes — CLI prints URL and code; browser instructions | RD-02, RD-04 |
| 25 | Configuration management | Yes — fixed constants; no new setting | RD-01, RD-05 |
| 26 | Input validation and sanitization | Yes — Zod, provider, URL/origin and bounded parsing | RD-01–RD-05 |
| 27 | Injection prevention | Yes — parameterized SQL, Handlebars escaping, no code reflection | RD-01, RD-02, RD-03 |
| 28 | Authentication and authorization model | Yes — client grant, tenant binding, login/2FA/consent, authority checks | RD-01, RD-02, RD-03 |
| 29 | Rate limiting | Yes — fixed primary and per-IP budgets | RD-05 |
| 30 | Secrets management | Yes — no hardcoded secrets; codes redacted and never logged | RD-01, RD-05 |
| 31 | Data encryption | Yes — TLS in transit, existing PostgreSQL storage and token signing | RD-05 |
| 32 | Infrastructure hardening | Yes — no new service, container, network path or dependency | RD-05 |
| 33 | Security testing | Yes — pentest matrix and assurance profiles | RD-05 |

## Validation Evidence

- `00-ambiguity-register.md` header: `✅ GATE PASSED — all 36 items resolved`.
- Every RD was reviewed and explicitly approved by the user in the requirements session.
- The feature roadmap is created at `../00-roadmap.md` and the portfolio row is synced in
  `codeops/00-roadmap.md`.
- Techdocs incremental update is complete: ADR-021 plus the API design, data model, security,
  system overview, configuration and integration sections.

## Conclusion

The five-RD set is internally consistent, traceable to the 36 resolved decisions, and ready to feed
the make-plan skill.
