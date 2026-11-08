# Ambiguity Register: Resource-Server Admin Implementation Plan

> **Status**: ✅ GATE PASSED — all 5 items resolved
> **Last Updated**: 2026-11-09 00:22

| # | Category | Ambiguity / Gap | Options Presented | User Decision | Status |
|---|----------|-----------------|-------------------|---------------|--------|
| AR-1 | Technical | Where should the Admin CRUD service and repository live? | New `packages/server/src/resource-servers/` module / inside `applications/` | New `resource-servers` module; `oidc/resource-servers.ts` remains the provider resolver | ✅ Resolved |
| AR-2 | Technical | How should the new routes be mounted? | New `routes/resource-servers.ts` / extend `routes/applications.ts` | New route file mounted in `server.ts` | ✅ Resolved |
| AR-3 | UX & presentation | Where should the public docs live? | Dedicated API/CLI pages / sections in the application pages | Dedicated `docs/api/resource-servers.md` and `docs/cli/resource-servers.md`, cross-linked from the application pages | ✅ Resolved |
| AR-4 | Technical | What verification command closes the plan? | `pnpm verify` at the final phase / narrow selectors only | Targeted checks during tasks; full `pnpm verify` at the final phase | ✅ Resolved |
| AR-5 | Integration points | Which specialist reviews the provider-boundary phase? | Existing `oidc-provider-reviewer` / none | Existing `oidc-provider-reviewer`, already user-approved for provider-shape review | ✅ Resolved |

## Resolution Notes

**AR-1:** A separate `resource-servers` module keeps Admin CRUD, validation, and repository code away
from the provider resolver in `oidc/resource-servers.ts`. The two modules share only the database
tables and the identifier/audience semantics.

**AR-2:** A separate route file follows the `roles`, `permissions`, and `custom-claims` nested-router
pattern. It keeps `routes/applications.ts` focused on application and module lifecycle.

**AR-3:** Dedicated pages give the new endpoints and command family a stable reference and keep the
application pages readable. Cross-links make the relationship discoverable.

**AR-4:** Task-level verification stays narrow so the local loop is fast. The final phase runs
`pnpm verify` because the change spans server, SDK, CLI, docs, and structure contracts. CI remains
the authoritative full gate.

**AR-5:** The `oidc-provider-reviewer` specialist is already installed and approved. It reviews the
Phase 1 diff for provider-model shapes, application ownership, and audience/identifier boundaries.
It is additional to the mandatory correctness and security reviews; it never replaces them.

## Final Confirmation

The user selected AR-1 through AR-4 in the plan interview. AR-5 imports the earlier user-approved
specialist creation. The complete register is presented for final confirmation before the plan is
marked executable.
