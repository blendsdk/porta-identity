# Testing Strategy: PostgreSQL-Backed Global Configuration

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

| Code type | Target |
|---|---:|
| Catalog, validation, runtime, transaction logic | 90% |
| SDK, CLI, Admin UI services/state | 80% |
| UI composition, glue, documentation | 60% |

These are the project defaults accepted in AR-15. Tests state behavior, use real catalog/database
objects where practical, and mock only external boundaries or not-yet-built modules.

## 🚨 Specification Test Cases

> These cases are immutable requirements-derived oracles. Implementation must change when it
> disagrees with a case; the cases must not be weakened to match implementation.

### Catalog and Migration

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-1 | Load the server catalog | Exactly the 18 RD keys appear once and in RD order; no obsolete/internal/environment key appears | RD-03 AC-01–AC-09; 03-01 §Catalog Types |
| ST-2 | For every numeric definition, validate its exact minimum and maximum | Both boundaries return the same native integer; `min-1` and `max+1` are rejected | RD-03 AC-03–AC-07, AC-10 |
| ST-3 | Validate `1.5`, `"900"`, `true`, `null`, `[]`, `{}`, `NaN`, and infinities as numeric settings | Every value is rejected without coercion | RD-03 AC-10; AR-2 |
| ST-4 | Validate `default_locale` with `en`, `EN`, `nl`, and `" en "` | Only exact `en` is accepted | RD-03 AC-08, AC-10; AR-7 |
| ST-5 | Inspect every catalog definition | Key, group, human label/description, native type, unit, default, bounds/allowed values, and mode match RD-03 and 03-01 | RD-03 AC-01; AR-17; 03-01 §Labels |
| ST-6 | For each `SUPPORTED_LOCALES` entry and required authentication namespace, read the packaged resource | Every file exists and parses as a JSON object | RD-03 AC-08; AR-7 |
| ST-7 | Apply migration 030 over canonical rows containing custom/wrong-typed values plus obsolete and internal rows | All 18 canonical values equal native defaults; seven obsolete rows are absent; internal row remains unchanged | RD-03 AC-02, AC-15; AR-5 |
| ST-8 | Inspect migration 030 Down section | It performs no data/schema reversal and documents reset as the recovery path | RD-03 §Migration; AR-5 |

### Runtime Consumption and Cache

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-9 | Read a valid native catalog value | Getter returns that exact value and caches it for 60 seconds | RD-03 AC-02, AC-12, AC-14 |
| ST-10 | Read a missing, wrong-type, or out-of-range catalog row | Getter returns that key's exact catalog default and emits only event, public key, and respective `missing`/`invalid` reason | RD-03 AC-14; AR-9, AR-12 |
| ST-11 | Database read throws with no valid cached value | Getter returns the catalog default and warning reason `unavailable`; raw error/value is absent | RD-03 AC-14; AR-9, AR-12 |
| ST-12 | Cache `900`, externally update row to `1200`, read at 59,999 ms, then at 60,000 ms | First read returns `900`; next read re-queries and returns `1200` | RD-03 AC-12 and acceptance 8; AR-3 |
| ST-13 | Clear after caching a value; also delay a pre-clear SELECT until after commit/clear | The next read queries immediately; delayed old completion cannot refill the replacement cache | RD-03 AC-12; AR-3; PF-003 |
| ST-14 | Load OIDC TTL configuration from the five startup keys | Provider input receives their native stored values; interaction remains fixed and grant follows refresh-token TTL | RD-03 AC-03, §Runtime Consumption |
| ST-15 | Process a new magic-link/password-reset job and create an invitation after changing each TTL | Each new artifact gets `now + current configured TTL`; already-issued expiries remain unchanged | RD-03 AC-04, acceptance 9; AR-8 |
| ST-16 | Change each authentication rate maximum/window and perform the next limiter decision | Next decision uses current maximum; new counters use current window; existing Redis expiry is not rewritten | RD-03 AC-05, acceptance 9; AR-8 |
| ST-17 | Change lockout threshold/duration while a lock exists | Next eligibility check uses current values and stored `locked_at`; no row rewrite occurs | RD-03 AC-06, acceptance 9; AR-8 |
| ST-18 | Run audit cleanup without and with an explicit retention value | Omitted value uses current catalog days; explicit value wins | RD-03 AC-07 |
| ST-19 | Resolve locale after request/user/org choices fail | Current catalog `default_locale` is used, then hard fallback `en` if runtime reading falls back | RD-03 AC-08, AC-14; AR-7, AR-9 |

