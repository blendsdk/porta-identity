# RD-03: PostgreSQL-Backed Global Configuration

> **Document**: RD-03-postgresql-backed-global-configuration.md
> **Status**: Approved
> **Created**: 2026-09-12
> **Project**: Porta Production Readiness
> **Depends On**: RD-01, RD-02
> **CodeOps Artifact Schema**: 1

---

## Feature Overview

Porta shall store a small, code-defined catalog of operational authentication policy in PostgreSQL
and make it editable through the existing Admin API, SDK, CLI, and embedded Admin UI. Administrators
can change supported values without editing a JSON or environment file, while the application keeps
control of which keys exist, their types, safe ranges, defaults, and whether they take effect at
runtime or after restart. (AR-13–AR-15)

Infrastructure addresses, bootstrap topology, TLS configuration, SMTP credentials, cookie keys,
and encryption root keys remain environment or secret-manager inputs. The feature corrects current
seed/runtime key mismatches and removes unused public configuration rows. It reuses the existing
`system_config` table and 60-second process-local cache. It adds no arbitrary key editor,
configuration schema framework, pub/sub, watcher, polling service, history store, feature-flag
system, or multi-administrator conflict workflow. (AR-13, AR-14, AR-19)

---

## Functional Requirements

### Must Have

- [ ] **AC-01 — Closed catalog (M):** editable global configuration shall consist only of the keys
      in the catalog defined by this RD. Catalog metadata—key, group, label, description, type,
      unit, default, minimum, maximum, and application mode—shall be defined in code. An
      administrator cannot create, rename, or delete keys through the API, SDK, CLI, or Admin UI.
- [ ] **AC-02 — PostgreSQL authority (M):** the value for every catalog entry shall be stored as its
      native JSONB scalar in `system_config`. Runtime readers shall use the same catalog key and
      default as the Admin surface. String-encoded numbers and divergent seed/runtime names shall no
      longer be part of the supported contract.
- [ ] **AC-03 — Token and session lifetimes (M):** the closed lifetime group shall expose the
      following integer seconds. `access_token_ttl` and `id_token_ttl` default to `3600` and allow
      `60..86400`; `refresh_token_ttl` defaults to `2592000` and allows `300..31536000`;
      `authorization_code_ttl` defaults to `600` and allows `30..3600`; and `session_ttl` defaults to
      `86400` and allows `300..2592000`. These five values have application mode `restart-required`.
- [ ] **AC-04 — Recovery and invitation lifetimes (M):** `magic_link_ttl` defaults to `900` and
      allows `60..3600`; `password_reset_ttl` defaults to `3600` and allows `300..86400`; and
      `invitation_ttl` defaults to `604800` and allows `300..2592000`. All are integer seconds with
      application mode `runtime`. Invitation creation shall read `invitation_ttl` instead of using a
      hard-coded seven-day value.
- [ ] **AC-05 — Authentication rate limits (M):** runtime integer settings shall be
      `rate_limit_login_max` default `10`, range `1..100`; `rate_limit_login_window` default `900`,
      range `60..86400`; `rate_limit_magic_link_max` default `5`, range `1..100`;
      `rate_limit_magic_link_window` default `900`, range `60..86400`;
      `rate_limit_password_reset_max` default `5`, range `1..100`; and
      `rate_limit_password_reset_window` default `900`, range `60..86400`. Window values are
      seconds. Existing fixed 2FA verification/resend limits remain outside the catalog.
- [ ] **AC-06 — Account lockout policy (M):** `max_failed_logins` shall be an integer defaulting to
      `5` with range `1..100`; `lockout_duration_seconds` shall be an integer defaulting to `900`
      with range `60..604800`. Both have application mode `runtime` and shall be the only supported
      global automatic-lockout keys.
- [ ] **AC-07 — Audit retention (S):** `audit_retention_days` shall be an integer defaulting to `90`
      with range `1..3650` and application mode `runtime`. It shall remain the default used by the
      existing audit cleanup operation when no explicit retention value is supplied.
- [ ] **AC-08 — Global locale (S):** `default_locale` shall be a string defaulting to `en`, limited
      to locale identifiers for which the running Porta installation has a complete locale bundle.
      It has application mode `runtime` and remains the final configured fallback after request,
      user, and organization locale resolution.
