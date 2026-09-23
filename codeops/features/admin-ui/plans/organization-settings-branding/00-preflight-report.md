# Preflight Report: Organization Settings and Branding

**Status:** PASS

**Iteration:** 2

**Scope:** Full nine-file plan in this directory

**Mode:** Strict scope, normal decision mode

**Last updated:** 2026-09-11 09:10

**Artifact hash at scan start:** `b5b8bdcf661f67308d7d2966b4ef48bed49d4d3719aa382cdc8fd5de67dc96b`
**Artifact hash after remedies:** `98fbbde4507d5602fb28d3b9b15eb2e8ad832339759f83345d5057fdafadc825`

> Same-session warning: this plan was created and audited in the same working session. The audit was
> grounded in the repository and its major recommendations were independently challenged, but a later
> fresh-session review may still find assumptions shared by the author and reviewer.

## Codebase Context

- Node.js/TypeScript ESM monorepo with a Koa identity server, PostgreSQL, Redis, a public SDK, and a
  JSVision terminal Admin UI.
- All 101 plan sections and 63 referenced paths were mapped. Planned new files were distinguished
  from missing existing files.
- The current branding service accepts declared media types and a 512 KiB limit but does not invoke
  the existing image validator (`packages/server/src/lib/branding-assets.ts:61`).
- The current server JSON body limit is exactly 100 KiB (`packages/server/src/server.ts:142`).
- `@jsvision/files@1.7.1` exports `openFile()`, but its file dialog requires at least 49×19.
- Root `yarn verify` was not run, as explicitly prohibited for this work.

## Result Summary

| Severity    | Count | State                 |
| ----------- | ----: | --------------------- |
| Critical    |     0 | —                     |
| Major       |    10 | Resolved and verified |
| Minor       |     5 | Resolved and verified |
| Observation |     0 | —                     |

All 13 preflight dimensions were scanned. Findings cluster around specification precision,
codebase alignment, dependency wiring, security boundaries, feasibility, migration behavior, and
testability. No material scope expansion is recommended.

## Major Findings

### PF-001 — Existing unvalidated asset rows would become public

The plan correctly adds validation to future uploads, but it does not establish the same invariant
for rows already stored before the new unauthenticated asset route is enabled. The plan itself notes
the missing validator (`02-current-state.md:43`) and later assumes stored bytes are validated
(`03-02-public-branding-rendering.md:36`).

- **A:** Delete existing `branding_assets` rows in migration 027.
- **B:** Validate and sanitize on every public read. This preserves legacy rows but adds permanent
  runtime work and failure handling.
- **C — Selected:** Make no legacy-data provision. Porta has not been used and has no existing
  uploads; future uploads will pass through validation. Development environments can use the
  established reset command if they contain disposable test data.
- **Confidence:** High. **Hardening:** Independently challenged; A was upheld, conditional on the
  already confirmed reset/no-user-data posture.
- **Decision:** User selected C on 2026-09-11. Do not add cleanup, backfill, or read-time validation.

### PF-002 — Upload request limit is not executable as written

The plan says “2 MiB base64 value plus small JSON overhead” and asks two proxies to “match” it
(`03-01-admin-assets-and-sdk.md:68`, `03-02-public-branding-rendering.md:95`). That does not define one
exact limit and can drift from the current exact 100 KiB server default.

- **A — Recommended:** Set the upload-only encoded request limit to exactly 3 MiB in the server and
  both bundled proxies. Keep decoded limits at 2 MiB for logos and 512 KiB for favicons.
- **B:** Generate the limits from shared configuration. This is more machinery than this feature needs.
- **Confidence:** High. **Hardening:** Independently challenged; A was upheld.
- **Decision:** User selected A on 2026-09-11.

### PF-003 — The plan calls a nonexistent SDK operation

`organizations.updateLoginMethods` is named as an integration point
(`03-01-admin-assets-and-sdk.md:104`), but `OrganizationsDomain` exposes `get()` and `update()`, and
`UpdateOrganizationInput` already includes `defaultLoginMethods`
(`packages/sdk/src/domains/organizations.ts:25`).

- **A — Recommended:** Correct the plan to use existing `organizations.update(...)`.
- **B:** Add a convenience SDK method. It duplicates existing capability and expands public API surface.
- **Confidence:** Very high. **Hardening:** Independently challenged; A was upheld.
- **Decision:** User selected A on 2026-09-11. Use the existing update operation; add no SDK method.

### PF-004 — Production CLI wiring cannot supply all planned organization operations

The workspace needs organization, branding, and two-factor SDK domains, but production composition
currently injects only `OrganizationsDomain` (`packages/cli/src/commands/admin.ts:109`,
`packages/cli/src/admin/session-service.ts:140`). Phase 3 does not include that production wiring.

- **A — Recommended:** Add one narrowly named organization-workspace domain bundle and wire it in
  `commands/admin.ts`, following the existing bounded RBAC bundle pattern.
- **B:** Add further positional factories for each domain. This works but makes existing plumbing harder
  to understand.
