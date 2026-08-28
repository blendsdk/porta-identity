# Requirements: Organization Context and Navigation

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-02](../../requirements/RD-02-organization-context-and-navigation.md) — the owning requirements document

## Scope of this Plan

### In This Plan

- RD-02 OC-01–OC-04: global menus, identity dialog, and live advisory capabilities.
- RD-02 OC-05–OC-08: explicit complete-list organization choice and in-memory switching.
- RD-02 OC-09–OC-11: bounded create input, automatic post-create selection, and reauthentication
  reconciliation.
- RD-02 OC-12–OC-14: minimal landing view, keyboard/responsive behavior, and thin SDK integration.
- RD-02 AC-10: focused CLI/security/structure verification and the existing packed playground
  journey on Node 24 LTS. (AR-5, AR-9)

### Deferred / Out of This Plan

- Every RD-02 Won't Have item.
- Any server or SDK implementation change, including pagination or cancellation changes. (AR-4)
- Any organization administration beyond create and working-context selection.
- Full Porta/server verification while server code remains untouched. (AR-5)

## Plan-Local Decisions

| Decision             | Chosen                                                                             | AR Ref |
| -------------------- | ---------------------------------------------------------------------------------- | ------ |
| Implementation split | Add `organization-service.ts` and `organization-dialogs.ts`; extend existing files | AR-1   |
| List ordering        | Preserve `listAll()` order                                                         | AR-2   |
| Error vocabulary     | Five allowlisted local categories                                                  | AR-3   |

## Acceptance Criteria

- [ ] All RD-02 acceptance criteria are represented by concrete ST cases or EV-01 in
      [07-testing-strategy.md](07-testing-strategy.md).
- [ ] No plan task modifies `packages/server/`, `packages/sdk/`, dependency manifests, CI, or runtime
      matrices. (AR-4)
- [ ] The packed journey proves its high-entropy slug is test-owned, removes only that organization
      through the installed packed SDK before playground teardown, and verifies absence; deletion
      remains absent from the admin UI. (AR-4, AR-10)
