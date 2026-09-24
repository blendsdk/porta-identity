# Requirements: Consent Flag Surfaces

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-04](../../requirements/RD-04-applications-and-oidc-clients.md) — the owning requirements document

## Scope of this plan (delta view)

### In this plan

- RD-04 AC-09: the Protocol section of the client detail maps an editable field directly to the
  existing update contract; this plan adds `requireConsent` to that field set and shows it.
- RD-04 AC-08: registration collects only client identity, type, application type, and one redirect
  URI, and leaves advanced protocol fields to authoritative server defaults; this plan keeps the
  registration dialog unchanged and relies on the server default `false`.
- RD-04 "SDK, conventional CLI, and focused server corrections": represent the complete client field
  set (the section already names PKCE and login methods). This plan adds `requireConsent` to the SDK
  types, the response guard, and the conventional CLI.
- RD-04 AC-17/AC-18: thin presentation services and server-owned defaults; the Admin UI switch calls
  the existing update path and does not derive defaults itself.
- Plan-local: carry the flag (`require_consent`) through the portability export/import contract so a
  backup/restore preserves the trust decision (AR-2, AR-10), and add the field to the client-field
  documentation.

### Deferred / out of this plan

- Everything in RD-04's Won't Have section, including RD-05 authorization administration, RD-08
  audit/history UI, RD-09 operational tools, and generalized UI infrastructure.
- Backfilling the missing `docs/database/migrations.md` rows 029–032 (AR-7). Migration
  `032_client_require_consent.sql` already exists; the gap predates this plan.
- A `porta client list` consent column (AR-8); only `client get` displays the flag.
- The connected-apps list/revoke surface and resource-server scopes/audience (DEF-21 follow-ups),
  which are separate from carrying the flag to consumers.
- Any change to the consent decision logic, the tenant binding, or the server database schema; those
  were delivered by DEF-21 and are unchanged here.

## Plan-local decisions

| Decision              | Chosen                                                                    | AR Ref |
| --------------------- | ------------------------------------------------------------------------- | ------ |
| Plan home             | `admin-ui`, implementing `admin-ui/RD-04`                                 | AR-1   |
| Portability scope     | Included: server portability contract + SDK import type preserve the flag | AR-2   |
| CLI update semantics  | `--require-consent` true, `--no-require-consent` false, absent unchanged  | AR-3   |
| Admin UI placement    | Protocol tab switch only                                                  | AR-4   |
| UI create dialog      | Unchanged; server defaults the flag to `false`                            | AR-5   |
| CLI display           | `client get` line only                                                    | AR-8   |
| migrations.md         | Out of scope; pre-existing 029–032 gap recorded in `02-current-state.md`  | AR-7   |
| Verification boundary | SDK verify + CLI verify + structure + compatibility selector              | AR-9   |

> **Traceability:** Every scope decision references the Ambiguity Register entry that resolved it.
> See `00-ambiguity-register.md`.

## Acceptance Criteria

1. The SDK `Client` type exposes `requireConsent: boolean`; `CreateClientInput` and
   `UpdateClientInput` accept `requireConsent?: boolean`; the `isClient` guard validates the field;
   the exact-type contract oracle passes.
2. `porta client create --require-consent` and `porta client update --require-consent` /
   `--no-require-consent` reach the SDK input correctly; an omitted flag on update sends no
   `requireConsent` and leaves the stored value unchanged; `porta client get` shows the value.
3. The Admin UI Protocol tab renders a "Require consent" switch for the selected client, marks the
   form dirty on change, and includes `requireConsent` in the `save-protocol` input. The
   registration dialog is unchanged and new clients default to `false`.
4. A client stored with `require_consent = true` exports a manifest with `require_consent: true` and
   imports back with the flag set; a changed flag is detected as a difference by the import plan.
5. The client-field documentation lists the flag in `docs/api/clients.md`, `docs/cli/clients.md`,
   `docs/database/schema.md`, and `techdocs/architecture/data-model.md`.
6. All ST cases in `07-testing-strategy.md` pass as immutable specification tests, and the AR-9
   verification commands pass.