- **Confidence:** High. **Hardening:** Independently challenged; A was upheld.
- **Decision:** User selected A on 2026-09-11. Use one narrowly scoped dependency object; do not add
  a generalized service or framework.

### PF-005 — Migration rollback conflicts with the immutable migration specification

The plan makes migration 027 restore the old constraint on rollback
(`03-01-admin-assets-and-sdk.md:33`), while the existing newest-migration specification requires a
forward-only, no-op down migration
(`packages/server/tests/integration/migrations/record-deletion-lifecycle.spec.test.ts:43`). Restoring
512 KiB can also fail once a valid larger logo exists.

- **A — Recommended:** Make migration 027 forward-only with a no-op down. Database reset remains the
  development recovery path.
- **B:** Keep the restoring down migration and retarget the existing immutable test specifically to its
  original migration. This retains conventional rollback but creates a rollback that can legitimately fail.
- **Confidence:** High. **Hardening:** Independently challenged; A was upheld.
- **Decision:** User selected A on 2026-09-11. Migration 027 is forward-only with a no-op down.

### PF-006 — `publicOrigin` has no trusted authority

The proposed resolver accepts any string origin (`03-02-public-branding-rendering.md:64`). Those URLs
flow into HTML, email, and CSP. A request-derived Host or forwarded host is not authoritative, and
email rendering has no request origin. Existing URL generation deliberately uses
`config.issuerBaseUrl` (`packages/server/src/auth/recovery-job-processor.ts:94`).

- **A — Recommended:** Bind absolute asset URLs to trusted `config.issuerBaseUrl` internally and add a
  specification proving Host/forwarded-host input cannot alter them.
- **B:** Keep origin injection but introduce a restricted trusted-origin type/factory. This adds an
  abstraction without improving the current use case.
- **Confidence:** Very high. **Hardening:** Independently challenged; A was upheld.
- **Decision:** User selected A on 2026-09-11. Use only `config.issuerBaseUrl`; add no origin wrapper.

### PF-007 — Invitation email call sites are omitted

Phase 2 changes the shared email branding contract but names only the email service and OIDC provider
(`99-execution-plan.md:104`). Invitation send and preview build reduced organization values in
`packages/server/src/routes/users.ts:511` and `:616`, so they cannot provide the planned organization
name fallback without adaptation.

- **A — Recommended:** Add `routes/users.ts` and its focused tests to the existing email task, passing
  the required organization identity/name into the one shared branding path.
- **B:** Preserve the current slug fallback for invitations. This would make invitation branding differ
  from the accepted organization-name behavior.
- **Confidence:** Very high. **Hardening:** Independently challenged; A was upheld.
- **Decision:** User selected A on 2026-09-11. Update the two existing invitation call sites and their
  focused tests; do not add a separate branding path.

### PF-008 — The 48×12 acceptance case cannot open JSVision's file dialog

The plan requires all actions reachable at 48×12 (`03-03-organization-admin-workspace.md:53`,
`07-testing-strategy.md:68`), but the installed JSVision file dialog has a hard minimum of 49×19.

- **A:** Keep Add/Replace visible at 48×12 but disable them with fixed resize guidance; test the real
  picker at 49×19 or larger.
- **B — Selected:** Replace the 48×12 workspace requirement with a 49×19 minimum, matching the
  existing JSVision file dialog without adding special compact-mode behavior.
- **Confidence:** High. **Hardening:** Independently challenged; A was upheld.
- **Decision:** User selected B on 2026-09-11. Keep the implementation simple and do not add a custom
  picker, compact fallback, or disabled-action mode.

### PF-009 — Dynamic branding CSP may add database work to every OIDC endpoint

The plan says to compute branding CSP before `oidcProvider.callback()`
(`03-02-public-branding-rendering.md:87`). That catch-all also serves token, discovery, JWKS, and other
non-HTML protocol traffic (`packages/server/src/server.ts:429`). Existing branded HTML hooks already
resolve organization context (`packages/server/src/oidc/configuration.ts:159`).

- **A — Recommended:** Keep static/base CSP on the generic provider callback. Resolve effective
  branding and dynamic image sources only in branded HTML rendering hooks.
- **B:** Resolve branding before every provider callback. It is simpler to centralize but adds needless
  database work to protocol endpoints.
- **Confidence:** High. **Hardening:** Independently challenged; A was upheld.
- **Decision:** User selected A on 2026-09-11. Resolve dynamic branding only in existing HTML hooks.

### PF-010 — Execution quality lenses use invalid classifications

The execution plan labels phases with `web application` and `data and migration`
(`99-execution-plan.md:47`, `:84`, `:122`). These are domain labels, not the configured CodeOps
quality-lens values, so security and public API specialist reviews may not be routed.

- **A — Recommended:** Use exact add-on lenses: Phase 1 `security, api-surface`; Phase 2 `security,
api-surface`; Phase 3 `security`. Keep domain labels separately only if useful.
- **B:** Rely on generic review. This is not proportionate for public assets, auth rendering, CSP, and
  SDK contracts.
