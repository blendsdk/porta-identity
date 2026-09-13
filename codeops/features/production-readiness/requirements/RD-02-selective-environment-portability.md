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
      `version: "1.0"`, an RFC 3339 `exported_at` timestamp, the exact root fields and collection
      fields in the Manifest Schema Contract, and no unknown fields. Every collection field is
      present; collections outside the selected categories are empty arrays. Import shall accept
      exactly version `1.0`, reject unknown root or record fields, and reject unsupported versions
      with `400` and `code: "import_manifest_invalid"`.
- [ ] **AC-02 — Export scope (M):** an administrator shall choose exactly one scope: one organization
      identified by slug, or the complete environment containing every non-control-plane
      organization. Organization-owned users, assignments, claim values, and clients shall be
      limited to that scope. Global
      applications and their authorization definitions shall appear once and shall not contain an
      `organization_slug` ownership field.
- [ ] **AC-03 — Explicit selection (M):** export shall require at least one unique category. The closed
      category set is `organizations`, `applications_authorization`, `users_assignments`, and
      `oidc_clients`. OIDC clients shall be unchecked by default. Application-related categories
      shall use the exact Category and Application Filter Contract. Clients shall never cause an
      application to be selected implicitly.
- [ ] **AC-04 — Organization records (M):** the `organizations` category shall include portable
      name, slug, active/suspended status, default locale, default login methods, two-factor policy,
      branding fields, and optional logo/favicon asset content with its validated media type. It
      shall exclude original filenames, database UUIDs, timestamps, audit data, sessions, and the mutable
      `is_super_admin` designation.
- [ ] **AC-05 — Control-plane organization (S):** a destination shall first be initialized with
      `porta init`. Export and import shall exclude the
      source and destination control-plane organization, the canonical `porta-admin` application and
      its modules, roles, permissions, claims, and mappings, control-plane Admin users, and their
      Admin-role assignments. Import shall never create, transfer, update, or compare
      `is_super_admin`, and shall leave the destination control-plane graph untouched. A request
      selecting the destination control-plane organization or including any excluded control-plane
      record rejects before content or mutation: export uses `409 export_scope_rejected`, and import
      uses `409 import_plan_rejected`.
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
- [ ] **AC-11 — Mandatory preview (M):** the first-party Admin UI and CLI workflows shall first run
      import in `dry-run` mode and receive ordered `created`, `updated`, `skipped`, and `rejected`
      summaries without changing any product table, issuing a client secret, or exposing private
      dependency diagnostics. The Admin UI Apply action shall remain disabled until the current file
      and selected mode have a successful preview. Changing either invalidates that preview. The
      conventional CLI shall always preview before confirmation and apply. Direct SDK and Admin API
      apply calls may omit a prior preview because apply repeats complete validation and does not
      trust client state; no preview token or server-side preview state shall be added.
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
      label it `Imported`, and set its expiry by adding six months in UTC, preserving the UTC time,
      and clamping the day to the destination month's final day. The plaintext
      shall appear once in the successful apply result and never in preview, subsequent reads, logs,
      or audit metadata. Existing clients receive no new secret. Public clients receive none.
- [ ] **AC-17 — API and authorization (M):** manifest export shall use an authenticated Admin API
      operation protected by `admin:export:read` plus every permission required by the exact
      Portability Permission Matrix. Import shall retain `admin:import:write` plus that matrix's
      affected-category permissions. Selected-organization operations use the existing
      control-plane Admin identity and exact requested/database scope; they do not require or add a
      managed-organization membership model. Complete-environment operations require the exact
      `porta-super-admin` role. Unauthorized and cross-organization requests shall reveal no record
      existence.