- [ ] **AC-09 — Internal and external settings hidden (M):** non-catalog database rows required by
      Porta internals, including `super_admin_user_id`, shall not appear in Admin list/get responses.
      Requests for internal, unknown, secret, or environment-owned keys shall return the same fixed
      `404` response. The API shall never expose database/Redis URLs, issuer/bootstrap values, TLS or
      SMTP credentials, `COOKIE_KEYS`, `SIGNING_KEY_ENCRYPTION_KEY`, or
      `TWO_FACTOR_ENCRYPTION_KEY`.
- [ ] **AC-10 — Typed validation (M):** update requests shall accept native JSON number or string
      values according to the catalog. Integer values must be finite integers inside their inclusive
      ranges. Locale must match an installed locale exactly. Boolean, object, array, null,
      string-number, unknown-key, and extra-field inputs shall be rejected with `400` and
      `code: "config_value_invalid"` without changing any row.
- [ ] **AC-11 — Single and batch updates (M):** `PUT /api/admin/config/:key` shall update one catalog
      value. `PUT /api/admin/config` shall accept a non-empty `values` object containing one or more
      distinct catalog entries, validate the complete request first, and update all values plus one
      audit event in one PostgreSQL transaction. A failure shall leave every prior value unchanged.
- [ ] **AC-12 — Cache behavior (M):** after a successful local save, Porta shall clear the existing
      process-local system configuration cache. Runtime settings shall be visible to subsequent
      reads in that process immediately and to other healthy instances after at most the existing
      60-second cache lifetime. No pub/sub, cache version, watcher, polling loop, or Redis
      invalidation channel shall be added.
- [ ] **AC-13 — Restart-required behavior (M):** changing any of the five provider-startup lifetime
      values shall persist successfully but shall not claim to reconfigure the running OIDC
      provider. API, SDK, CLI, and Admin UI results shall return `restartRequired: true`; the Admin UI
      shall state that every Porta server instance must be restarted. Runtime-only updates return
      `restartRequired: false` unless included in a batch with a restart-required key.
- [ ] **AC-14 — Reads and safe fallback (M):** catalog reads shall validate stored values before use.
      A missing row may use the catalog's code-defined default. A database read failure may use a
      still-valid cached value or the same safe default and emit a fixed warning without raw error or
      stored content. An invalid stored value shall use the safe default and emit a fixed warning;
      it shall never be coerced from a different JSON type.
- [ ] **AC-15 — Catalog migration (M):** one ordered forward migration shall upsert the complete
      catalog with native JSONB defaults, preserve valid values already stored under canonical keys,
      and remove the obsolete public rows `login_rate_limit`, `lockout_duration`, `api_rate_limit`,
      `cookie_secure`, `magic_link_length`, `require_pkce`, and `cors_max_age`. It shall not delete
      internal rows such as `super_admin_user_id`. No legacy alias lookup or data compatibility layer
      shall remain.
- [ ] **AC-16 — Authorization and audit (M):** list/get operations retain
      `admin:config:read`; single/batch updates retain `admin:config:update`. Existing bearer
      authentication and Admin role resolution remain mandatory. Each committed request shall write
      one `admin.config.updated` audit event containing only sorted changed catalog keys and the
      restart-required boolean—not old/new values, internal rows, credentials, or raw errors.
- [ ] **AC-17 — SDK and conventional CLI (M):** the SDK shall expose catalog metadata with typed
      values plus typed single/batch updates. `porta config list`, `get`, and `set` shall use the
      closed catalog, accept native CLI input converted according to catalog type, show validation
      ranges, and print the restart-required notice when applicable. Neither layer shall accept an
      arbitrary key.
- [ ] **AC-18 — Admin UI workspace (M):** the embedded Admin UI shall add a full-page System
      Configuration workspace using existing tabs/surfaces and Layout DSL. Settings shall be grouped
      as Lifetimes, Rate limits, Lockout, and General. Form rows shall have a one-row gap, bounded
      input width, complete labels with units, and inline range help. OIDC startup fields shall show
      a small restart-required notice without an invasive warning banner.
