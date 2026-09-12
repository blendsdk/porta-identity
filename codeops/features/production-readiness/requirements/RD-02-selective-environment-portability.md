# RD-02: Selective Environment Portability

> **Document**: RD-02-selective-environment-portability.md
> **Status**: Approved
> **Created**: 2026-09-12
> **Project**: Porta Production Readiness
> **Depends On**: RD-01
> **CodeOps Artifact Schema**: 1

---

## Feature Overview

Porta administrators need a direct way to move selected organizations, global applications,
authorization definitions, users, and optional OIDC clients between Porta installations. The
portable artifact is one human-readable JSON manifest whose relationships use stable public slugs
and identifiers rather than installation-specific database UUIDs. This is configuration and
identity portability, not database backup or disaster recovery. (AR-6–AR-12)

Export and import reuse the existing Admin API, SDK, CLI, PostgreSQL transaction, audit, file-dialog,
and Layout DSL patterns. Imports are previewed before they are applied. They either keep or update
existing records, create missing records, and never delete records merely because they are absent
from the manifest. The feature adds no ZIP format, directory format, streaming system, background
job, placeholder engine, or compatibility parser. (AR-15–AR-17)

---

## Functional Requirements

### Must Have

- [ ] **AC-01 — One strict manifest (M):** export shall produce one UTF-8 JSON object with
      `version: "1.0"`, an RFC 3339 `exported_at` timestamp, an explicit `scope`, an explicit
      `categories` array, and arrays for the selected records and relationships. Import shall accept
      exactly version `1.0`, reject unknown root or record fields, and reject unsupported versions
      with `400` and `code: "import_manifest_invalid"`.
- [ ] **AC-02 — Export scope (M):** an administrator shall choose exactly one scope: one organization
      identified by slug, or the complete environment containing every organization. Organization-
      owned users, assignments, claim values, and clients shall be limited to that scope. Global
      applications and their authorization definitions shall appear once and shall not contain an
      `organization_slug` ownership field.
- [ ] **AC-03 — Explicit selection (M):** export shall require at least one category. The closed
      category set is `organizations`, `applications_authorization`, `users_assignments`, and
      `oidc_clients`. OIDC clients shall be unchecked by default. Application-related categories
      shall require explicit application slugs or an explicit `all_applications` selection; clients
      shall never cause an application to be selected implicitly.
- [ ] **AC-04 — Organization records (M):** the `organizations` category shall include portable
      name, slug, active/suspended status, default locale, default login methods, two-factor policy,
      branding fields, and optional logo/favicon asset content with its validated media type and
      filename. It shall exclude database UUIDs, timestamps, audit data, sessions, and the mutable
      `is_super_admin` designation.
- [ ] **AC-05 — Control-plane organization (S):** a full-environment manifest may identify the
      source control-plane organization by slug for dependency validation. Import shall reuse the
      destination control-plane organization only when that slug matches. It shall never create,
      transfer, or update `is_super_admin`; a mismatched control-plane slug rejects the import before
      mutation.
- [ ] **AC-06 — Application and authorization graph (M):** for each selected global application,
      the manifest shall include its portable fields and status; modules and status; roles;
      permissions with an optional `module_slug`; custom-claim definitions including
      `include_in_id_token`, `include_in_access_token`, and `include_in_userinfo`; and
      role-permission mappings. Application slug plus child slug/name shall replace every database
      foreign key.
- [ ] **AC-07 — Users and relationships (M):** the `users_assignments` category shall include each
      scoped user's email, portable profile fields, active/inactive status, email-verification state,
      locale, user-role assignments, and custom-claim values. A user is identified by organization
      slug plus normalized email. A source user in automatic `locked` state shall export as active
      because lockout state is excluded. Assignments and claim values shall reference organization,
      application, role, and claim slugs.
- [ ] **AC-08 — Authentication material excluded (M):** the manifest shall never contain password
      hashes, password history, TOTP enrollment or replay state, encrypted TOTP secrets, email OTPs,
      recovery codes, invitations, login/recovery tokens, sessions, grants, failed-login counters,
      lockout state, signing keys, cookie/encryption keys, client-secret hashes, or plaintext client
      secrets. Export and import logs and audit metadata shall not contain manifest content.
