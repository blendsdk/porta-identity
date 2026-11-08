# Roadmap: Admin Service Accounts

> **Feature-Set**: Admin Service Accounts
> **Status**: Complete
> **Created**: 2026-11-04
> **Last Updated**: 2026-11-06
> **Progress**: n/a (standalone plan; execution checklist owns task progress)
> **CodeOps Artifact Schema**: 1

## Tracker

| ID   | Title                                      | RD  | Plan                                                                   | Stage     | Status | Last Updated | Depends-on / Blocker                                                   |
| ---- | ------------------------------------------ | --- | ---------------------------------------------------------------------- | --------- | ------ | ------------ | ---------------------------------------------------------------------- |
| T-01 | Invitation-only Admin API service accounts | —   | [Standalone plan](plans/admin-service-account-invitations/00-index.md) | Done | ✅ | 2026-11-06 | 65/65; reviews, assurance, compatibility and CI green; owned runtime removed |
| ↳ RV-3-001 | Post-lock credential expiry | — | [Finding ledger](plans/admin-service-account-invitations/05-findings.md) | Done | ✅ | 2026-11-06 | Closed after correction and scoped re-review |
| ↳ SA-3-002 | Native token expiry at locked admission | — | [Finding ledger](plans/admin-service-account-invitations/05-findings.md) | Done | ✅ | 2026-11-06 | Closed on corrected bytes; AR-38 admission checks after post-wait authorization |

The user approved feature-roadmap creation in the concrete contract. The portfolio cascade is
deferred until integration into develop. Planning completion is not implementation completion.
