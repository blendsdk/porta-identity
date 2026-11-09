# Requirements: Resource-Server Admin Management

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-01](../../requirements/RD-01-resource-server-admin.md) — the OWNING requirements document

## Scope of this plan (delta view)

### In this plan

- RD-01 Must Have: Admin API, resource-server projection, exact application ownership, read/write
  authorization, replace-all scopes, audience default, hard delete, SDK, CLI, docs, and audit.
- RD-01 Should Have: human/JSON CLI output, delete confirmation, repeated `--scope`, bounded list.
- RD-01 Technical Requirements: API contract, validation/error mapping, persistence/concurrency,
  SDK contract, CLI contract, documentation contract, and non-functional requirements.
- RD-01 Acceptance Criteria 1–20.

### Deferred / out of this plan

- RD-01 Won't Have: terminal Admin UI, end-user self-service, export/import, target-specific audit,
  ETag/If-Match, pagination, new RBAC permissions, new migrations, and organization scoping.
- No plan-local behavior is added beyond RD-01.

## Plan-local decisions

| Decision | Chosen | AR Ref |
| --- | --- | --- |
| Server module location | New `packages/server/src/resource-servers/` module | AR-1 |
| Route wiring | New `routes/resource-servers.ts` mounted in `server.ts` | AR-2 |
| Documentation layout | Dedicated API and CLI pages, cross-linked | AR-3 |
| Verification gate | Targeted per-task checks; `pnpm verify` at the final phase | AR-4 |
| Provider-boundary reviewer | Existing `oidc-provider-reviewer` | AR-5 |

## Acceptance Criteria

RD-01 owns the behavioral acceptance criteria. This plan adds only:

1. [ ] Every phase in `99-execution-plan.md` completes with its specified verification.
2. [ ] `pnpm verify` passes at the final phase (AR-4).
3. [ ] The `oidc-provider-reviewer` reviews the Phase 1 provider-boundary diff (AR-5).
4. [ ] No new migration is added; the existing resource-server schema tests remain green.