- [ ] **AC-18 — SDK and CLI (M):** the SDK shall expose typed manifest export, preview, and apply
      operations. The conventional CLI shall replace the unused legacy `provision` command with
      `porta export manifest` and `porta import manifest` as defined in the SDK and CLI Contract.
      It shall expose the same scope, category, application-selection, and keep/update choices,
      require preview before confirmation and apply, read or write one JSON path, and show generated
      secrets once. SDK and CLI code shall call the Admin API and shall not implement an independent
      import engine or compatibility parser.
- [ ] **AC-19 — Admin UI workspace (M):** the embedded Admin UI shall add a focused Import/Export
      workspace using existing full-page surfaces, JSVision file dialogs, and Layout DSL. Export
      shall show scope, category, and application controls followed by a save action. Import shall
      show the selected filename, keep/update choice, Preview, ordered summary, and Apply. OIDC
      clients remain visibly optional and unchecked. Buttons use DSL measurement rather than fixed
      48×12 assumptions. The workspace opens when either operation is authorized, selects the first
      authorized tab with Export preferred when both are available, and shows a fixed
      permission-required state with no file or SDK action on an unauthorized tab.
- [ ] **AC-20 — Results and one-time secrets (S):** successful export shall report the manifest
      filename through `Content-Disposition`; callers shall derive record counts from the manifest
      arrays. Preview and apply shall return the exact Result Contract with created, updated, skipped,
      and rejected counts grouped by entity type. A committed import containing generated client secrets shall
      open the existing selectable, copyable, read-only one-time-secret presentation before the
      result can be dismissed.
- [ ] **AC-21 — Content-free audit (S):** export and import shall use the existing `admin.export` and
      `admin.import` audit boundaries. Metadata may contain manifest version, SHA-256 digest, mode,
      selected category names, and aggregate counts. It shall not contain names, slugs, emails,
      claims, URLs, branding content, client IDs, secrets, manifest fragments, or raw errors.
      Selected-scope events belong to the selected organization; full-scope events belong to the
      destination control-plane organization.
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

### Manifest Schema Contract

All object schemas are strict. A field marked `?` is optional; a field containing `null` accepts an
explicit JSON null. All other fields are required. Strings use the same trimming, normalization,
length, and value validation as the corresponding ordinary Admin mutation.

