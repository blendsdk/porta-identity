# Requirements: OIDC Client Workflow Redesign

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-04](../../requirements/RD-04-applications-and-oidc-clients.md) — the owning requirements document

## Scope of this plan (delta view)

### In this plan

- RD-04 AC-08–AC-09: compact registration followed by sectioned client administration.
- RD-04 AC-11–AC-12: initial and rotated secret expiry selection and one-time presentation.
- RD-04 AC-13–AC-18: context safety, focused mutations, Layout DSL, and server defaults.
- RD-04 acceptance criteria 6–19 for client workflow, validation, security, and verification.

### Deferred / out of this plan

- RD-04 application and module behavior is unchanged.
- Organization-default login-method editing remains in the existing API and conventional CLI.
- Azure-only certificates, federation, owners, multi-directory registration, exposed APIs, and API
  permission assignment are excluded (AR-8–AR-9).
- Database schema, OIDC runtime, RBAC, sessions, deployment, CI, and infrastructure are unchanged
  (AR-1, AR-9).

## Plan-local decisions

| Decision | Chosen | AR Ref |
|---|---|---|
| Redirect persistence | Stage locally and replace the array once on Save | AR-10 |
| Initial-secret API field | Flat optional `secretExpiresAt` | AR-11 |
| Post-create destination | New client's Overview after secret handling and authoritative reload | AR-12; RD-04 AC-14 |
| Verification | Structure, affected workspace verifies, docs, retained OIDC/protocol assurance, and clean-revision compatibility; no root `yarn verify` | AR-13 |
| Dialog source organization | Feature-local responsibility split with a stable facade file; obsolete shared-tab symbols are removed | AR-14 |

## Acceptance Criteria

1. [ ] Every executable behavior traces to RD-04 or an AR entry above.
2. [ ] The implementation adds no generalized editor, router, policy engine, dependency, migration,
       worker, cache, or infrastructure surface (AR-1, AR-9, AR-14).
3. [ ] Verification uses the exact gate in AR-13.