- [ ] **AC-09 — Optional OIDC clients (M):** when explicitly selected, clients shall include their
      public `client_id`, organization slug, application slug, name, type, application type, status,
      grant types, response types, scope, login-method override, token-endpoint authentication
      method, redirect URIs, post-logout redirect URIs, allowed origins, and PKCE requirement. URI
      values shall be copied exactly as shown in preview; no placeholder or environment-substitution
      syntax is supported.
- [ ] **AC-10 — Natural-key identity (M):** organizations match by slug; applications by global
      slug; modules, roles, permissions, and claim definitions by application slug plus their public
      slug/name; users by organization slug plus normalized email; and clients by public
      `client_id`. An existing Client ID belonging to a different organization or application shall
      reject the complete import with `409` and `code: "import_plan_rejected"`.
- [ ] **AC-11 — Mandatory preview (M):** import shall first run in `dry-run` mode and return ordered
      `created`, `updated`, `skipped`, and `rejected` summaries without changing any product table,
      issuing a client secret, or exposing private dependency diagnostics. The Admin UI Apply action
      shall remain disabled until the current file and selected mode have a successful preview.
      Changing either invalidates that preview.
- [ ] **AC-12 — Keep existing (M):** `keep-existing` shall be the default apply mode. It shall reuse
      compatible destination records, leave their portable fields unchanged, create missing records,
      add missing selected relationship rows, and report each reused record as skipped. It shall not
      delete or replace any existing value or relationship.
- [ ] **AC-13 — Update existing (M):** `update-existing` shall update the portable fields of matched
      compatible records and create missing records. Relationship collections are additive: listed
      role-permission, user-role, and user-claim relationships are added or updated as applicable,
      while destination relationships absent from the manifest remain unchanged. Immutable identity,
      control-plane state, credentials, and destination-only records remain unchanged.
- [ ] **AC-14 — Dependency validation (M):** preview and apply shall process dependencies in this
      order: organizations, applications, modules, roles, permissions, claim definitions,
      role-permission mappings, users, user-role assignments, user claim values, and OIDC clients.
      A referenced parent may be created by the manifest or reused from the destination. A missing,
      ambiguous, cross-parent, or incompatible dependency rejects the complete operation rather than
      partially applying it.
- [ ] **AC-15 — Atomic apply (L):** each non-dry-run import shall validate the complete manifest and
      apply every database mutation plus its audit event in one PostgreSQL transaction. Any schema,
      dependency, uniqueness, authorization, validation, secret-generation, or database failure
      shall roll back all created and updated rows and return one safe failure response. Import shall
      never delete a destination record absent from the manifest.
- [ ] **AC-16 — New client credentials (M):** import shall never reuse or accept a source client
      secret. Creating a confidential client shall generate exactly one cryptographically random
      secret using the existing client-secret service, hash it with the existing storage contract,
      label it `Imported`, and set its expiry to six calendar months after generation. The plaintext
      shall appear once in the successful apply result and never in preview, subsequent reads, logs,
      or audit metadata. Existing clients receive no new secret. Public clients receive none.
- [ ] **AC-17 — API and authorization (M):** manifest export shall use an authenticated Admin API
      operation protected by `admin:export:read` plus the existing read permission for every selected
      category. Import shall retain `admin:import:write` plus the existing write permissions for
      affected categories. Selected-organization operations require existing organization
      membership; complete-environment operations require the exact `porta-super-admin` role.
      Unauthorized and cross-organization requests shall reveal no record existence.
- [ ] **AC-18 — SDK and CLI (M):** the SDK shall expose typed manifest export, preview, and apply
      operations. The conventional CLI shall expose the same scope, category, application-selection,
      and keep/update choices, require preview before apply, read or write one JSON path, and show
      generated secrets once. SDK and CLI code shall call the Admin API and shall not implement an
      independent import engine.
- [ ] **AC-19 — Admin UI workspace (M):** the embedded Admin UI shall add a focused Import/Export
      workspace using existing full-page surfaces, JSVision file dialogs, and Layout DSL. Export
      shall show scope, category, and application controls followed by a save action. Import shall
      show the selected filename, keep/update choice, Preview, ordered summary, and Apply. OIDC
      clients remain visibly optional and unchecked. Buttons use DSL measurement rather than fixed
      48×12 assumptions.
- [ ] **AC-20 — Results and one-time secrets (S):** successful export shall report the manifest
      filename and record counts. Preview and apply shall show created, updated, skipped, and rejected
      counts grouped by entity type. A committed import containing generated client secrets shall
      open the existing selectable, copyable, read-only one-time-secret presentation before the
      result can be dismissed.