| Root field              | Exact JSON type and rule                                                                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`               | literal string `"1.0"`                                                                                                                                                                                                                    |
| `exported_at`           | RFC 3339 UTC timestamp string                                                                                                                                                                                                             |
| `scope`                 | `{ "kind": "organization", "organization_slug": string }` or `{ "kind": "environment" }`                                                                                                                                                  |
| `categories`            | non-empty unique array of the four closed category strings                                                                                                                                                                                |
| `application_selection` | `{ "all_applications": boolean, "application_slugs": string[] }`; exactly one of `all_applications: true` or a non-empty unique slug array is allowed when an application-related category is selected; otherwise it is `false` plus `[]` |
| Collection fields       | all eleven collection arrays named below; a collection outside the selected categories must be empty                                                                                                                                      |

| Collection                 | Required record fields and JSON types                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Natural key                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `organizations`            | `slug: string`, `name: string`, `status: "active" \| "suspended"`, `default_locale: string`, `default_login_methods: ("password" \| "magic_link")[]`, `two_factor_policy: "optional" \| "required_email" \| "required_totp" \| "required_any"`, `branding: Branding`                                                                                                                                                                                                                                                                                                    | `slug`                                                                             |
| `applications`             | `slug: string`, `name: string`, `description: string \| null`, `status: "active" \| "inactive"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `slug`                                                                             |
| `application_modules`      | `application_slug: string`, `slug: string`, `name: string`, `description: string \| null`, `status: "active" \| "inactive"`                                                                                                                                                                                                                                                                                                                                                                                                                                             | `application_slug + slug`                                                          |
| `roles`                    | `application_slug: string`, `slug: string`, `name: string`, `description: string \| null`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `application_slug + slug`                                                          |
| `permissions`              | `application_slug: string`, `slug: string`, `module_slug: string \| null`, `name: string`, `description: string \| null`                                                                                                                                                                                                                                                                                                                                                                                                                                                | `application_slug + slug`                                                          |
| `claim_definitions`        | `application_slug: string`, `claim_name: string`, `claim_type: "string" \| "number" \| "boolean" \| "json"`, `description: string \| null`, `include_in_id_token: boolean`, `include_in_access_token: boolean`, `include_in_userinfo: boolean`                                                                                                                                                                                                                                                                                                                          | `application_slug + claim_name`                                                    |
| `role_permission_mappings` | `application_slug: string`, `role_slug: string`, `permission_slugs: string[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `application_slug + role_slug`; permission slugs are non-empty, unique, and sorted |
| `users`                    | `organization_slug: string`, `email: string`, `email_verified: boolean`, all fields in Portable User Profile, `status: "active" \| "inactive"`                                                                                                                                                                                                                                                                                                                                                                                                                          | `organization_slug + normalized email`                                             |
| `user_role_assignments`    | `organization_slug: string`, `email: string`, `application_slug: string`, `role_slug: string`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | all four fields after email normalization                                          |
| `user_claim_values`        | `organization_slug: string`, `email: string`, `application_slug: string`, `claim_name: string`, `value: JSON value`                                                                                                                                                                                                                                                                                                                                                                                                                                                     | first four fields after email normalization                                        |
| `clients`                  | `client_id: string`, `organization_slug: string`, `application_slug: string`, `name: string`, `client_type: "public" \| "confidential"`, `application_type: "web" \| "native" \| "spa"`, `status: "active" \| "inactive"`, `grant_types: string[]`, `response_types: string[]`, `scope: string`, `login_methods: ("password" \| "magic_link")[] \| null`, `token_endpoint_auth_method: "client_secret_basic" \| "client_secret_post" \| "none"`, `redirect_uris: string[]`, `post_logout_redirect_uris: string[]`, `allowed_origins: string[]`, `require_pkce: boolean` | `client_id`                                                                        |

`Branding` contains `logo_url`, `favicon_url`, `primary_color`, `company_name`, and `custom_css`, each
as `string | null`, plus `logo_asset` and `favicon_asset`, each as
`{ "media_type": string, "content_base64": string } | null`. Original filenames are not portable.
Asset media types and decoded bytes use the ordinary branding allowlist and existing 2 MiB logo and
512 KiB favicon limits.

`Portable User Profile` contains these nullable strings: `given_name`, `family_name`, `middle_name`,
`nickname`, `preferred_username`, `profile_url`, `picture_url`, `website_url`, `gender`, `birthdate`,
`zoneinfo`, `locale`, `phone_number`, `address_street`, `address_locality`, `address_region`,
`address_postal_code`, and `address_country`. It also contains required boolean
`phone_number_verified`. Password state, password timestamps, 2FA state, lock state, login counters,
and record timestamps are not profile fields and are excluded.

### Category and Application Filter Contract

| Category                     | Populated collections                                                                                          | Application selection effect                                                                                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `organizations`              | `organizations`                                                                                                | None. Selected scope determines the organization records.                                                                                                                                              |
| `applications_authorization` | `applications`, `application_modules`, `roles`, `permissions`, `claim_definitions`, `role_permission_mappings` | Include only `application_selection`; include each selected application's complete authorization graph.                                                                                                |
| `users_assignments`          | `users`, `user_role_assignments`, `user_claim_values`                                                          | Include all users in the selected organization scope. Filter their role assignments and claim values to `application_selection`; do not omit the user merely because no selected relationship remains. |
| `oidc_clients`               | `clients`                                                                                                      | Include only clients whose application is in `application_selection`. A client never selects or exports its application implicitly.                                                                    |

For environment scope, the source control-plane organization and its Admin identities are excluded
from `organizations` and `users`. The canonical `porta-admin` application and its complete graph are
excluded from every application-filtered collection even when `all_applications` is true.

### Matching and Compatibility Contract

Every value is first validated and normalized by its ordinary domain validator. Duplicate detection
and natural-key matching then use those normalized values. Permission slugs retain arbitrary
application-defined content after the ordinary leading/trailing whitespace trim. Unknown fields,
duplicate normalized keys, and ambiguous parents reject the complete manifest before mutation.

| Record           | Immutable compatibility fields                                                                    | Fields updated by `update-existing`                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Organization     | normalized `slug`                                                                                 | name, status, locale, login methods, 2FA policy, branding fields/assets                                                           |
| Application      | normalized `slug`                                                                                 | name, description, status                                                                                                         |
| Module           | application slug + normalized module slug                                                         | name, description, status                                                                                                         |
| Role             | application slug + normalized role slug                                                           | name, description                                                                                                                 |
| Permission       | application slug + trimmed permission slug; resolved `module_slug` must match                     | name, description                                                                                                                 |
| Claim definition | application slug + `claim_name`; `claim_type` must match                                          | description and three inclusion flags                                                                                             |
| User             | organization slug + normalized email                                                              | email verification, portable profile, active/inactive status; destination automatic lock and failed-login fields remain unchanged |
| Client           | `client_id`; resolved organization, application, `client_type`, and `application_type` must match | name, status, grants, responses, scope, login methods, token auth method, URIs, origins, and PKCE                                 |
| Relationship     | complete natural key                                                                              | add a missing mapping/assignment; update a listed claim value; never remove an unlisted relationship                              |

An immutable-field mismatch returns `409 import_plan_rejected`; it is never treated as a second
record or silently changed. `keep-existing` validates the same compatibility fields but changes no
matched portable field or claim value. Source database UUIDs, timestamps, and `assigned_by` values
are never portable.

### Preview and Apply Contract

| Mode              | Database effects | Existing portable fields        | Missing records       | Absent destination records |
| ----------------- | ---------------- | ------------------------------- | --------------------- | -------------------------- |
| `dry-run`         | None             | Report planned keep/update      | Report planned create | Unchanged                  |
| `keep-existing`   | One transaction  | Unchanged                       | Create                | Unchanged                  |
| `update-existing` | One transaction  | Update validated mutable fields | Create                | Unchanged                  |

- Preview shall use the same parser, natural-key resolver, authorization checks, dependency plan,
  and compatibility checks as apply. Apply repeats validation directly; it does not trust UI state
  or a client-provided preview result.
- The Admin UI does not need an ETag, preview token, reservation, or reload-and-retry workflow. It is
  a single-operator application. Ordinary transaction constraints remain authoritative.
- Apply shall use the existing `runDatabaseTransaction()` boundary. Repository and service calls
  obtain its request-owned client through the existing database context rather than accepting a
  newly threaded import-only client or opening nested transactions.
- Dry run shall not generate confidential-client secret material. It reports only
  `credential_will_be_generated: true`.
- Generated secrets shall be accumulated only until the successful response. A rollback returns no
  credential result and logs no plaintext.

### Result Contract

Preview and apply return one strict typed body:

- `mode`: `dry-run`, `keep-existing`, or `update-existing`;
- `summary`: an object whose keys follow the dependency-order entity names and whose values contain
  integer `created`, `updated`, `skipped`, and `rejected` counts;
- `items`: an ordered array of `{ entity_type, action, natural_key,
credential_will_be_generated? }`, where `action` is one of the four summary actions and
  `natural_key` is an object containing only that entity's public natural-key fields;
- `errors`: a bounded array of `{ entity_type, natural_key, code }`; `code` is one of
  `invalid_record`, `duplicate_natural_key`, `missing_dependency`, `ambiguous_dependency`,
  `incompatible_record`, `cross_scope_reference`, `control_plane_record`, or
  `client_id_collision`; and
- `credentials`: absent in preview and present only after a committed apply as an array of
  `{ client_id, label, secret, expires_at }`.

Entity groups and items use the dependency order in AC-14; items within a group sort by their
normalized natural key. Rejected preview responses contain at most 100 item errors plus complete
aggregate counts. They never include database UUIDs or internal dependency diagnostics.

Summary counts and items count manifest records, not the individual edges inside a relationship
record. A `role_permission_mappings` item is `skipped` when all listed permission edges already
exist, `created` when none existed and at least one is added, and `updated` when existing and newly
added listed edges are mixed. An empty `permission_slugs` list is `invalid_record` and rejects the
complete plan.

### API Shape

| Operation       | Method and path                                         | Result                                             |
| --------------- | ------------------------------------------------------- | -------------------------------------------------- |
| Export manifest | `POST /api/admin/export/manifest`                       | JSON attachment; filename in `Content-Disposition` |
| Preview import  | `POST /api/admin/import` with `mode: "dry-run"`         | Ordered safe plan summary                          |
| Apply, keep     | `POST /api/admin/import` with `mode: "keep-existing"`   | Committed result and one-time credentials          |
| Apply, update   | `POST /api/admin/import` with `mode: "update-existing"` | Committed result and one-time credentials          |

- Export request fields are the closed scope, organization slug when applicable, category list,
  selected application slugs, and `all_applications` boolean.
- Import request contains only the strict manifest and closed mode. A selected-organization route
  context, when supplied, must match every organization-qualified manifest record.
- After the existing safe 401/403 authentication and authorization boundary, portability failures
  use exactly this public contract:

  | Condition                        | Status | Exact body                                                                                         |
  | -------------------------------- | -----: | -------------------------------------------------------------------------------------------------- |
  | Invalid export request           |    400 | `{ "error": "Invalid export request", "code": "export_request_invalid" }`                          |
  | Invalid import manifest          |    400 | `{ "error": "Invalid import manifest", "code": "import_manifest_invalid" }`                        |
  | Import body exceeds 64 MiB       |    413 | `{ "error": "Import manifest is too large", "code": "import_manifest_too_large" }`                 |
  | Serialized export exceeds 64 MiB |    413 | `{ "error": "Export manifest is too large", "code": "export_manifest_too_large" }`                 |
  | Export scope is rejected         |    409 | `{ "error": "Export scope rejected", "code": "export_scope_rejected" }`                            |
  | Import plan is rejected          |    409 | `{ "error": "Import plan rejected", "code": "import_plan_rejected", "result": PortabilityResult }` |
  | Export execution fails           |    503 | `{ "error": "Export failed", "code": "export_failed", "request_id": string }`                      |
  | Import execution fails           |    503 | `{ "error": "Import failed", "code": "import_execution_failed", "request_id": string }`            |

  `request_id` is the same server-created value returned in `X-Request-Id`; it is not a second
  correlation mechanism. Every unexpected 503 writes exactly one content-free server log containing
  `operation`, `code`, and `request_id`, plus `mode` for import. The log and public response contain
  no manifest values, natural keys, credentials, stack traces, or dependency diagnostics. CLI and
  Admin UI failures show the safe request ID when the 503 body supplies it; verbose output remains
  safe because every portability error body is fixed, bounded, and content-free.

- Existing report-style CSV/JSON entity exports may remain, but they are not accepted as portability
  manifests and are not imported by this feature.
- Every export, preview, and apply response, including an error response, shall include
  `Cache-Control: no-store`.
- Import uses one authenticated route-specific JSON parser with a 64 MiB UTF-8 request-body limit.
  The parser runs only after Admin authentication and `admin:import:write` authorization and returns the fixed safe `413` code
  `import_manifest_too_large`. Export rejects a serialized manifest larger than 64 MiB with the
  matching safe `413` code `export_manifest_too_large`. The standard-parser exclusion covers every
  import path spelling accepted by the router, including its trailing-slash and case variants. The
  ordinary 100 KiB parser is unchanged.

### Portability Permission Matrix

The operation permission and every permission in each selected category row are required. One
portability-specific authorization helper computes this closed union before content or plan data is
returned.

| Category                     | Export permissions                                                               | Import permissions                                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every request                | `admin:export:read`                                                              | `admin:import:write`                                                                                                                                                               |
| `organizations`              | `admin:org:read`                                                                 | `admin:org:create`, `admin:org:update`, `admin:org:suspend`                                                                                                                        |
| `applications_authorization` | `admin:app:read`, `admin:role:read`, `admin:permission:read`, `admin:claim:read` | `admin:app:create`, `admin:app:update`, `admin:role:create`, `admin:role:update`, `admin:permission:create`, `admin:permission:update`, `admin:claim:create`, `admin:claim:update` |
| `users_assignments`          | `admin:user:read`, `admin:role:read`, `admin:claim:read`                         | `admin:user:create`, `admin:user:update`, `admin:user:lifecycle`, `admin:role:assign`, `admin:claim:update`                                                                        |
| `oidc_clients`               | `admin:client:read`, `admin:app:read`                                            | `admin:client:create`, `admin:client:update`                                                                                                                                       |

Complete-environment scope additionally requires the exact `porta-super-admin` role. Selected scope
does not add a managed-organization membership check; authorization and every PostgreSQL query use
the requested organization slug as the exact data boundary.

### SDK and CLI Contract

- SDK exposes `exports.manifest(request)`, `imports.preview(manifest)`, and
  `imports.apply(manifest, mode)` with the exact manifest and result types above.
- `porta export manifest --output <path>` accepts one scope, one or more categories, and the closed
  all/selected-application choice. It writes exactly one JSON file.
- `porta import manifest <path> --mode <keep-existing|update-existing>` always previews, prints the
  ordered summary, and requests confirmation before apply. `--yes` skips only the interactive
  confirmation; it never skips preview. Generated secrets are printed once after success.
- The unused legacy CLI `provision` command and its old SDK import types are removed rather than
  wrapped. No legacy YAML/JSON transformation, alias, fallback parser, or compatibility mode remains.

### Security and Transaction Boundaries

- Export queries shall select explicit portable columns and prove organization/application scope in
  PostgreSQL. All selected graph queries and the content-free audit write run inside one
  `REPEATABLE READ` transaction. They shall not serialize ORM/repository records wholesale.
- Import shall resolve all natural keys inside its transaction and use parameterized queries.
- Full-environment authority and per-category permissions shall be checked before any export content
  or import plan is returned.
- Confidential-client secret generation and hashing occurs inside the apply transaction. Plaintext
  exists only in process memory until the one successful response.
- Import does not restore sessions or caches. After commit it uses the existing
  `afterDatabaseCommit()` mechanism to invalidate only caches for records it created or changed.
  When an update deactivates a user or removes effective authority, the same post-commit boundary
  invokes the existing targeted session, token, grant, and authority cleanup for affected users
  only. It adds no worker, automatic retry, broad logout, advisory lock, or Redis work inside the
  PostgreSQL transaction.
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
  control-plane exclusion, Client ID collision, hostile JSON values, credential-field rejection,
  authenticated payload limits, no-store responses, targeted authority revocation, safe
  errors/audit, and absence of secrets from preview and logs.
- UI specifications shall cover empty selections, clients default-off, application selection,
  file-dialog cancellation, malformed files, preview invalidation, disabled Apply, result counts,
  and one-time selectable secrets.
- Verification shall include focused server, SDK, CLI, and terminal Admin UI tests; each affected
  workspace verification; `yarn test:structure`; applicable security assurance; and final
  `yarn verify`. Run the separate browser `yarn test:ui` only if implementation changes a
  browser-facing OIDC behavior.
- The immutable administrative-data specification is replaced only where it asserts the unused old
  v1 schema, modes, client key, SDK types, or CLI `provision` surface. Its still-valid strict-input,
  authorization, atomicity, audit, secret-exclusion, and safe-error assertions remain immutable.

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

| Decision             | Options Considered                                    | Chosen                                | Rationale                                                                     | AR Ref |
| -------------------- | ----------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| Operational boundary | Portability plus backup / portability only            | Portability only                      | PostgreSQL and OS tooling already own backup and standby                      | AR-6   |
| Selection            | Fixed full dump / separate files / selective manifest | Selective manifest                    | Matches common application/user moves without file-order machinery            | AR-7   |
| Artifact             | Numbered files / ZIP / one JSON document              | One strict JSON document              | Smallest portable and reviewable contract                                     | AR-8   |
| Relationships        | UUID dump / natural-key graph                         | Natural-key graph                     | UUIDs are installation-specific                                               | AR-9   |
| Credentials          | Preserve / reset                                      | Exclude and regenerate where required | Avoids transferring authentication secrets                                    | AR-10  |
| Client identity      | Always regenerate / preserve / UUID                   | Preserve collision-free Client ID     | Client ID is the public integration identity                                  | AR-11  |
| Conflict behavior    | Per-row / partial / atomic modes                      | Atomic keep or update                 | Predictable outcome with no partial environment                               | AR-12  |
| UI surface           | Endpoints / focused workspace / framework             | Focused existing-pattern workspace    | Provides the needed workflow without a generalized operations system          | AR-15  |
| Manifest evolution   | Parallel v2 / correct unused v1                       | Correct v1                            | No adopted artifact needs compatibility                                       | AR-16  |
| Client URLs          | Substitution / exact copy / permanent exclusion       | Explicit exact copy                   | Preview makes environment-specific values visible without a template language | AR-17  |

---

## Security Considerations

- **Data sensitivity**: manifests contain personal profile data, emails, role assignments, claims,
  branding, and public client configuration. Operators must protect files as sensitive exports even
  though authentication credentials are excluded.
- **Input validation**: the server uses strict Zod schemas, existing domain validators, decoded asset
  limits, duplicate detection, and closed discriminators before mutation.
- **Authentication & authorization**: export and import require bearer authentication, operation
  permissions, category permissions, exact PostgreSQL scope, and super-admin authority for full
  environment scope. They do not add a managed-organization membership model.
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
       malformed value, missing parent, cross-application mapping, included control-plane record, or
       conflicting Client ID changes zero product rows and returns the specified fixed `400` or `409`
       response.
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
10. [ ] A user lacking an operation/category permission or the full-scope exact super-admin role
        receives the existing safe `401`/`403` behavior before any manifest content, destination
        existence, preview details, or mutation is disclosed; selected scope cannot access another
        organization than the exact requested and validated target.
11. [ ] The Admin UI prevents export with no category, requires explicit application selection,
        invalidates preview after file/mode changes, disables Apply until preview succeeds, and uses
        one open/save file interaction without fixed 48×12 layout assumptions.
12. [ ] Audit rows contain only the approved version, digest, mode, category names, and aggregate
        counts; responses, logs, audits, and subsequent client reads contain no imported plaintext
        secret after the one successful apply response.
13. [ ] An export from a fully populated fixture followed by `porta init` and import into a reset
        installation reproduces all selected portable fields and relationships exactly while
        leaving the destination control-plane graph untouched, producing new database UUIDs, and
        importing no source credentials, sessions, audit history, or global configuration.
14. [ ] Import rejects an unauthenticated or oversized manifest before parsing protected content,
        and every portability response carries `Cache-Control: no-store`.
15. [ ] Server, SDK, CLI, terminal Admin UI, structure, relevant security assurance, and final
        workspace verification commands pass with immutable specification coverage for all preceding
        criteria. Browser tests are required only if browser-facing OIDC behavior changes.
