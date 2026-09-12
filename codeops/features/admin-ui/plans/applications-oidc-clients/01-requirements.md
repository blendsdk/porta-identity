# Requirements: Applications and OIDC Clients

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-04](../../requirements/RD-04-applications-and-oidc-clients.md) — the owning requirements document

## Scope of this plan (delta view)

### In this plan

- RD-04 AC-01–AC-06: separate global Applications navigation, lifecycle, detail, and modules.
- RD-04 AC-07–AC-12: selected-organization client configuration, lifecycle, and secret rotation.
- RD-04 AC-13–AC-16: context ownership, mutation outcomes, Layout DSL/DataGrid, and terminal behavior.
- RD-04 AC-17–AC-18: thin services and server-owned defaults.
- RD-04 focused server, SDK, conventional CLI, documentation, and compatibility corrections.

### Deferred / out of this plan

- Everything in RD-04's Won't Have section, including RD-05 authorization administration,
  RD-08 audit/history UI, RD-09 operational tools, search/pagination controls, multi-operator
  coordination, and generalized UI infrastructure.
- A linearizable revocation redesign or provider fork; AR-8 defines the accepted request boundary.
- Request-scoped metadata plumbing solely for legacy Argon2-only client secrets; AR-7 owns the
  supported one-time rotation path.

## Plan-local decisions

| Decision                     | Chosen                                                                              | AR Ref |
| ---------------------------- | ----------------------------------------------------------------------------------- | ------ |
| Client configuration layout  | One movable, vertically scrollable tabbed dialog with DataGrid collection editors   | AR-3   |
| Multi-secret runtime adapter | Validate active secrets, then canonicalize only a valid credential for the provider | AR-4   |
| Active secret safety bound   | At most 10 active secrets per client; generation is conditional and fail-closed     | AR-4   |
| Existing App Admin repair    | New ordered idempotent migration plus role-definition update                        | AR-5   |
| Verification boundary        | Full focused gate under Node 24 LTS                                                 | AR-6   |
| Legacy-secret transition     | Generate one modern secret before legacy overlap can authenticate                   | AR-7   |
| In-flight revocation         | Already validated request may complete; subsequent requests reload state and fail   | AR-8   |

## Acceptance Criteria

1. The implementation satisfies every RD-04 acceptance criterion without adding adjacent product functionality.
2. All ST cases in `07-testing-strategy.md` pass as immutable specification tests.
3. The completion commands approved in AR-6 pass from the required clean revision where applicable.