- [ ] **AC-21 — Content-free audit (S):** export and import shall use the existing `admin.export` and
      `admin.import` audit boundaries. Metadata may contain manifest version, SHA-256 digest, mode,
      selected category names, and aggregate counts. It shall not contain names, slugs, emails,
      claims, URLs, branding content, client IDs, secrets, manifest fragments, or raw errors.
- [ ] **AC-22 — Correct v1 directly (M):** the current unused v1 import schema shall be corrected in
      place. Applications, modules, roles, permissions, claims, and role-permission mappings shall no
      longer claim organization ownership. Permission-module and claim-inclusion relationships shall
      round-trip. System configuration shall be removed from this portability manifest. No v2,
      fallback parser, alias fields, or compatibility mode shall be added.

### Should Have

- [ ] **AC-23 — Clear validation summary (S):** when preview is rejected, the Admin UI should show
      bounded errors grouped by entity type and safe natural key, with the first invalid dependency
      focused. It should never show database UUIDs, SQL text, stack traces, secret fields, or raw
      server errors.

### Won't Have (Out of Scope)

- PostgreSQL backup/restore, point-in-time recovery, replication, standby orchestration, or disaster
  recovery automation.
- Large-dataset optimization, pagination, streaming JSON, chunking, ZIP/directory manifests,
  numbered files, resumable jobs, background workers, queues, or progress polling.
- Destination cleanup, synchronization, replace-all behavior, implicit deletion, or rollback files.
- Placeholder variables, URL substitution, environment transforms, or interactive per-record merge
  decisions.
- Passwords, authentication tokens, active sessions, cryptographic root keys, signing keys, existing
  client secrets, audit history, or runtime caches.
- PostgreSQL-backed global system configuration; RD-03 owns that catalog.
- Compatibility with a previously exported manifest because version 1.0 has not been adopted.
- Optimistic-concurrency tokens, reload-and-retry workflows, or multi-administrator conflict UX.

---

## Technical Requirements

### Manifest Relationship Contract

| Collection | Natural key | Required parent references | Notable portable fields |
|---|---|---|---|
| `organizations` | `slug` | — | profile, status, locale, login/2FA policy, branding |
| `applications` | `slug` | — | name, description, status |
| `application_modules` | `application_slug + slug` | application | name, description, status |
| `roles` | `application_slug + slug` | application | name, description |
| `permissions` | `application_slug + slug` | application; optional module | name, description, `module_slug` |
| `claim_definitions` | `application_slug + claim_name` | application | type, description, three inclusion flags |
| `role_permission_mappings` | application and role | role and permissions in same application | permission slug array |
| `users` | `organization_slug + normalized email` | organization | profile, status, verification, locale |
| `user_role_assignments` | organization, email, application, role | user and role | relationship only |
| `user_claim_values` | organization, email, application, claim | user and claim | validated JSON value |
| `clients` | `client_id` | organization and application | complete non-secret OIDC configuration |

- `categories` records the operator's explicit selection. An omitted collection is interpreted as
  not selected, never as an instruction to empty that category at the destination.
- Every collection shall reject duplicate natural keys before database work begins.
- Slugs, emails, claim values, URLs, login methods, statuses, and OIDC protocol combinations shall
  use the same established server-side Zod validators as ordinary Admin mutations.
- Branding binary content shall be base64 in JSON and shall pass the existing media-type and decoded
  logo/favicon size limits. Declared size is not trusted; decoded bytes determine the limit.
- Source database UUIDs, timestamps, and `assigned_by` values are not portable.

### Preview and Apply Contract

| Mode | Database effects | Existing portable fields | Missing records | Absent destination records |
|---|---|---|---|---|
| `dry-run` | None | Report planned keep/update | Report planned create | Unchanged |
| `keep-existing` | One transaction | Unchanged | Create | Unchanged |
| `update-existing` | One transaction | Update validated mutable fields | Create | Unchanged |

- Preview shall use the same parser, natural-key resolver, authorization checks, dependency plan,
  and compatibility checks as apply. Apply repeats validation directly; it does not trust UI state
  or a client-provided preview result.
- The Admin UI does not need an ETag, preview token, reservation, or reload-and-retry workflow. It is
  a single-operator application. Ordinary transaction constraints remain authoritative.