- [ ] **AC-19 — Admin UI save state (S):** Save shall remain disabled until at least one value differs
      from the loaded state and every changed value is valid. Saving shall send one batch request,
      block duplicate submission, reload authoritative values on success, and show whether restart
      is required. Cancel/navigation with unsaved changes shall use one ordinary discard
      confirmation. No reload-and-retry or concurrent-editor workflow is required.
- [ ] **AC-20 — Documentation (S):** environment and deployment documentation shall contain two
      explicit tables: the database-backed editable catalog with defaults/ranges/application modes,
      and the environment/secret-manager settings that remain external. It shall explain the local
      immediate/other-instance 60-second runtime boundary and the all-instance restart requirement
      without suggesting automatic cross-instance propagation.

### Should Have

- [ ] **AC-21 — Human-readable durations (S):** duration inputs should display the exact stored
      seconds alongside a derived human-readable value such as `15 minutes` or `30 days`. The derived
      text is presentation only and shall not introduce a second stored representation.

### Won't Have (Out of Scope)

- Administrator-created keys, custom schemas, nested JSON configuration, feature flags, tenant-
  specific overrides, or per-client overrides.
- Database/Redis connection details, issuer/bootstrap topology, TLS material, SMTP credentials,
  cookie keys, signing-key encryption keys, TOTP encryption keys, or other root secrets.
- Configuration history/version tables, rollback, scheduled activation, approval workflow, ETags,
  optimistic concurrency, reload-and-retry, or multi-administrator editing support.
- Redis pub/sub, database notifications, polling services, filesystem watchers, workers, queues, or
  automatic process restart.
- Runtime mutation of an already constructed `oidc-provider` instance.
- Exporting configuration in the portability manifest from RD-02.
- Making every existing hard-coded Porta constant administrator-configurable.

---

## Technical Requirements

### Closed Catalog

| Group | Key | Type/unit | Default | Inclusive range | Application mode |
|---|---|---|---:|---:|---|
| Lifetimes | `access_token_ttl` | integer seconds | 3600 | 60–86400 | Restart required |
| Lifetimes | `id_token_ttl` | integer seconds | 3600 | 60–86400 | Restart required |
| Lifetimes | `refresh_token_ttl` | integer seconds | 2592000 | 300–31536000 | Restart required |
| Lifetimes | `authorization_code_ttl` | integer seconds | 600 | 30–3600 | Restart required |
| Lifetimes | `session_ttl` | integer seconds | 86400 | 300–2592000 | Restart required |
| Lifetimes | `magic_link_ttl` | integer seconds | 900 | 60–3600 | Runtime |
| Lifetimes | `password_reset_ttl` | integer seconds | 3600 | 300–86400 | Runtime |
| Lifetimes | `invitation_ttl` | integer seconds | 604800 | 300–2592000 | Runtime |
| Rate limits | `rate_limit_login_max` | integer attempts | 10 | 1–100 | Runtime |
| Rate limits | `rate_limit_login_window` | integer seconds | 900 | 60–86400 | Runtime |
| Rate limits | `rate_limit_magic_link_max` | integer attempts | 5 | 1–100 | Runtime |
| Rate limits | `rate_limit_magic_link_window` | integer seconds | 900 | 60–86400 | Runtime |
| Rate limits | `rate_limit_password_reset_max` | integer attempts | 5 | 1–100 | Runtime |
| Rate limits | `rate_limit_password_reset_window` | integer seconds | 900 | 60–86400 | Runtime |
| Lockout | `max_failed_logins` | integer attempts | 5 | 1–100 | Runtime |
| Lockout | `lockout_duration_seconds` | integer seconds | 900 | 60–604800 | Runtime |
| General | `audit_retention_days` | integer days | 90 | 1–3650 | Runtime |
| General | `default_locale` | installed locale | `en` | closed installed set | Runtime |

- One exported immutable catalog constant shall be the source for API metadata, validation,
  defaults, service readers, SDK discriminators, CLI help, and Admin UI projection. This is a fixed
  list, not a general registration framework.
