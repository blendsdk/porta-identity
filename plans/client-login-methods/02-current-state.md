# Current State: Client Login Methods

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists

The current login flow is hard-coded to present **both** authentication methods to every user, on every client, for every organization. There is no existing configuration knob at any level — neither org, application, nor client — that controls which login methods are available.

The login page (`templates/default/pages/login.hbs`) is a single Handlebars template that unconditionally renders:

1. A `<form method="POST" action="/interaction/:uid/login">` with email + password inputs
2. A divider `<div class="divider"><span>or</span></div>`
3. A second `<form method="POST" action="/interaction/:uid/magic-link">` with a single button
4. A small `<script>` that copies the email value from the password form into the hidden `email` field of the magic-link form before submit

The backend interaction routes (`src/routes/interactions.ts`) accept both POST endpoints unconditionally — there is no check for whether a given method is permitted for the current client or organization.

### Relevant Files

| File                                              | Purpose                                           | Changes Needed                                            |
| ------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------- |
| `migrations/002_organizations.sql`                | Organizations table schema                        | None (new migration 014 alters it)                        |
| `migrations/004_clients.sql`                      | Clients table schema                              | None (new migration 014 alters it)                        |
| `src/organizations/types.ts`                      | Organization TS types + row mapper                | Add `defaultLoginMethods` field + mapping                 |
| `src/organizations/repository.ts`                 | Org DB CRUD                                       | Include `default_login_methods` in INSERT/UPDATE/SELECT   |
| `src/organizations/service.ts`                    | Org business logic + validation                   | Validate non-empty array on create/update                 |
| `src/organizations/cache.ts`                      | Redis org cache                                   | Verify JSON serialization preserves array                 |
| `src/routes/organizations.ts`                     | Admin API for orgs                                | Add `defaultLoginMethods` to Zod schemas                  |
| `src/clients/types.ts`                            | Client TS types + row mapper                      | Add `LoginMethod` type + `loginMethods` (nullable) field  |
| `src/clients/repository.ts`                       | Client DB CRUD                                    | Include `login_methods` in INSERT/UPDATE/SELECT           |
| `src/clients/service.ts`                          | Client business logic + `findForOidc()`           | Validate, expose resolved methods in OIDC metadata        |
| `src/clients/cache.ts`                            | Redis client cache                                | Verify JSON serialization preserves null                  |
| `src/routes/clients.ts`                           | Admin API for clients                             | Add `loginMethods` to Zod schemas (nullable)              |
| `src/routes/interactions.ts`                      | Login/consent/magic-link route handlers           | Resolve methods, pass to template, enforce on POST         |
| `src/oidc/configuration.ts`                       | OIDC provider configuration builder               | Add `urn:porta:login_methods` to `extraClientMetadata`    |
| `src/cli/commands/org.ts`                         | CLI `porta org` subcommands                       | Add `--login-methods` flag on create + update             |
| `src/cli/commands/client.ts`                      | CLI `porta client` subcommands                    | Add `--login-methods` flag on create + update (with `inherit`) |
| `templates/default/pages/login.hbs`               | Login page template                               | Conditional sections based on `loginMethods`              |

### Code Analysis

**Hard-coded login template (`templates/default/pages/login.hbs`):**

```hbs
<form method="POST" action="/interaction/{{interaction.uid}}/login">
  <!-- email + password fields, always rendered -->
</form>

<div class="divider"><span>{{t "login.or_divider"}}</span></div>

<form method="POST" action="/interaction/{{interaction.uid}}/magic-link">
  <!-- magic link button, always rendered -->
</form>
```

No conditional logic. The template receives `interaction.uid`, `email`, `csrfToken`, `orgSlug`, and branding via `buildBaseContext()` — but **not** any indicator of which login methods are enabled.

**Interaction router (`src/routes/interactions.ts`):**

```typescript
router.post('/:uid/login',       async (ctx) => await processLogin(...));
router.post('/:uid/magic-link',  async (ctx) => await handleSendMagicLink(...));
```

Both handlers resolve the organization via `resolveOrganizationForInteraction()` (which looks up the client by `client_id` from the interaction params) — so the client and org are readily available. However, neither handler checks whether the method is permitted.

**Client → OIDC metadata (`src/clients/service.ts` `findForOidc()`):**

```typescript
const metadata: Record<string, unknown> = {
  client_id: client.clientId,
  client_name: client.clientName,
  // ... standard OIDC fields ...
  'urn:porta:allowed_origins': client.allowedOrigins,
  'urn:porta:client_type': client.clientType,
  organizationId: client.organizationId,
};
```

This is where we'll inject the resolved login methods. However, `findForOidc()` doesn't currently load the organization — so either:
- **Option A:** Load the org inside `findForOidc()` and resolve there → simplest; keeps OIDC metadata self-contained
- **Option B:** Put only the raw `client.loginMethods` into OIDC metadata and resolve in `showLogin()` using `ctx.state.organization`

