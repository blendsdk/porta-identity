# Requirements: Organization Settings and Branding

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-06](../../requirements/RD-06-organization-settings-and-branding.md) — the owning requirements document

## Scope of This Plan

### In This Plan

- RD-06 AC-01–AC-08: selected-organization navigation, workspace, Overview, lifecycle, login methods,
  password-login 2FA, guidance, and direct save behavior.
- RD-06 AC-09–AC-14: branding settings, validated fallback URLs, metadata rows, immediate asset
  operations, approved formats/limits, and truthful SDK contracts.
- RD-06 AC-15–AC-20: public asset delivery, effective page/email branding, CSP, bounded request
  sizing, authorization/isolation, and single-operator mutation reconciliation.
- RD-06 AC-21–AC-22: accessible outcomes, stable focus, active-tab retention, and stale-context
  closure.

### Deferred / Out of This Plan

- Every RD-06 Won't Have item remains excluded. (AR-1)
- RD-07 owns individual-user 2FA enrollment statistics and controls.
- RD-09 owns template editing and advanced operational tooling.
- RD-10 retains permanent organization deletion in the organization switcher.
- Existing conventional CLI custom-CSS support remains unchanged; the Admin UI does not expose it.

## Plan-Local Decisions

| Decision            | Chosen                                                                  | AR Ref |
| ------------------- | ----------------------------------------------------------------------- | ------ |
| Planning boundary   | Implement only the passing RD-06 artifact                               | AR-1   |
| Component structure | Admin asset/SDK contracts, public rendering, and organization workspace | AR-2   |
| Concurrency         | Do not use optional ETags or add multi-administrator behavior           | AR-2   |
| Verification        | Use the confirmed focused and final command set                         | AR-3   |

## Acceptance Criteria

There are no plan-local behavioral criteria. RD-06 owns the complete acceptance contract. The plan
is acceptable when every RD-06 criterion is traced to an immutable ST case, all planned tasks obey
specification-first ordering, and all AR-3 gates reach an eligible passing outcome.