- Create and update handlers shall accept a transaction client rather than opening nested
  independent transactions.
- Dry run shall not generate confidential-client secret material. It reports only
  `credential_will_be_generated: true`.
- Generated secrets shall be accumulated only until the successful response. A rollback returns no
  credential result and logs no plaintext.

### API Shape

| Operation | Method and path | Result |
|---|---|---|
| Export manifest | `POST /api/admin/export/manifest` | JSON attachment and aggregate counts in headers |
| Preview import | `POST /api/admin/import` with `mode: "dry-run"` | Ordered safe plan summary |
| Apply, keep | `POST /api/admin/import` with `mode: "keep-existing"` | Committed result and one-time credentials |
| Apply, update | `POST /api/admin/import` with `mode: "update-existing"` | Committed result and one-time credentials |

- Export request fields are the closed scope, organization slug when applicable, category list,
  selected application slugs, and `all_applications` boolean.
- Import request contains only the strict manifest and closed mode. A selected-organization route
  context, when supplied, must match every organization-qualified manifest record.
- Malformed input returns fixed `400`; incompatible dependencies and identity collisions return
  fixed `409`; execution failure returns fixed `503`. Responses use stable codes and a server-created
  correlation ID without exposing destination contents.
- Existing report-style CSV/JSON entity exports may remain, but they are not accepted as portability
  manifests and are not imported by this feature.

### Security and Transaction Boundaries

- Export queries shall select explicit portable columns and prove organization/application scope in
  PostgreSQL. They shall not serialize ORM/repository records wholesale.
- Import shall resolve all natural keys inside its transaction and use parameterized queries.
- Full-environment authority and per-category permissions shall be checked before any export content
  or import plan is returned.
- Confidential-client secret generation and hashing occurs inside the apply transaction. Plaintext
  exists only in process memory until the one successful response.
- Import does not restore sessions or caches. Ordinary destination reads populate caches from the
  committed PostgreSQL state.
- Updating an existing automatically locked user with manifest status `active` shall preserve the
  destination lock and failed-login state. Manifest status `inactive` may deactivate that user.

### Verification Contract

- Immutable specification tests shall be written and observed failing before implementation.
- Round-trip specifications shall cover every manifest collection and relationship, including
  module-scoped permissions and all three claim-inclusion flags.
- Mode specifications shall cover keep, update, create-missing, additive mappings, no deletion,
  missing/incompatible dependencies, complete rollback, strict-version rejection, and duplicate
  natural keys.
- Security specifications shall cover cross-organization access, full-environment role enforcement,
  Client ID collision, hostile JSON values, credential-field rejection, safe errors/audit, and
  absence of secrets from preview and logs.
- UI specifications shall cover empty selections, clients default-off, application selection,
  file-dialog cancellation, malformed files, preview invalidation, disabled Apply, result counts,
  and one-time selectable secrets.
- Verification shall include focused server, SDK, CLI, and Admin UI tests; each affected workspace
  verification; `yarn test:structure`; `yarn test:ui`; applicable security assurance; and final
  `yarn verify`.

---

## Integration Points

### With RD-01 (Production Security Corrections)

- No signing private key, TOTP secret, TOTP replay state, or root encryption key is portable.
- Imported confidential clients use the corrected destination cryptographic boundaries.

### With RD-03 (PostgreSQL-Backed Global Configuration)

- System configuration is deliberately absent from manifest v1.0 and remains a separately governed
  destination concern.
- Bootstrap topology and root secrets remain outside both features.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|---|---|---|---|---|
| Operational boundary | Portability plus backup / portability only | Portability only | PostgreSQL and OS tooling already own backup and standby | AR-6 |
| Selection | Fixed full dump / separate files / selective manifest | Selective manifest | Matches common application/user moves without file-order machinery | AR-7 |
| Artifact | Numbered files / ZIP / one JSON document | One strict JSON document | Smallest portable and reviewable contract | AR-8 |
| Relationships | UUID dump / natural-key graph | Natural-key graph | UUIDs are installation-specific | AR-9 |
| Credentials | Preserve / reset | Exclude and regenerate where required | Avoids transferring authentication secrets | AR-10 |
| Client identity | Always regenerate / preserve / UUID | Preserve collision-free Client ID | Client ID is the public integration identity | AR-11 |
| Conflict behavior | Per-row / partial / atomic modes | Atomic keep or update | Predictable outcome with no partial environment | AR-12 |
| UI surface | Endpoints / focused workspace / framework | Focused existing-pattern workspace | Provides the needed workflow without a generalized operations system | AR-15 |
| Manifest evolution | Parallel v2 / correct unused v1 | Correct v1 | No adopted artifact needs compatibility | AR-16 |
| Client URLs | Substitution / exact copy / permanent exclusion | Explicit exact copy | Preview makes environment-specific values visible without a template language | AR-17 |