- `system_config.value` remains JSONB. Catalog integers are stored as JSON numbers and locale as a
  JSON string. Existing metadata columns may remain for schema compatibility, but code-defined
  catalog metadata is authoritative and raw rows are never serialized directly.
- Direct internal database settings may coexist in `system_config`; public queries use a catalog-key
  allowlist rather than `SELECT`-and-mask behavior.

### API Representation

```text
ConfigEntry = {
  key,
  group,
  label,
  description,
  value,
  defaultValue,
  valueType,
  unit,
  minimum?,
  maximum?,
  applicationMode,
  updatedAt
}
```

- `GET /api/admin/config` returns all catalog entries in catalog order and no internal rows.
- `GET /api/admin/config/:key` returns one catalog entry or fixed `404`.
- `PUT /api/admin/config/:key` accepts `{ "value": <native scalar> }` with no extra fields.
- `PUT /api/admin/config` accepts `{ "values": { "catalog_key": <native scalar>, ... } }` with no
  extra fields and returns the updated entries plus `restartRequired`.
- All response objects derive metadata from the catalog and values from validated database content;
  database descriptions, types, and sensitivity flags are not trusted as public schema.

### Runtime Consumption

- The current OIDC TTL loader reads the five restart-required values before constructing
  `oidc-provider`. Saving them affects the next process start only.
- Magic-link/password-reset job creation, invitation creation, rate-limit loaders, lockout logic,
  audit cleanup, and locale fallback shall use catalog-backed typed getters.
- Successful updates call `clearSystemConfigCache()` only after commit. Failed or rolled-back updates
  leave the existing cache unchanged.
- Each process retains the current 60-second cache. No cross-process invalidation promise shorter
  than 60 seconds is made.
- Warnings use fixed event names and key identifiers only. They exclude raw database errors and
  stored values.

### Migration and Cleanup

- The forward migration shall upsert canonical keys with native JSONB defaults and delete obsolete
  rows directly. Porta has no adopted production configuration requiring alias-value migration or
  a compatibility reader.
- The migration Down section is a documented no-op. Development and playground databases may be
  reset and initialized through their established commands.

### Verification Contract

- Immutable specification tests shall be written and observed failing before implementation.
- Catalog specifications shall assert the exact 18 keys, types, defaults, inclusive boundaries,
  groups, and application modes listed above.
- API specifications shall cover list/get allowlisting, native JSON typing, every minimum/maximum,
  extra fields, unknown/internal/secret keys, atomic batch rollback, permissions, audit content, and
  restart-required results.
- Runtime specifications shall cover invitation TTL usage, every current rate-limit loader, lockout,
  audit cleanup, locale fallback, local cache clear after commit only, and other-instance convergence
  at the existing 60-second bound.
- UI specifications shall cover grouping, one-row DSL gaps, bounded inputs, validation messages,
  dirty/valid Save state, batch save, restart notice, discard confirmation, and fixed small-terminal
  behavior without a 48×12 assumption.
- Verification shall include focused server, SDK, CLI, and Admin UI tests; each affected workspace
  verification; `yarn test:structure`; `yarn test:ui`; applicable production-security assurance;
  and final `yarn verify`.

---

## Integration Points

### With RD-01 (Production Security Corrections)

- `SIGNING_KEY_ENCRYPTION_KEY` and `TWO_FACTOR_ENCRYPTION_KEY` remain external root secrets and are
  never catalog entries.
- Token lifetime edits retain the provider restart boundary established in the production guidance.

### With RD-02 (Selective Environment Portability)

- Global configuration remains destination-specific and is rejected if present in a portability
  manifest.
- Import/export Admin surfaces may share navigation and presentation patterns but not a generalized
  operations framework.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|---|---|---|---|---|
| Key ownership | Arbitrary database keys / closed catalog / environment only | Closed code catalog with database values | Provides safe editing without an unbounded configuration system | AR-13 |
| Secret boundary | Store everything / separate runtime policy and root secrets | Root secrets remain external | Database compromise must not disclose its own encryption roots | AR-14 |
| Runtime refresh | Immediate distributed messaging / bounded local caches | Local clear plus existing 60-second bound | Meets the single-operator need without new infrastructure | AR-14, AR-19 |
| Provider settings | Mutate live provider / restart | Restart all instances | Matches current provider construction and avoids fragile live mutation | AR-14, AR-19 |
| Admin surface | Raw values / focused typed workspace / general framework | Focused typed workspace | Directly supports the catalog with existing UI patterns | AR-15 |