- **Confidence:** Very high. **Hardening:** Independently challenged; A was upheld.
- **Decision:** User selected A on 2026-09-11. Correct the three metadata declarations only.

## Minor Findings

### PF-011 — CSP source terminology is internally ambiguous

`imageOrigins` is described as HTTP(S) origins but may also contain the CSP token `'self'`
(`03-02-public-branding-rendering.md:54`, `:70`). Define one exact `imageSources` contract containing
conditional `'self'` plus validated external origins; keep global `data:` in the CSP builder.
**Decision:** User selected the recommendation on 2026-09-11. Use `imageSources` containing only
internally derived `'self'` and validated external origins.

### PF-012 — Archived organization terminology is obsolete

The public-route error table mentions an archived organization
(`03-02-public-branding-rendering.md:104`), but the current lifecycle has active/suspended states and
deletion. Remove “Archived/”. **Decision:** User approved on 2026-09-11.

### PF-013 — The SVG specification case is implementation-derived

ST-7 refers to constructs “handled by existing validator” rather than a concrete input and required
outcome. Name representative clean and sanitized SVG inputs and assert stored sanitized output or the
already accepted rejection behavior. Do not add a new parser. **Decision:** User approved the
recommendation on 2026-09-11; use concrete inputs and stored-output expectations without changing
the existing validator.

### PF-014 — Operation serialization scope is inconsistent

The proposal says mutation serialization occurs “within the window”
(`03-03-organization-admin-workspace.md:28`), while the controller rule permits one operation per tab
(`:94`). Use the explicit per-tab in-flight guard wording; do not add a global lock. **Decision:** User
approved the recommendation on 2026-09-11. Remove serialization wording and use ordinary per-tab
operation disabling only while that tab's current request is pending.

### PF-015 — ETag construction is unnecessarily vague

The route asks for an ETag derived from metadata “such as” ID and `updatedAt`
(`03-02-public-branding-rendering.md:36`). Specify reuse of existing
`setETagHeader(ctx, 'branding-asset', asset.id, asset.updatedAt)`
(`packages/server/src/lib/etag.ts:127`) instead of inventing another rule. **Decision:** User approved
the recommendation on 2026-09-11. Reuse the existing helper exactly as specified.

## Decision Log

- 2026-09-11 — PF-008: replace the 48×12 requirement with a 49×19 workspace minimum. Avoid custom
  picker and compact fallback machinery.
- 2026-09-11 — PF-001: no legacy-data handling. There are no existing uploads because Porta has not
  been used; future uploads use the validator.
- 2026-09-11 — PF-002: use an exact 3 MiB upload-only request limit in the server and both bundled
  proxies; keep decoded limits at 2 MiB for logos and 512 KiB for favicons.
- 2026-09-11 — PF-003: use existing `organizations.update(...)`; do not add a login-method SDK method.
- 2026-09-11 — PF-004: use one narrow organization-workspace dependency object for the three existing
  SDK domains and add the missing production startup wiring.
- 2026-09-11 — PF-005: make migration 027 forward-only with a no-op down; add no rollback
  compatibility behavior.
- 2026-09-11 — PF-006: derive branding URLs only from `config.issuerBaseUrl` and verify request host
  headers cannot influence them.
- 2026-09-11 — PF-007: adapt invitation send and preview to the shared branding contract and include
  focused tests.
- 2026-09-11 — PF-009: resolve effective branding and dynamic image CSP only in existing HTML
  rendering hooks; keep protocol endpoints on static/base CSP.
- 2026-09-11 — PF-010: replace invalid phase lens labels with the supported `security` and
  `api-surface` metadata values.
- 2026-09-11 — PF-011: name the internal contract `imageSources`; allow only internally derived
  `'self'` and validated external origins.
- 2026-09-11 — PF-012: remove obsolete archived-organization wording; retain only deleted.
- 2026-09-11 — PF-013: specify concrete SVG inputs and expected stored output; keep the existing
  validator and add no parser.
- 2026-09-11 — PF-014: add no queue or global lock; disable only the current tab's operation controls
  while its request is pending.
- 2026-09-11 — PF-015: reuse `setETagHeader(ctx, 'branding-asset', asset.id, asset.updatedAt)`; add no
  branding-specific ETag implementation.

## Remedy Verification

- Re-scanned all nine plan documents and the owning RD-06 requirement after applying the decisions.
- Confirmed no stale 48×12, phantom SDK operation, caller-supplied origin, mixed image-source name,
  archived lifecycle, vague body-limit, reversible-migration, or invalid quality-lens instruction
  remains in the governing artifacts.
- Confirmed the production SDK-domain wiring, invitation call sites, trusted issuer source, HTML-only
  branding lookup, concrete SVG expectations, per-tab pending state, and existing ETag helper are
  present in the ordered execution tasks or their governing design.
- `git diff --check` passed. Root `yarn verify` was not run, as explicitly prohibited.

## Gate

All findings have explicit decisions, all accepted remedies are applied, and the affected artifacts
pass the second scan. The plan passes preflight and may advance to execution.