---

## Security Considerations

- **Data sensitivity**: manifests contain personal profile data, emails, role assignments, claims,
  branding, and public client configuration. Operators must protect files as sensitive exports even
  though authentication credentials are excluded.
- **Input validation**: the server uses strict Zod schemas, existing domain validators, decoded asset
  limits, duplicate detection, and closed discriminators before mutation.
- **Authentication & authorization**: export and import require bearer authentication, operation
  permissions, category permissions, organization membership, and super-admin authority for full
  environment scope.
- **Injection risks**: all SQL remains parameterized; JSON is parsed as data; filenames are
  server-created or selected through file dialogs; no manifest value becomes shell input or an
  executable template.
- **Encryption needs**: HTTPS protects transport. Porta does not add manifest encryption; the
  administrator owns secure file storage. Server-side secrets remain encrypted or hashed and are
  never exported.
- **Rate limiting**: existing Admin API rate limits apply. No public or unauthenticated endpoint is
  introduced.
- **Infrastructure**: the operation uses current PostgreSQL and process memory only. No object store,
  message broker, worker, shared directory, or new network exposure is added.

---

## Acceptance Criteria

1. [ ] Exporting one organization with only `applications_authorization` selected produces one
       version `1.0` JSON file containing only explicitly selected applications and their complete
       module, role, permission, mapping, and claim graph, with no organization ownership on global
       definitions and no UUIDs.
2. [ ] Exporting `users_assignments` for one organization includes only that organization's users,
       assignments, and claim values, preserving active/inactive and email-verification values while
       containing none of the authentication material listed in AC-08.
3. [ ] The OIDC-client category begins unchecked. When selected, its preview shows exact URLs and
       the exported records preserve collision-free Client IDs but contain no secret or secret hash.
4. [ ] Importing a manifest with an unsupported version, unknown field, duplicate natural key,
       malformed value, missing parent, cross-application mapping, mismatched control-plane slug, or
       conflicting Client ID changes zero product rows and returns the specified fixed `400` or
       `409` response.
5. [ ] A successful dry run changes zero product rows, generates zero secrets, and reports the same
       create/update/skip plan that apply produces against unchanged destination state.
6. [ ] Applying `keep-existing` leaves all matched portable fields unchanged, creates every missing
       record, adds listed missing relationships, and leaves every unlisted destination record and
       relationship unchanged.
7. [ ] Applying `update-existing` updates every listed mutable field and claim value, creates missing
       records, and leaves immutable identity, credentials, control-plane state, unlisted records,
       and unlisted relationships unchanged.
8. [ ] A forced failure on the final planned mutation rolls back all prior entity, relationship,
       generated-secret, and audit writes and returns no plaintext credential.
9. [ ] Creating a confidential client preserves its manifest Client ID and returns exactly one
       selectable plaintext secret labeled `Imported`, expiring six calendar months after generation;
       repeating the import against that existing client returns no new secret.
10. [ ] A user lacking the category permission, organization membership, or exact super-admin role
        receives the existing safe `401`/`403` behavior before any manifest content, destination
        existence, preview details, or mutation is disclosed.
11. [ ] The Admin UI prevents export with no category, requires explicit application selection,
        invalidates preview after file/mode changes, disables Apply until preview succeeds, and uses
        one open/save file interaction without fixed 48×12 layout assumptions.
12. [ ] Audit rows contain only the approved version, digest, mode, category names, and aggregate
        counts; responses, logs, audits, and subsequent client reads contain no imported plaintext
        secret after the one successful apply response.
13. [ ] An export from a fully populated fixture followed by import into a reset installation
        reproduces all selected portable fields and relationships exactly while producing new
        database UUIDs and no source credentials, sessions, audit history, or global configuration.
14. [ ] Server, SDK, CLI, Admin UI, structure, browser, relevant security assurance, and final
        workspace verification commands pass with immutable specification coverage for all preceding
        criteria.
