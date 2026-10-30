# Invitation Localization Implementation Plan

> **Feature**: Localize invitation delivery and acceptance; package formal Dutch authentication translations
> **Status**: Complete — 40/40 tasks; full feature-branch CI passed; AR #17 evidence limitation retained
> **Created**: 2026-10-27
> **Implements**: user-invitations/T-02
> **CodeOps Artifact Schema**: 1

## Overview

[Issue #179](https://github.com/blendsdk/porta-identity/issues/179) requests invitation language
selection that changes the actual email and acceptance experience, not merely a stored field.
The user approved a complete Dutch pack, formal `u/uw`, and the decisions in the
[passed ambiguity register](00-ambiguity-register.md).

This is a standalone capability plan in the existing invitation feature. Its owning requirements
are [01-requirements.md](01-requirements.md); the earlier deferred-invitation plan is historical
context, not a document to rewrite. `99-execution-plan.md` alone owns implementation progress.

## Minimum-Sufficient Baseline

**Original goal:** Meet #179 without changing invitation authority, lifetime or persistence.

**Smallest viable design:** Extend the existing locale resolver and tenant-override preparation;
build invitation-only translated context in the shared send/preview path; use the existing
Handlebars templates and page renderer; add the complete allowlisted Dutch bundle. Preserve
existing transactions, delivery outcomes and public API shapes. Decisions: AR #1–13.

**Excluded machinery:** A shared email translation-helper expansion was considered and not selected
(AR #6). No runtime locale-loader framework, new dependency, cache, service, generator, test
harness or deployment automation is needed (AR #4, #13).

**Approved complexity:** None; ordinary feature helpers and tests using existing infrastructure
do not trigger the complexity-escalation gate.

## Document Index

| Document                                             | Owns                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| [00-ambiguity-register.md](00-ambiguity-register.md) | User decisions, boundaries and exact specification supersession      |
| [01-requirements.md](01-requirements.md)             | Requirements and acceptance criteria                                 |
| [02-current-state.md](02-current-state.md)           | Observed code, dependencies and risks                                |
| [03-01-locales.md](03-01-locales.md)                 | Locale resolution, prepared translations and resources               |
| [03-02-email.md](03-02-email.md)                     | Invitation email context, templates and delivery compatibility       |
| [03-03-acceptance.md](03-03-acceptance.md)           | Acceptance rendering, validation and rejection controls              |
| [07-testing-strategy.md](07-testing-strategy.md)     | Concrete specification cases, test mapping and verification commands |
| [99-execution-plan.md](99-execution-plan.md)         | Ordered phases and the sole mutable task checklist                   |

Audit evidence: [00-preflight-report.md](00-preflight-report.md), passed on 2026-10-28 after
seven findings were corrected. The report records the exact reviewed content hash and delegated
technical resolutions; original user decisions remain in the ambiguity register.

## Quick Reference

Existing consumers continue to send `locale: 'nl'` or use `porta user invite --locale nl`; no new
SDK field or CLI flag is introduced. Custom template authors keep the legacy context and lookup
paths; their own hardcoded text is not automatically translated. See the component owners for
the prospective contract, and AR #6, #9, #11 for the user's choices.

## Domain Lenses and Review

| Lens                       | Why it applies                                                                   |
| -------------------------- | -------------------------------------------------------------------------------- |
| Web application            | Public token pages, HTML/text output, errors, accessibility and CSRF             |
| Data and migration         | Existing invitation rows, template compatibility, catalog evolution and rollback |
| Distributed and concurrent | Parallel render isolation, awaited override reads and rolling versions           |

The domain-lens selection was rerun before decomposition. Execution review add-ons are `security`,
`api-surface` and, where override/read ordering is affected, `concurrency`; security profiles are
`owasp-web`, `auth-protocol` and `tenant-isolation`. The repository's strict independent phase
reviews and stop-on-major policy remain active. These are review requirements, not new CI gates.

## Specialist Agents

**None** — a generic security reviewer and a bounded dynamic packet cover this feature. Evidence:
`packages/server/src/auth/i18n.ts:76`, `:289`, `packages/server/src/routes/invitation.ts:172`, and
the existing invitation enumeration specification provide the complete conventions and security
oracle. This is one bounded i18next/Handlebars extension, with no unique recurring capability a
standing specialist would add. One blind design challenger already reviewed the sensitive design
(AR #8); that review is not preflight or implementation review. No agent/configuration files are
created.

## Authorization and Handoff

Only this plan set and the feature-roadmap row are changed during planning. No product tests,
implementation, commit, push, `main` promotion, release or deployment is authorized by planning.
The portfolio cascade is deferred until integration into `develop`.

The user subsequently authorized this plan's preflight corrections, report/roadmap update and a
local commit. That authorization is recorded in the preflight report; it does not start product
implementation. Next workflow: use the exec-plan skill when execution is authorized. Its selected
commit/push mode and the git-commit skill govern future execution checkpoints.