---

## Security Considerations

- **Data sensitivity**: catalog values are operational policy, not credentials. Internal identifiers
  and all environment/root secrets remain undisclosed.
- **Input validation**: strict Zod schemas enforce native types, exact keys, inclusive ranges,
  installed locales, non-empty batches, and no extra fields on the server.
- **Authentication & authorization**: existing Admin bearer authentication plus exact config read or
  update permissions protect every operation. Unknown and secret keys share the same `404` result.
- **Injection risks**: keys come only from the code allowlist and SQL values remain parameterized.
  No value enters shell, template, path, CSS, URL, or executable contexts.
- **Encryption needs**: the catalog contains no secret requiring new encryption. TLS protects Admin
  transport; existing environment/secret-manager protection remains authoritative for root secrets.
- **Rate limiting**: Admin endpoint rate limits remain. Configured authentication limits cannot be
  set below the explicit safe minima.
- **Infrastructure**: PostgreSQL and the current process-local cache are reused. No network service,
  port, container, Redis channel, worker, or restart controller is added.

---

## Acceptance Criteria

1. [ ] A reset and initialized database contains exactly the 18 public catalog keys with the native
       JSONB types, defaults, groups, ranges, and application modes listed in this RD; obsolete rows
       are absent and `super_admin_user_id` remains internal.
2. [ ] List/get responses return only the 18 catalog entries with code-defined metadata. Requests
       for an unknown, obsolete, internal, environment-owned, or secret key all return the same fixed
       `404` without revealing whether a database row exists.
3. [ ] Each integer setting accepts both inclusive boundaries and rejects values below/above them,
       fractions, numeric strings, booleans, null, arrays, objects, `NaN`, infinity, and extra fields
       with `400 config_value_invalid` and no mutation.
4. [ ] `default_locale` accepts `en` and every other installed complete locale, rejects a locale with
       no complete bundle, and becomes the runtime fallback after at most the approved cache bound.
5. [ ] A valid single runtime update commits one native JSONB value, clears the local cache, affects
       the next local policy read, reports `restartRequired: false`, and writes one content-free audit
       event.
6. [ ] A valid batch containing a runtime key and `access_token_ttl` updates all rows in one
       transaction, reports `restartRequired: true`, affects the runtime key locally, and leaves the
       running provider's access-token TTL unchanged until restart.
7. [ ] A forced failure on the last row of a batch leaves every earlier value unchanged, writes no
       audit event, does not clear the cache, and returns a fixed safe failure without raw SQL or
       values.
8. [ ] A second healthy Porta process observes a committed runtime update no later than 60 seconds
       after its prior cached read, without Redis messaging, polling, or a process restart.
9. [ ] New magic links, password resets, and invitations use their configured TTLs; login, magic-
       link, and password-reset rate limits use their configured maxima/windows; lockout and audit
       cleanup use their configured values; already-issued artifacts are not retroactively changed.
10. [ ] A missing or invalid catalog row uses its exact code default and emits only the fixed event
        and public key. A database read failure emits no raw error, connection detail, or stored
        value.
11. [ ] The Admin UI shows four groups with complete labels, units, range help, one-row DSL gaps, and
        bounded input widths; Save is disabled when clean or invalid and one batch save displays the
        correct restart notice.
12. [ ] SDK, CLI, and Admin UI cannot submit an arbitrary key; CLI help shows the exact catalog and
        range; all server-side validation still rejects a forged invalid request independently.
13. [ ] The two documentation tables exactly match the 18-key catalog and external-secret boundary,
        including the immediate-local/60-second-other-instance runtime behavior and all-instance
        restart rule.
14. [ ] The authoritative server, SDK, CLI, structure, Admin UI, and applicable production-security
        verification commands pass with no secret, internal row, raw error, or invalid value exposed
        in responses, logs, or audit metadata.
