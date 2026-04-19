# Execution Plan: Client Login Methods

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-19 13:28
> **Progress**: 25/58 tasks (43%)


## Overview

Implements organization-default + per-client override login-method configuration. Introduces a new migration, extends the Organization + Client types, adds a resolver helper, wires OIDC metadata through to the interaction layer, enforces methods in POST handlers, updates the login template, and exposes the new fields via admin API + CLI.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                                                     | Sessions | Est. Time |
| ----- | --------------------------------------------------------- | -------- | --------- |
| 1     | Database migration + fixture groundwork                   | 1        | 30 min    |
| 2     | Shared types + resolver helper                            | 1        | 30 min    |
| 3     | Organizations module (types, repo, service, cache, tests) | 1        | 60 min    |
| 4     | Clients module (types, repo, service, cache, tests)       | 2        | 90 min    |
| 5     | OIDC config + interaction routes (show + enforce + tests) | 2        | 105 min   |
| 6     | Template + i18n                                           | 1        | 35 min    |
| 7     | Admin API routes (Zod, response shapes, tests)            | 1        | 45 min    |
| 8     | CLI commands (parser, org + client flags, tests)          | 1        | 45 min    |
| 9     | E2E + UI Playwright + pentest + RD-07 addendum + final verification | 1 | 75 min    |
| 10    | Playground integration (seed + SPA + BFF + smoke)         | 1        | 60 min    |

**Total: ~12 sessions, ~9–10 hours**

---

## Phase 1: Database Migration + Fixture Groundwork

### Session 1.1: Migration 014 + test fixtures

