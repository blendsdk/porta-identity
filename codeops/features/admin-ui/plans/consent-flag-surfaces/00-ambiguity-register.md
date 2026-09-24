# Ambiguity Register: Consent Flag Surfaces

> **Status**: ✅ GATE PASSED — all 9 items resolved
> **Last Updated**: 2026-09-24 09:40
> **CodeOps Artifact Schema**: 1

| #   | Category           | Ambiguity / Gap                                                                                     | Options Presented                                                            | User Decision                                                                                                                                                 | Status      |
| --- | ------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | Scope              | Which feature and plan own exposing `requireConsent` across SDK, CLI, and Admin UI?                 | admin-ui·RD-04 / test-assurance·RD-04 / new feature folder                   | `admin-ui`, `> **Implements**: admin-ui/RD-04`                                                                                                                | ✅ Resolved |
| 2   | Scope              | Is the portability export/import gap (`requireConsent` is dropped on export) included in this plan? | Include / Exclude and record a finding                                       | Include — fix the server portability contract and the SDK import type so backup/restore preserves the flag                                                    | ✅ Resolved |
| 3   | Behavioral         | How does CLI `client update` avoid overwriting the stored flag when the flag is omitted?            | `--require-consent` / `--no-require-consent` / `--require-consent <boolean>` | `--require-consent` sets true, `--no-require-consent` sets false, absent leaves the client unchanged                                                          | ✅ Resolved |
| 4   | UX & presentation  | Where does the Admin UI toggle live?                                                                | Protocol tab only / Protocol tab + Overview line                             | Protocol tab only, next to "PKCE required"                                                                                                                    | ✅ Resolved |
| 5   | UX & presentation  | The Admin UI registration (create) dialog has no Protocol tab — how is the flag set at creation?    | Default false and edit later / add a toggle to the create dialog             | Default false; the operator sets it in the Protocol tab after creation                                                                                        | ✅ Resolved |
| 6   | Technical unknowns | How does the CLI represent "absent" versus "false" for a yargs boolean without a default?           | (single viable path)                                                         | yargs `type: 'boolean'` with no default: absent → `undefined`, present → `true`, `--no-…` → `false`; spread the field only when defined                       | ✅ Resolved |
| 7   | Scope              | `docs/database/migrations.md` documents only through migration 028; 029–032 are already missing.    | Exclude and record the gap / backfill 029–032                                | Exclude; record the pre-existing 029–032 documentation gap as out of scope                                                                                    | ✅ Resolved |
| 8   | UX & presentation  | Where does the CLI display the flag?                                                                | `client get` only / `client get` + a `client list` column                    | `client get` only, matching the existing "Require PKCE" line                                                                                                  | ✅ Resolved |
| 9   | Technical unknowns | Which commands verify every task in this plan?                                                      | sdk+cli verify, structure, compat / workspace verify + structure only        | `yarn workspace @portaidentity/sdk verify`, `yarn workspace @portaidentity/cli verify`, `yarn test:structure`, `yarn assurance:compat --select compatibility` | ✅ Resolved |

> **Gate confirmation:** every row above carries an explicit user decision made during planning
> discovery. The user confirms the complete register before execution begins. No row is silently
> deferred.

## Resolution Notes

**AR-1:** `admin-ui/RD-04` owns OIDC client administration, including the client field set and the
terminal edit form. The SDK and conventional CLI carry the same client-field surface, so this plan
stays under `admin-ui` rather than opening a new feature folder.

**AR-2:** Exporting or importing a client without `require_consent` would silently restore a
third-party client as trusted. The contract change is part of exposing the field, not a separate
feature.

**AR-3 / AR-6:** A plain yargs boolean defaults to `false` when read, which would let an unrelated
`client update` silently trust an existing client. The CLI must distinguish "not provided" from
"provided false". Verified against the installed yargs 18.1.0: absent → `undefined`.

**AR-4 / AR-5:** The Admin UI already renders `requirePkce` as a `Switch` in the Protocol tab and
sends it in the `save-protocol` intent. Reusing that pattern is the smallest change. The
registration dialog stays unchanged and the server defaults new clients to `false`.

**AR-7:** This plan adds no migration. Migration `032_client_require_consent.sql` already exists, so
editing `migrations.md` here would only partially document a pre-existing gap. Recorded as
`R-02` in `02-current-state.md`.

**AR-8:** The `client list` table stays unchanged to keep the diff minimal and readable.

**AR-9:** SDK and CLI contract changes require the registered compatibility selector from a clean
committed revision (`AGENTS.md`). The final phase also runs the root `yarn verify` as a broader
safety net even though it is not a per-task Verify line.