### Admin API

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-20 | Authorized GET list against 18 healthy rows plus internal rows | `200`; exactly 18 `ConfigEntry` objects in catalog order; metadata comes from code; internal rows absent | RD-03 AC-01, AC-09, API Representation |
| ST-21 | GET one valid catalog key | `200 { data: ConfigEntry }` with native stored value and catalog metadata | RD-03 AC-02, AC-11 |
| ST-22 | GET unknown, obsolete, internal, environment-owned, or secret names | Every request returns identical `404` error/code and reveals no row/category distinction | RD-03 AC-09; AR-12 |
| ST-23 | GET list or valid key with DB failure, missing canonical row, or invalid stored value | Fixed `503 config_store_unavailable` with requestId and no fallback/raw detail | RD-03 AC-14; AR-9, AR-12 |
| ST-24 | PUT each numeric key at both boundaries; valid PUT over a corrupt targeted value | Native number is stored/projected and correct restart result returned; corrupt old value can be replaced without pre-reading it | RD-03 AC-03–AC-07, AC-10–AC-14; PF-002 |
| ST-25 | PUT invalid numeric/string shapes or extra fields | Fixed `400 config_value_invalid`; no row/audit/cache change | RD-03 AC-10; AR-12 |
| ST-26 | PUT a non-catalog single key or batch containing one | Fixed `404 config_entry_not_found`; no value validation disclosure and no mutation | RD-03 AC-09–AC-11; AR-12 |
| ST-27 | PUT one runtime key | One row commits, one audit event contains sorted key and `restartRequired:false`, local cache clears after commit, response matches single envelope | RD-03 AC-11–AC-16; AR-6, AR-10 |
| ST-28 | PUT batch `{magic_link_ttl:1200, access_token_ttl:7200}` | Both rows commit natively, response entries are in catalog order, one audit event lists sorted keys, `restartRequired:true` | RD-03 acceptance 6; AR-6, AR-10 |
| ST-29 | Force final update/audit failure, missing target, or invalid returned row | All values/audit roll back; cache remains; fixed safe 503 returned | RD-03 acceptance 7; AR-6, AR-9, AR-12; PF-002 |
| ST-30 | Call routes without bearer auth or without exact read/update permission | Existing Admin auth/permission response occurs and no config content/mutation is produced | RD-03 AC-16 |
| ST-31 | Inspect `admin.config.updated` metadata after success | Contains only sorted public keys and restart boolean; no old/new values, internal data, credentials, or raw errors | RD-03 AC-16; AR-6 |

### SDK and Conventional CLI

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-32 | Compile catalog writes and arbitrary-string reads; compile an arbitrary literal mutation key | Valid writes and string reads typecheck; non-catalog mutation keys fail | RD-03 AC-17; AR-4; PF-001 |
| ST-33 | Invoke SDK list/get/set/setMany | Exact HTTP methods/paths/native bodies are used; update methods preserve `restartRequired` | RD-03 AC-11, AC-13, AC-17; 03-03 §SDK Contract |
| ST-34 | Run `porta config list` and `get` over representative numeric and locale entries | Output includes exact key/value/type/unit/range-or-values/application mode; JSON preserves API data | RD-03 AC-17; AR-13, AR-17 |
| ST-35 | Run `porta config set magic_link_ttl 1200` | CLI first obtains metadata, sends JSON number `1200`, and prints success without restart notice | RD-03 AC-10, AC-13, AC-17; AR-13 |
| ST-36 | Run `porta config set access_token_ttl 7200` | CLI sends JSON number and prints that every Porta server instance must restart | RD-03 AC-13, AC-17; AR-3, AR-13 |
| ST-37 | Run set with unknown key, fraction, numeric text outside bounds, or unsupported locale | No PUT occurs for locally invalid catalog input; safe server 404 remains for unknown key | RD-03 AC-09, AC-10, AC-17; AR-13 |