**Reference**: [03-database-schema.md](03-database-schema.md), [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Add the new columns to the DB, update test fixtures so subsequent module changes don't break existing tests.

**Tasks**:

| #     | Task                                                                                | File                                            |
| ----- | ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1.1.1 ✅ | Create `migrations/014_login_methods.sql` (up + down)                                | `migrations/014_login_methods.sql`              |
| 1.1.2 ✅ | Add unit test case for migration 014 in `migrations.test.ts`                        | `tests/unit/migrations.test.ts`                 |
| 1.1.3 ✅ | Add integration test case for migration 014 (up, defaults, down)                    | `tests/integration/migrations.test.ts`          |
| 1.1.4 ✅ | Create / update `tests/fixtures/organizations.ts` with `buildTestOrganization()`    | `tests/fixtures/organizations.ts`                |
| 1.1.5 ✅ | Create / update `tests/fixtures/clients.ts` with `buildTestClient()`                | `tests/fixtures/clients.ts`                      |
| 1.1.6 ✅ | Audit `migrations/011_seed.sql` — verify DEFAULT clause covers seeded orgs; patch if needed | `migrations/011_seed.sql`                 |

**Deliverables**:
- [x] Migration 014 applies + reverts cleanly
- [x] Fixtures available for reuse across all subsequent sessions
- [x] Migration tests pass

**Completion Notes (2026-04-19)**:
- Migration 014 adds `organizations.default_login_methods` (NOT NULL TEXT[] DEFAULT ARRAY['password', 'magic_link']) and `clients.login_methods` (nullable TEXT[], NULL = inherit).
- Up/down pair is symmetric — both columns added and dropped.
- Audit of `011_seed.sql`: no patch needed. The seed runs before 014; Postgres backfills the column for the existing super-admin row via the column DEFAULT. Verified by integration test `seeded super-admin org inherits the default_login_methods column default`.
- All 89 unit-migration tests pass; all 47 integration-migration tests pass; full `yarn verify` passes (2046 tests across 118 files).

**Verify**: `clear && sleep 3 && yarn test:unit -- migrations && yarn test:integration -- migrations`

---

## Phase 2: Shared Types + Resolver

### Session 2.1: LoginMethod type + resolveLoginMethods helper

**Reference**: [04-types-and-services.md](04-types-and-services.md)
**Objective**: Put the core `LoginMethod` type + resolver in place so all other sessions can import it.

**Tasks**:

| #     | Task                                                                              | File                                            |
| ----- | --------------------------------------------------------------------------------- | ----------------------------------------------- |
| 2.1.1 ✅ | Add `LoginMethod` union + `LOGIN_METHODS` const to `src/clients/types.ts`        | `src/clients/types.ts`                          |
| 2.1.2 ✅ | Create `src/clients/resolve-login-methods.ts` with `resolveLoginMethods` + `normalizeLoginMethods` | `src/clients/resolve-login-methods.ts` |
| 2.1.3 ✅ | Add unit tests for resolver + normalizer                                          | `tests/unit/clients/resolve-login-methods.test.ts` |
| 2.1.4 ✅ | Update `src/clients/index.ts` barrel to export new symbols                        | `src/clients/index.ts`                          |

**Deliverables**:
- [x] `LoginMethod` type importable from `src/clients`
- [x] Resolver + normalizer fully unit-tested (18 tests)
- [x] Barrel exports updated

**Completion Notes (2026-04-19)**:
- `LoginMethod` is a string-literal union `'password' | 'magic_link'` backed by the runtime const `LOGIN_METHODS` so callers can iterate / validate without rewriting the union.
- `resolveLoginMethods()` takes a structural `LoginMethodsClientView` (defined inline in the resolver) instead of `Pick<Client, 'loginMethods'>` so the helper compiles **before** Phase 4 wires the field onto the `Client` model. Once Phase 4 lands, the structural type stays a valid subtype of `Client` so call sites continue to compile.
- The empty-array branch in the resolver is defensive (the service layer rejects `[]` on write) but keeps the read path safe against unexpected upstream data.
- `normalizeLoginMethods()` deduplicates while preserving first-occurrence order — used by the org service in Phase 3 (and the client service in Phase 4) before persisting.
- 18 unit tests cover both helpers; full unit suite + `tsc` build clean.

**Verify**: `clear && sleep 3 && yarn test:unit -- clients/resolve-login-methods && yarn lint`

---

## Phase 3: Organizations Module

### Session 3.1: Organizations types, repo, service, cache + tests

**Reference**: [04-types-and-services.md](04-types-and-services.md)
**Objective**: Full `defaultLoginMethods` support across the organizations module.

**Tasks**:

| #     | Task                                                                                 | File                                       |
| ----- | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| 3.1.1 ✅ | Add `defaultLoginMethods` to `Organization`, `CreateOrganizationInput`, `UpdateOrganizationInput`, `OrganizationRow`, update `mapRowToOrganization` | `src/organizations/types.ts` |
| 3.1.2 ✅ | Update `insertOrganization`, `updateOrganization`, `findOrganizationById`, `findOrganizationBySlug`, `listOrganizations` in repo | `src/organizations/repository.ts` |
| 3.1.3 ✅ | Add validation + normalization in `createOrganization` / `updateOrganization` + audit log diff | `src/organizations/service.ts`       |
| 3.1.4 ✅ | Verify cache serialization via roundtrip test                                        | `src/organizations/cache.ts` (no code change); `tests/unit/organizations/cache.test.ts` |
| 3.1.5 ✅ | Update `tests/unit/organizations/types.test.ts` for new field                        | `tests/unit/organizations/types.test.ts`    |
| 3.1.6 ✅ | Update `tests/unit/organizations/repository.test.ts` for new column                  | `tests/unit/organizations/repository.test.ts` |
| 3.1.7 ✅ | Update `tests/unit/organizations/service.test.ts` for validation + normalization    | `tests/unit/organizations/service.test.ts`  |

**Deliverables**:
- [x] All orgs module tests passing with new field (120/120)
- [x] Existing orgs tests unchanged or minimally updated via fixture
- [x] No regressions (full unit suite 1911/1911 still green)

**Completion Notes (2026-04-19)**:
- `Organization.defaultLoginMethods` typed as `LoginMethod[]` (not nullable on the model) — the DB column is `NOT NULL DEFAULT ARRAY['password', 'magic_link']`, so the model always carries a non-empty array. Mapper has a defensive `?? ['password', 'magic_link']` fallback for stale caches / hand-crafted rows.
- Repository `INSERT` builds the column list dynamically: when `defaultLoginMethods` is `undefined` the column is **omitted** from the SQL so the DB DEFAULT fires (back-compat with callers that don't know about the column). Update path adds the column to the `FIELD_TO_COLUMN` map so the existing dynamic SET clause supports it transparently.
- Service-layer `validateDefaultLoginMethods()` (private helper) rejects non-array, empty-array, and unknown-method inputs with `OrganizationValidationError`, then deduplicates via `normalizeLoginMethods()`.
- Update path captures the previous value via `getOrganizationById()` (cache-aware) **before** the repo update so the audit log can record `previousDefaultLoginMethods → newDefaultLoginMethods`.
- Imports use `../clients/types.js` + `../clients/resolve-login-methods.js` directly (not the clients barrel) to keep the org→clients dependency narrow.
- New tests: types (3 cases), repository (2 cases), service (8 cases — 5 create + 3 update), cache (1 roundtrip case). All passing.

**Verify**: `clear && sleep 3 && yarn test:unit -- organizations && yarn lint`

---

## Phase 4: Clients Module

### Session 4.1: Clients types, repo, cache + tests

**Reference**: [04-types-and-services.md](04-types-and-services.md)
**Objective**: Types + data layer for `loginMethods` (nullable).

**Tasks**:

| #     | Task                                                                                 | File                                    |
| ----- | ------------------------------------------------------------------------------------ | --------------------------------------- |
| 4.1.1 ✅ | Add `loginMethods` to `Client`, `CreateClientInput`, `UpdateClientInput`, `ClientRow`, update `mapRowToClient` | `src/clients/types.ts` |
| 4.1.2 ✅ | Update `insertClient`, `updateClient` (dynamic SET with null-aware logic), `findClientById`, `findClientByClientId`, `listClients` | `src/clients/repository.ts` |
| 4.1.3 ✅ | Verify cache serialization via roundtrip test                                        | `src/clients/cache.ts` (no code); `tests/unit/clients/cache.test.ts` |
| 4.1.4 ✅ | Update `tests/unit/clients/types.test.ts`                                             | `tests/unit/clients/types.test.ts`       |
| 4.1.5 ✅ | Update `tests/unit/clients/repository.test.ts`                                        | `tests/unit/clients/repository.test.ts`  |

**Deliverables**:
- [x] Clients types + repo fully aware of `loginMethods`
- [x] Null + array roundtrip tested
- [x] All clients unit tests pass

**Verify**: `clear && sleep 3 && yarn test:unit -- clients && yarn lint`

### Session 4.2: Clients service + findForOidc + tests

**Reference**: [04-types-and-services.md](04-types-and-services.md)
**Objective**: Business logic + OIDC metadata.

**Tasks**:

| #     | Task                                                                                       | File                                        |
| ----- | ------------------------------------------------------------------------------------------ | ------------------------------------------- |
| 4.2.1 ✅ | Add validation + normalization to `createClient` / `updateClient` + audit-log diff          | `src/clients/service.ts`                    |
| 4.2.2 ✅ | Expose `urn:porta:login_methods` in `findForOidc()`                                         | `src/clients/service.ts`                    |
| 4.2.3 ✅ | Update `tests/unit/clients/service.test.ts` for all validation paths + `findForOidc` output | `tests/unit/clients/service.test.ts`        |

**Deliverables**:
- [x] Service validates create + update paths
- [x] `findForOidc` output verified in tests
- [x] No regressions

**Completion Notes (2026-04-19)**:
- `Client.loginMethods` typed as `LoginMethod[] | null` — **nullable on the model**: `null` means "inherit from org default", non-null = validated override. Mapper preserves `null` as sentinel (in contrast to Organization where the column is `NOT NULL`).
- Repository `INSERT` builds the column list dynamically: `loginMethods: undefined` → column omitted (DB DEFAULT NULL fires); `loginMethods: null` → column explicitly inserted as `NULL`; array → inserted as TEXT[]. The `FIELD_TO_COLUMN` map picks the field up for updates automatically. Dynamic SET clause already handled `NULL` values via parameterized binds — no null-aware branching needed.
- Service `validateClientLoginMethods()` (private helper) enforces the three-state contract: `undefined` / `null` / non-empty array of valid `LoginMethod` values. Empty arrays and unknown methods throw `ClientValidationError`.
- `createClient` uses spread-if-defined to preserve the "column-omitted" semantics: when `loginMethods` is `undefined` the key is dropped from the `insertClient` payload entirely. Explicit `null` passes through so callers can document "this client inherits" intent.
- `updateClient` uses `Object.prototype.hasOwnProperty.call(input, 'loginMethods')` to distinguish "key absent" (leave alone) from "key present with null" (clear override). Audit log captures `previousLoginMethods → newLoginMethods` **only when the field changed**, so routine updates stay readable.
- `findForOidc()` exposes the raw override value under `urn:porta:login_methods` (the raw `null`-or-array from the DB). Resolution happens in the interaction layer (Phase 5), not here — this keeps the metadata layer a pure projection of DB state.
- New tests: types (4 cases — null, array, mapper override, etc.), repository (4 cases — insert omission, insert null, update null, update array with normalization), service (14 cases across create/update/findForOidc).
- `yarn test:unit` → 1937 tests passing (up from 1923). Lint: 0 errors (40 pre-existing warnings). Build (`tsc`): clean.

**Verify**: `clear && sleep 3 && yarn test:unit -- clients/service && yarn lint`


---

## Phase 5: OIDC + Interaction Routes

### Session 5.1: OIDC configuration + interaction helper

**Reference**: [05-oidc-and-interactions.md](05-oidc-and-interactions.md)
**Objective**: Register extra metadata + add resolver helper to interactions module.

**Tasks**:

| #     | Task                                                                             | File                                    |
| ----- | -------------------------------------------------------------------------------- | --------------------------------------- |
| 5.1.1 | Add `'urn:porta:login_methods'` to `extraClientMetadata.properties`              | `src/oidc/configuration.ts`             |
| 5.1.2 | Update `tests/unit/oidc/configuration.test.ts` with assertion                    | `tests/unit/oidc/configuration.test.ts` |
| 5.1.3 | Add `resolveLoginMethodsFromOidcClient()` helper in interactions file            | `src/routes/interactions.ts`            |
| 5.1.4 | Extend `TemplateContext` with `showPassword`, `showMagicLink`, `showDivider`, `loginMethods` | `src/auth/template-engine.ts`   |

**Deliverables**:
- [ ] OIDC config preserves new field
- [ ] Helper in place, ready for use in handlers
- [ ] Template context type updated

**Verify**: `clear && sleep 3 && yarn test:unit -- oidc && yarn lint`

### Session 5.2: Interaction handlers — show + enforce

**Reference**: [05-oidc-and-interactions.md](05-oidc-and-interactions.md)
**Objective**: Wire resolution into `showLogin()` and enforcement into the two POST handlers.

**Tasks**:

| #     | Task                                                                       | File                               |
| ----- | -------------------------------------------------------------------------- | ---------------------------------- |
| 5.2.1 | Update `showLogin()` to resolve + pass `showPassword/showMagicLink/showDivider/loginMethods` | `src/routes/interactions.ts`  |
| 5.2.2 | Update `processLogin()` to enforce `'password'` in effective methods (403 + audit) | `src/routes/interactions.ts` |
| 5.2.3 | Update `handleSendMagicLink()` to enforce `'magic_link'` in effective methods (403 + audit) | `src/routes/interactions.ts` |
| 5.2.4 | Add new i18n key `errors.login_method_disabled` (en) + `errors.no_login_methods_configured` | `locales/default/en/errors.json` |
| 5.2.5 | Update `tests/unit/routes/interactions.test.ts` with 10+ new cases (see doc 07) | `tests/unit/routes/interactions.test.ts` |
| 5.2.6 | Enforce `password` in effective methods on `GET /auth/forgot-password` + `POST /auth/forgot-password` + `POST /auth/reset-password` (403 + audit, same pattern as `processLogin`) | `src/routes/password-reset.ts` |
| 5.2.7 | Read + sanitize `login_hint` from interaction params; pass `emailHint` to template context in `showLogin()` | `src/routes/interactions.ts` + `src/auth/template-engine.ts` |
| 5.2.8 | Extend `tests/unit/routes/password-reset.test.ts` with 3 enforcement cases (password-only allowed; magic-link-only blocked GET/POST/reset) | `tests/unit/routes/password-reset.test.ts` |

**Deliverables**:
- [ ] Login page reflects resolved methods
- [ ] Disabled-method POSTs blocked with 403 + audit
- [ ] Backward compatibility (default client) verified
- [ ] All interactions tests passing

**Verify**: `clear && sleep 3 && yarn test:unit -- routes/interactions && yarn lint`

---

## Phase 6: Template + i18n

### Session 6.1: Login template rewrite

**Reference**: [06-api-cli-template.md](06-api-cli-template.md)
**Objective**: Conditional rendering of password / magic-link / divider, with magic-link-only email input.

**Tasks**:

| #     | Task                                                            | File                                  |
| ----- | --------------------------------------------------------------- | ------------------------------------- |
| 6.1.1 | Rewrite `login.hbs` with `showPassword`/`showMagicLink`/`showDivider` conditionals | `templates/default/pages/login.hbs` |
| 6.1.2 | Add fallback block for "no methods configured"                  | `templates/default/pages/login.hbs`   |
| 6.1.3 | Verify script only loads when divider present                   | `templates/default/pages/login.hbs`   |
| 6.1.4 | Smoke-test in dev server: verify both/password-only/magic-only render correctly | (manual via yarn dev) |
| 6.1.5 | Wrap "Forgot password?" link inside `{{#if showPassword}}` block (cosmetic; backend already enforces) | `templates/default/pages/login.hbs` |
| 6.1.6 | Wire `{{emailHint}}` into both email input `value=""` attributes (password form + magic-link form) | `templates/default/pages/login.hbs` |

**Deliverables**:
- [ ] Template renders correctly in all three modes
- [ ] Fallback message when misconfigured
- [ ] No broken JS references

**Verify**: `clear && sleep 3 && yarn lint`

---

## Phase 7: Admin API

### Session 7.1: Organizations + Clients admin API routes

**Reference**: [06-api-cli-template.md](06-api-cli-template.md)
**Objective**: Accept the new fields via HTTP, surface `effectiveLoginMethods` on GET responses.

**Tasks**:

| #     | Task                                                                                  | File                             |
| ----- | ------------------------------------------------------------------------------------- | -------------------------------- |
| 7.1.1 | Update `src/routes/organizations.ts` Zod schemas + handlers                           | `src/routes/organizations.ts`    |
| 7.1.2 | Update `src/routes/clients.ts` Zod schemas + handlers; add `effectiveLoginMethods` to GET responses | `src/routes/clients.ts` |
| 7.1.3 | Update `tests/unit/routes/organizations.test.ts`                                      | `tests/unit/routes/organizations.test.ts` |
| 7.1.4 | Update `tests/unit/routes/clients.test.ts`                                            | `tests/unit/routes/clients.test.ts` |

**Deliverables**:
- [ ] API accepts + rejects correctly
- [ ] GET responses include `effectiveLoginMethods`
- [ ] Route tests pass

**Verify**: `clear && sleep 3 && yarn test:unit -- routes/organizations routes/clients && yarn lint`

---

## Phase 8: CLI

### Session 8.1: `porta org` + `porta client` `--login-methods` flags

**Reference**: [06-api-cli-template.md](06-api-cli-template.md)
**Objective**: Operator tooling.

**Tasks**:

| #     | Task                                                                                   | File                             |
| ----- | -------------------------------------------------------------------------------------- | -------------------------------- |
| 8.1.1 | Create `parseLoginMethodsFlag()` helper (new file `src/cli/parsers.ts` or in shared)   | `src/cli/parsers.ts`             |
| 8.1.2 | Add `--login-methods` flag + handling to `porta org create` / `update`                 | `src/cli/commands/org.ts`        |
| 8.1.3 | Add `--login-methods` flag + `inherit` sentinel to `porta client create` / `update`    | `src/cli/commands/client.ts`     |
| 8.1.4 | Update `porta org show` output to display `Default login methods`                      | `src/cli/commands/org.ts`        |
| 8.1.5 | Update `porta client show` output to display raw + effective                           | `src/cli/commands/client.ts`     |
| 8.1.6 | Unit tests for `parseLoginMethodsFlag`                                                 | `tests/unit/cli/parsers.test.ts` (new) |
| 8.1.7 | Update `tests/unit/cli/commands/org.test.ts` for new flag + output                     | `tests/unit/cli/commands/org.test.ts` |
| 8.1.8 | Update `tests/unit/cli/commands/client.test.ts` for new flag + `inherit` + output      | `tests/unit/cli/commands/client.test.ts` |

**Deliverables**:
- [ ] CLI accepts + rejects correctly
- [ ] Show output includes new fields
- [ ] All CLI tests pass

**Verify**: `clear && sleep 3 && yarn test:unit -- cli && yarn lint`

---

## Phase 9: E2E + Pentest + Final Verification

### Session 9.1: End-to-end + security tests + verify

**Reference**: [07-testing-strategy.md](07-testing-strategy.md)
**Objective**: Full verification.

**Tasks**:

| #     | Task                                                            | File                                    |
| ----- | --------------------------------------------------------------- | --------------------------------------- |
| 9.1.1 | Create `tests/e2e/login-methods.spec.ts` covering 6 scenarios   | `tests/e2e/login-methods.spec.ts`       |
| 9.1.2 | Add pentest cases for CSRF + info-leak + mass-assignment + forgot-password enforcement + `login_hint` XSS | `tests/pentest/login-methods.test.ts`   |
| 9.1.3 | Create `tests/ui/flows/login-methods.spec.ts` — 6 Playwright scenarios (password-only, magic-only, both, forgot-link hidden, `login_hint` prefill, POST enforcement via direct fetch) | `tests/ui/flows/login-methods.spec.ts` |
| 9.1.4 | Update regression asserts in `tests/ui/flows/password-login.spec.ts` + `tests/ui/flows/magic-link.spec.ts` | `tests/ui/flows/password-login.spec.ts` + `tests/ui/flows/magic-link.spec.ts` |
| 9.1.5 | Append "Addendum: Configurable Login Methods" section to `requirements/RD-07-auth-workflows-login-ui.md` linking to this plan | `requirements/RD-07-auth-workflows-login-ui.md` |
| 9.1.6 | Full verify run (`yarn verify` + `yarn test:ui` if in scope)    | —                                       |
| 9.1.7 | Re-analyze project with `analyze_project` + update `.clinerules/project.md` | `.clinerules/project.md`        |

**Deliverables**:
- [ ] All E2E scenarios pass
- [ ] Pentest scenarios pass
- [ ] `yarn verify` green end-to-end
- [ ] `project.md` reflects new module layout

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 10: Playground Integration

### Session 10.1: Seed + SPA + BFF + smoke tests

**Reference**: [08-playground-integration.md](08-playground-integration.md)
**Objective**: Make the new login-method configuration demoable end-to-end in both playground surfaces. Runs *after* Phase 9 so the backend is fully verified.

**Tasks**:

| #      | Task                                                                                      | File                                            |
| ------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 10.1.1 | Extend `scripts/playground-seed.ts` — add `passwordOnly` org + 5 new clients + generated-config updates | `scripts/playground-seed.ts`            |
| 10.1.2 | Update `playground/index.html` — add "Login Method Demo" card with client dropdown       | `playground/index.html`                          |
| 10.1.3 | Extend `playground/js/config.js` with `getLoginMethodProfiles()` + `getLoginMethodProfile()` | `playground/js/config.js`                   |
| 10.1.4 | Add `loginWithProfile()` to `playground/js/auth.js` + URL-hash round-trip                 | `playground/js/auth.js`                          |
| 10.1.5 | Wire dropdown + confirmation card in `playground/js/app.js`                                | `playground/js/app.js`                           |
| 10.1.6 | Document new scenarios in `playground/README.md`                                           | `playground/README.md`                           |
| 10.1.7 | Add `BFF_CLIENT_PROFILE` support to `playground-bff/src/config.ts`                         | `playground-bff/src/config.ts`                   |
| 10.1.8 | Create `playground-bff/src/routes/debug.ts` with `/debug/client-login-methods`             | `playground-bff/src/routes/debug.ts` **(NEW)**   |
| 10.1.9 | Register debug route + wire dashboard data in `playground-bff/src/server.ts`               | `playground-bff/src/server.ts`                   |
| 10.1.10 | Add "Login Methods Configuration" panel to `playground-bff/views/dashboard.hbs`           | `playground-bff/views/dashboard.hbs`             |
| 10.1.11 | Document profiles + debug endpoint in `playground-bff/README.md`                          | `playground-bff/README.md`                       |
| 10.1.12 | Update banner in `scripts/run-playground.sh` with login-method URLs                        | `scripts/run-playground.sh`                      |
| 10.1.13 | Add 3 curl assertions to `scripts/playground-bff-smoke.sh`                                 | `scripts/playground-bff-smoke.sh`                |
| 10.1.14 | Manual smoke: `yarn docker:up → seed → run-playground.sh → visit all 4 SPA scenarios + both BFF profiles` | (manual)                            |

**Deliverables**:
- [ ] Seed script creates 1 new org + 5 new clients with correct login-method configs
- [ ] SPA dropdown lets user switch among 4 scenarios; URL hash survives redirect
- [ ] BFF dashboard renders Login Methods panel for the active profile
- [ ] `/debug/client-login-methods` returns expected JSON shape (dev only)
- [ ] `BFF_CLIENT_PROFILE=password yarn --cwd playground-bff dev` works end to end
- [ ] `scripts/playground-bff-smoke.sh` passes all new assertions
- [ ] Manual smoke confirms all 10 acceptance criteria in doc 08

**Verify**:
```bash
clear && sleep 3 && yarn docker:up
clear && sleep 3 && yarn tsx scripts/playground-seed.ts
clear && sleep 3 && bash scripts/run-playground.sh
# in another terminal:
clear && sleep 3 && bash scripts/playground-bff-smoke.sh
```

---

## Task Checklist (All Phases)

### Phase 1: Database migration + fixtures
- [x] 1.1.1 Create `migrations/014_login_methods.sql`
- [x] 1.1.2 Add unit test case for migration 014
- [x] 1.1.3 Add integration test case for migration 014
- [x] 1.1.4 Update `tests/fixtures/organizations.ts`
- [x] 1.1.5 Update `tests/fixtures/clients.ts`
- [x] 1.1.6 Audit `migrations/011_seed.sql` for seed-org default coverage

### Phase 2: Shared types + resolver
- [x] 2.1.1 Add `LoginMethod` + `LOGIN_METHODS` to `src/clients/types.ts`
- [x] 2.1.2 Create `src/clients/resolve-login-methods.ts`
- [x] 2.1.3 Unit tests for resolver + normalizer
- [x] 2.1.4 Update `src/clients/index.ts` barrel

### Phase 3: Organizations module
- [x] 3.1.1 Extend `Organization` types + `mapRowToOrganization`
- [x] 3.1.2 Update `organizations/repository.ts` CRUD
- [x] 3.1.3 Add validation + audit log to `organizations/service.ts`
- [x] 3.1.4 Verify cache roundtrip test
- [x] 3.1.5 Update `organizations/types.test.ts`
- [x] 3.1.6 Update `organizations/repository.test.ts`
- [x] 3.1.7 Update `organizations/service.test.ts`

### Phase 4: Clients module
- [x] 4.1.1 Extend `Client` types + `mapRowToClient`
- [x] 4.1.2 Update `clients/repository.ts` CRUD with null-aware UPDATE
- [x] 4.1.3 Verify cache roundtrip test
- [x] 4.1.4 Update `clients/types.test.ts`
- [x] 4.1.5 Update `clients/repository.test.ts`
- [x] 4.2.1 Add validation + audit to `clients/service.ts`
- [x] 4.2.2 Expose `urn:porta:login_methods` in `findForOidc()`
- [x] 4.2.3 Update `clients/service.test.ts`


### Phase 5: OIDC + interactions
- [ ] 5.1.1 Add `urn:porta:login_methods` to `extraClientMetadata.properties`
- [ ] 5.1.2 Update `oidc/configuration.test.ts`
- [ ] 5.1.3 Add `resolveLoginMethodsFromOidcClient` helper
- [ ] 5.1.4 Extend `TemplateContext` type
- [ ] 5.2.1 Wire resolver into `showLogin()`
- [ ] 5.2.2 Add enforcement to `processLogin()`
- [ ] 5.2.3 Add enforcement to `handleSendMagicLink()`
- [ ] 5.2.4 Add i18n keys for error messages
- [ ] 5.2.5 Update `routes/interactions.test.ts`
- [ ] 5.2.6 Enforce `password` on forgot/reset-password routes (+ audit)
- [ ] 5.2.7 Wire `login_hint` → `emailHint` template context
- [ ] 5.2.8 Extend `routes/password-reset.test.ts` with enforcement cases

### Phase 6: Template
- [ ] 6.1.1 Rewrite `login.hbs` with conditionals
- [ ] 6.1.2 Add "no methods configured" fallback
- [ ] 6.1.3 Script only when divider present
- [ ] 6.1.4 Smoke-test all three modes in dev
- [ ] 6.1.5 Wrap "Forgot password?" link in `{{#if showPassword}}`
- [ ] 6.1.6 Wire `{{emailHint}}` into both email inputs

### Phase 7: Admin API
- [ ] 7.1.1 Update `routes/organizations.ts` Zod + handlers
- [ ] 7.1.2 Update `routes/clients.ts` Zod + handlers + `effectiveLoginMethods`
- [ ] 7.1.3 Update `routes/organizations.test.ts`
- [ ] 7.1.4 Update `routes/clients.test.ts`

### Phase 8: CLI
- [ ] 8.1.1 Create `parseLoginMethodsFlag()` helper
- [ ] 8.1.2 Update `porta org` commands
- [ ] 8.1.3 Update `porta client` commands
- [ ] 8.1.4 Update `porta org show` output
- [ ] 8.1.5 Update `porta client show` output
- [ ] 8.1.6 Unit tests for parser helper
- [ ] 8.1.7 Update `cli/commands/org.test.ts`
- [ ] 8.1.8 Update `cli/commands/client.test.ts`

### Phase 9: E2E + UI + Pentest + RD-07 Addendum + Verify
- [ ] 9.1.1 Create `tests/e2e/login-methods.spec.ts`
- [ ] 9.1.2 Create `tests/pentest/login-methods.test.ts`
- [ ] 9.1.3 Create `tests/ui/flows/login-methods.spec.ts` (Playwright)
- [ ] 9.1.4 Update regression asserts in password-login + magic-link UI specs
- [ ] 9.1.5 Append RD-07 addendum for configurable login methods
- [ ] 9.1.6 Full `yarn verify`
- [ ] 9.1.7 Re-analyze + update `.clinerules/project.md`

### Phase 10: Playground Integration
- [ ] 10.1.1 Extend `scripts/playground-seed.ts` (org + 5 clients + generated config)
- [ ] 10.1.2 Add "Login Method Demo" card to `playground/index.html`
- [ ] 10.1.3 Extend `playground/js/config.js` with profile helpers
- [ ] 10.1.4 Add `loginWithProfile()` to `playground/js/auth.js`
- [ ] 10.1.5 Wire dropdown + confirmation card in `playground/js/app.js`
- [ ] 10.1.6 Document new scenarios in `playground/README.md`
- [ ] 10.1.7 Add `BFF_CLIENT_PROFILE` to `playground-bff/src/config.ts`
- [ ] 10.1.8 Create `playground-bff/src/routes/debug.ts` (dev-only)
- [ ] 10.1.9 Register debug route + dashboard data in `playground-bff/src/server.ts`
- [ ] 10.1.10 Add Login Methods panel to `playground-bff/views/dashboard.hbs`
- [ ] 10.1.11 Document profiles + debug endpoint in `playground-bff/README.md`
- [ ] 10.1.12 Update banner in `scripts/run-playground.sh`
- [ ] 10.1.13 Add 3 curl assertions to `scripts/playground-bff-smoke.sh`
- [ ] 10.1.14 Manual smoke through all SPA + BFF scenarios

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/client-login-methods/99-execution-plan.md`"
2. Open the relevant technical doc from `plans/client-login-methods/`
3. Read the target source files before editing

### Ending a Session

1. Run the project's verify command (`yarn verify`) — or a scoped version during intermediate sessions
2. Handle commit per the active **commit mode** (see `make_plan.md` — Commit Behavior During Plan Execution)
3. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan client-login-methods` to continue

---

## Dependencies

```
Phase 1 (DB migration + fixtures)
    ↓
Phase 2 (Shared types + resolver)
    ↓
Phase 3 (Organizations module)     ─┐
                                     ├── Phase 5 (OIDC + interactions)
Phase 4 (Clients module)           ─┘       ↓
    ↓                                    Phase 6 (Template)
    ↓                                       ↓
    └─────────────────────────────────── Phase 7 (Admin API)
                                            ↓
                                         Phase 8 (CLI)
                                            ↓
                                         Phase 9 (E2E + Verify)
                                            ↓
                                         Phase 10 (Playground)
```

Phase 3 and Phase 4 are independent and could run in parallel. Phase 5 depends on both. Phases 6, 7, 8 all depend on Phase 5 but are largely independent of each other. **Phase 10 runs last** and depends on Phases 3, 4, 6, and 7 being complete — it integrates the fully-working backend into the two playground surfaces (SPA + BFF) so the feature is demoable out of the box.

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ All verification passing (`yarn verify`)
3. ✅ No warnings/errors
4. ✅ Documentation updated (JSDoc on new functions; this plan marked 100%)
5. ✅ Code reviewed (if applicable)
6. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