**Chosen approach:** **Option B** — only put the raw client value into OIDC metadata. The org is already loaded in `showLogin()` via `resolveOrganizationForInteraction()`. This avoids an extra DB call per `findForOidc()` invocation (which happens on every OIDC request, not just login).

**Configuration (`src/oidc/configuration.ts`):**

```typescript
extraClientMetadata: {
  properties: [
    'organizationId',
    'urn:porta:allowed_origins',
    'urn:porta:client_type',
  ],
},
```

Must add `'urn:porta:login_methods'` here so node-oidc-provider preserves the custom field.

## Gaps Identified

### Gap 1: No per-entity login method configuration

**Current Behavior:** All users see both password and magic-link forms on every login page.
**Required Behavior:** Login page renders only enabled methods, resolved from client (override) or org (default).
**Fix Required:** New DB columns + type/service/repo changes + template conditionals + backend enforcement.

### Gap 2: No OIDC metadata pathway for login methods

**Current Behavior:** `findForOidc()` exposes only OIDC-standard fields + a few Porta-specific `urn:porta:*` fields.
**Required Behavior:** Expose `urn:porta:login_methods` so interaction routes can read it from the provider's client metadata.
**Fix Required:** Add to metadata object + register in `extraClientMetadata.properties`.

### Gap 3: No backend enforcement of selected login method

**Current Behavior:** Both POST endpoints (login, magic-link) accept all requests that pass CSRF + rate limit.
**Required Behavior:** Reject requests where the method is disabled for the client (403 + render login with error).
**Fix Required:** Guard clause at the top of each POST handler, after CSRF + rate-limit pass but before processing.

### Gap 4: Admin API and CLI cannot configure login methods

**Current Behavior:** No create/update path accepts login-method fields.
**Required Behavior:** Zod schemas + CLI flags accept and validate the new fields.
**Fix Required:** Update Zod schemas in route files + yargs definitions in CLI command files.

### Gap 5: No resolution helper

**Current Behavior:** No code exists for computing effective methods.
**Required Behavior:** A small, testable pure function `resolveLoginMethods(org, client)`.
**Fix Required:** New file `src/clients/resolve-login-methods.ts` exporting the function + barrel export from `src/clients/index.ts`.

## Dependencies

### Internal Dependencies

- `src/organizations/*` — must be updated before `src/clients/*` in some aspects (the service needs Organization-level validation in place)
- `src/clients/*` — depends on new Organization type for resolver
- `src/routes/interactions.ts` — depends on both types being updated + resolver existing
- `src/oidc/configuration.ts` — depends on `urn:porta:login_methods` being emitted by `findForOidc()`
- CLI commands — depend on service + repository being ready
- Tests — depend on all modules being updated

### External Dependencies

- None. No new npm packages required. All libraries in use (pg, ioredis, zod, yargs, handlebars) already handle `TEXT[]` and nullable columns.

## Risks and Concerns

| Risk                                                               | Likelihood | Impact   | Mitigation                                                                                               |
| ------------------------------------------------------------------ | ---------- | -------- | -------------------------------------------------------------------------------------------------------- |
| Existing Redis cache entries stale after deploy (missing new field) | Medium     | Low      | Cache entries are short-lived (60s TTL for orgs, similar for clients). New field defaults on mapping prevent crashes — old cache entries won't have the field, but mapping will supply the default. |
| Template rendering breaks when `loginMethods` undefined             | Medium     | Medium   | Template uses explicit `{{#if showPassword}}` / `{{#if showMagicLink}}` booleans from server-side resolution. Server always computes both booleans before render. |
| OIDC provider strips unknown metadata field                         | Low        | High     | Register `urn:porta:login_methods` in `extraClientMetadata.properties` — verified working pattern (already used for `urn:porta:allowed_origins` and `urn:porta:client_type`). |
| Mass-assignment via admin API: malicious operator sets empty array  | Low        | Medium   | Zod schema enforces `min(1)` + dedup validation at service layer                                          |
| Migration race with running instances                               | Low        | Low      | Migration is ADD COLUMN with DEFAULT — non-locking on Postgres 16, safe for rolling deploy               |
| Test breakage from changed type signatures                          | High       | Low      | All existing test fixtures will need `defaultLoginMethods` on org + `loginMethods: null` on client. Mitigation: add helper `buildTestOrganization()` / `buildTestClient()` fixtures, or update test factories. Tracked as a dedicated task. |
| Audit log noise from routine updates                                | Low        | Low      | Only log diffs — compare old vs. new array, skip if identical                                             |
| `urn:porta:login_methods` becoming stale vs. DB after update        | Low        | Low      | Existing `invalidateClientCache()` is called on every client update — covers this case                    |
