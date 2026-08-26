# Requirements: Assurance Product Remediation

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-05](../../requirements/RD-05-security-risk-slice-assurance.md) — the owning requirements document

## Scope of this plan

### In this plan

- RD-05 R5.6 and AC7: functional and design-level enumeration resistance (AR-1).
- RD-05 R5.7 and AC6/AC13: tenant-bound, atomic, single-use magic links (AR-2).
- RD-05 R5.9 and AC14: exact bulk/import/export behavior (AR-3).
- RD-05 R5.17 and AC15: correlated privacy-safe security-decision events (AR-4).
- Necessary migrations, server/SDK/CLI compatibility updates, immutable specification tests,
  implementation tests, public documentation, and maintainer architecture documentation.

### Out of this plan

- CI/workflow, release, publishing, deployment, or merge-policy changes.
- Consent/session-context, JWKS separation, concurrent-consume, response-loss, forced-crash, and
  other named assurance gaps not caused by AR-1 through AR-4.
- New scanners, production-only test hooks, or changes that weaken existing pentests.
- General queue, audit, import/export, or authorization features beyond the exact contracts here.

## Plan-local decisions

| Decision | Chosen | AR Ref |
| --- | --- | --- |
| Recovery-work transport | PostgreSQL-backed outbox claimed with bounded `SKIP LOCKED` batches; no new external queue dependency | AR-5 |
| Migration policy | Additive forward migration only; do not rewrite applied migrations | AR-6 |
| Evidence boundary | Public HTTP/browser plus independent database/Redis/MailHog/log observers; no source variation | AR-7 |
| Compatibility | Preserve existing bulk response shape; explicitly version incompatible import/export changes in docs/types | AR-3 |

## Plan-local acceptance criteria

1. Every new specification test is written and observed red before implementation.
2. Existing pentest assertions remain collected and unmodified except where a test is extended with
   stricter assertions from this plan.
3. Applied migrations remain untouched; migration forward/backward behavior is tested.
4. Public responses and retained logs/evidence contain no raw credential, token, email, actor/user
   identifier, request body, rejected value, internal path, stack trace, SQL/infrastructure detail,
   IP address, or user agent unless RD-05 explicitly permits the public export field.
5. `yarn verify`, the exact affected integration/UI/pentest selectors, and the retained assurance
   selectors pass before a task is complete.