### Admin UI

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-38 | Authenticated identity with/without config-read permission opens menus | Top-level command is enabled only with read permission and available operations | RD-03 AC-16, AC-18; AR-11 |
| ST-39 | Open a healthy workspace | Full-page caption is `System Configuration`; four tabs appear in required order with catalog fields in group order | RD-03 AC-18; AR-11 |
| ST-40 | Inspect at measured fitting minimum and one cell below width/height, then resize back | At fitting size all fields/help/two-row footer are visible and keyboard-reachable with DSL padding/gaps; below it existing resize guidance replaces form and preserves drafts; no scroller/universal size assertion | RD-03 AC-18; AR-11, AR-14, AR-17; PF-007 |
| ST-41 | Load clean state; clear numeric text, enter invalid text, restore original/equivalent number, then change two valid values across tabs | Save disabled clean/invalid; equivalent parsed number is clean; enabled only valid dirty; drafts survive tabs | RD-03 AC-19; AR-11; PF-008 |
| ST-42 | Save valid changes across two tabs and click Save twice | Exactly one batch request with changed keys occurs; duplicate submission is blocked; authoritative values reload | RD-03 AC-11, AC-19; AR-11 |
| ST-43 | Save runtime-only values, then a batch containing startup value | Runtime save shows normal success; startup batch shows the all-instance restart notice | RD-03 AC-13, AC-19; AR-3, AR-11 |
| ST-44 | Close clean workspace, then attempt to close dirty workspace | Clean closes directly; dirty shows one ordinary discard confirmation and closes only after discard | RD-03 AC-19; AR-11 |
| ST-45 | Render durations `60`, `900`, `3600`, `604800`, and `61` | Derived text is `1 minute`, `15 minutes`, `1 hour`, `7 days`, and `61 seconds`; exact seconds remain editable/visible | RD-03 AC-21; AR-16 |
| ST-46 | Identity has read but not update permission | Values render; Save remains disabled even when draft differs | RD-03 AC-16, AC-19; AR-11 |

### Documentation

| # | Input / Scenario | Expected Output / Behavior | Source |
|---|---|---|---|
| ST-47 | Parse public configuration/deployment documentation | One table exactly lists 18 editable keys with defaults/ranges/modes; a separate table lists external bootstrap/secrets | RD-03 AC-20 |
| ST-48 | Search public/maintainer config docs for propagation guidance | Docs state immediate local post-save visibility, at-most-60-second other-instance convergence, and restart of every instance for five startup keys; no automatic propagation claim | RD-03 AC-12, AC-13, AC-20; AR-3 |

## Test Categories

### Specification Tests

| Test File | ST Cases Covered | Component |
|---|---|---|
| `packages/server/tests/unit/lib/system-config-catalog.spec.test.ts` | ST-1–ST-6 | Catalog/locales |
| `packages/server/tests/unit/migrations/global-configuration-catalog.spec.test.ts` | ST-7–ST-8 | Migration contract |
| `packages/server/tests/integration/migrations/global-configuration-catalog.spec.test.ts` | ST-7 | Isolated pre-upgrade schema, real migration Up |
| `packages/server/tests/unit/lib/system-config-runtime.spec.test.ts` | ST-9–ST-14 | Runtime/cache |
| `packages/server/tests/unit/auth/system-config-consumers.spec.test.ts` | ST-15–ST-19 | Runtime consumers |
| `packages/server/tests/unit/routes/system-config-api.spec.test.ts` | ST-20–ST-26 | API contract |
| `packages/server/tests/integration/admin/system-config-api.spec.test.ts` | ST-27–ST-31 | Transaction/auth/audit |
| `packages/server/tests/pentest/admin-security/system-config.spec.test.ts` | ST-22, ST-25–ST-26, ST-30–ST-31 | Security boundary |
| `packages/sdk/tests/type-contracts/config.spec.test.ts` | ST-32 | SDK compiler oracle, registered in existing type-contract tsconfig |
| `packages/sdk/tests/domains/config.spec.test.ts` | ST-33 | SDK transport |
| `packages/cli/tests/commands/config.spec.test.ts` | ST-34–ST-37 | Conventional CLI |
| `packages/cli/tests/admin/system-config-workspace.spec.test.ts` | ST-39–ST-46 | Admin UI workspace |
| `packages/cli/tests/admin/system-config-application.spec.test.ts` | ST-38, ST-44 | Admin UI integration |
| `repo-tests/monorepo/global-configuration-docs.spec.test.mjs` | ST-47–ST-48 | Documentation |

### Implementation Tests

| Test File | Description | Priority |
|---|---|---|
| `packages/server/tests/unit/lib/system-config-runtime.impl.test.ts` | Cache edges, warning calls, internal reader separation | High |
| `packages/server/tests/unit/routes/system-config-api.impl.test.ts` | Projection helpers and transaction failure branches | High |
| `packages/sdk/tests/domains/config.impl.test.ts` | Transport/error edge behavior | Medium |
| `packages/cli/tests/commands/config.impl.test.ts` | Formatting and lexical parser edges | Medium |
| `packages/cli/tests/admin/system-config-state.impl.test.ts` | Draft equality, validation, duration text, busy state | High |
| `packages/cli/tests/admin/system-config-controller.impl.test.ts` | Cancellation, load/save failure, lifecycle cleanup | High |

### Integration Tests

Before migration implementation, the isolated-schema migration specification executes migration
Up over canonical custom/wrong-type values, seven obsolete rows and unchanged internal rows,
using the existing scratch-schema pattern. Unit SQL checks alone are not the upgrade oracle.

The server integration specification applies migration 030 to the real test database and proves
native storage, permissions, atomicity, audit, and post-commit cache behavior. Existing integration
database fixtures are updated to the exact catalog.

### End-to-End Tests

No new OIDC browser or external harness scenario is required: the feature does not add a public
OIDC flow, and the authenticated Admin API transaction is more deterministically covered by the
real-database integration specification. Existing `yarn test:ui`, production-security assurance,
and final verification remain regression gates. No new harness is created. (AR-14, AR-15)

AR-20 A additionally authorizes aligning only the existing session-expiry setup in
`test-harness/assurance/tests/human-auth-functional-session.ts` with the native catalog:
submit `{ value: 300 }`, keep the existing provider restart, and wait 301.5 seconds before
the unchanged natural-expiry and active-session-list assertions. The existing suite budget
supports this wait. No forced database/Redis expiry, fake clock, new scenario, or harness is added.
Rerun the registered production-security gate from a clean Phase 2 candidate. Existing registered
incomplete forwarding observations remain disclosed and are not waived; publication remains
blocked pending corrected evidence review.

## Test Data

### Fixtures Needed

- Exact 18-row native catalog fixture plus `super_admin_user_id`.
- Corrupt/missing catalog row variants.
- Authorized read-only and read/write Admin identities.
- Transaction failure injection on final update and audit write.

### Mock Requirements

- Unit specifications mock only database query, clock, SDK transport, or UI host boundaries.
- Integration specifications use real PostgreSQL and existing authentication helpers.

### Superseded Contracts and Enrollment

During specification authoring, inventory existing config-related tests/callers. Update the legacy
server unit getter tests, SDK domain tests, CLI command tests and SDK agent metadata/tests only
where RD-03 intentionally retires coercion, arbitrary mutation keys, string updates or old results.
Preserve applicable security assertions; do not add compatibility behavior. Register the new SDK
type file in the existing explicit include list and use compiler typecheck for red/green evidence.
(PF-004–PF-006)

## Verification Checklist

- [ ] ST-1–ST-48 have executable immutable specification coverage.
- [ ] Specification tests are observed failing before implementation.
- [ ] Implementation makes specifications pass without changing expected behavior.
- [ ] Implementation tests cover internal edges and failure branches.
- [ ] Affected server, SDK, CLI, structure, UI, docs, assurance, compatibility, and final gates from
      AR-15 pass with their artifacts reviewed.
