## Ambiguity Register: RD-04 Applications and OIDC Clients Implementation Plan

> **Status**: ✅ GATE PASSED — all 9 items resolved
> **Last Updated**: 2026-08-30 12:44
> **Mode**: auto-design during execution
> **Root invocation ID**: `exec-rd04-20260830T1228`

The systematic review covered feature, behavioral, scope, technical, edge-case, integration, data,
security, non-functional, UX, stakeholder, and naming categories. RD-04, AR-71–AR-84, and its
three-iteration preflight own product behavior. This register contains only plan-local choices.

| #    | Category      | Ambiguity / Gap                                                                                              | Options Presented                                                                                                                                                                                                                       | User Decision                                                                             | Status      |
| ---- | ------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------- |
| AR-1 | Scope         | What is the implementation boundary?                                                                         | Implement all approved RD-04 behavior and its focused server/SDK/CLI corrections / broaden into adjacent RD-05, RD-08, or RD-09 work                                                                                                    | Strict RD-04 boundary; imported from the approved RD and preflight                        | ✅ Resolved |
| AR-2 | Technical     | Should the implementation introduce shared entity/UI infrastructure?                                         | Direct application/client-specific services, controllers, workspaces, and dialogs / generalized entity framework                                                                                                                        | Direct feature-specific composition; imported from the Admin UI prime directive and RD-04 | ✅ Resolved |
| AR-3 | UX            | How should the complete client create/configuration surface fit a terminal dialog?                           | One movable tabbed dialog with focused sections and DataGrid-backed list editors / a multi-dialog wizard                                                                                                                                | One movable tabbed Layout DSL dialog with DataGrid-backed collection editors              | ✅ Resolved |
| AR-4 | Security      | How should overlapping active client secrets authenticate through `oidc-provider`?                           | Add a tightly scoped pre-provider validation and canonicalization bridge / replace or patch provider authentication internals                                                                                                           | Add the tightly scoped bridge; do not patch provider internals                            | ✅ Resolved |
| AR-5 | Data & state  | How should existing `porta-app-admin` role assignments receive `admin:org:read`?                             | Add a new ordered idempotent SQL migration plus update the role definition / repair only during future initialization                                                                                                                   | Add the ordered idempotent migration and update the role definition                       | ✅ Resolved |
| AR-6 | Integration   | Which commands constitute the plan's completion gate?                                                        | Focused package/spec/integration/pentest checks, packed Admin UI journey, Node 24 LTS root verify, docs build, protocol and production-security harnesses, and clean committed SDK/CLI compatibility selectors / a reduced UI-only gate | Use the complete focused gate, with Node 24 LTS                                           | ✅ Resolved |
| AR-7 | Compatibility | What should happen to secrets created before migration 013, which have no provider-compatible SHA-256 value? | Require rotation of legacy-only clients before they can authenticate, while legacy secrets remain valid during an overlap after a modern secret is generated / add request-scoped provider metadata plumbing for legacy-only secrets    | Require one modern-secret generation; legacy secrets then remain valid during overlap     | ✅ Resolved |
| AR-8 | Concurrency   | What revocation guarantee applies to a request already authenticating?                                       | Revocation blocks subsequent requests, while one request that already validated may finish / replace provider authentication for linearizable revocation                                                                                | Subsequent requests fail; an already validated in-flight request may complete             | ✅ Resolved |
| AR-9 | Technical (runtime) | What exact deterministic test seam represents the approved validation-to-provider handoff?              | An optional credential-free async callback awaited after successful validation and before middleware continuation / expose credential or repository data to the test / use timing-based coordination                                      | `afterCredentialValidation?: () => Promise<void>` callback; AI delegated by `--auto-design` | ✅ Resolved |

### Resolution Notes

**AR-1:** Planning target is `admin-ui/RD-04`. Context includes RD-01–RD-03, the RD-04 preflight,
existing Admin UI plans, and affected server/SDK/CLI code. The modification set is this new plan
folder and the RD-04 roadmap row; upstream requirements are read-only during planning.

**AR-2:** Reuse the existing feature-specific controller, immutable service/state, JSVision Layout
DSL, DataGrid, movable-modal, focus, generation, and session/context patterns. Do not create a form,
workspace, controller, or entity generator.

**AR-3:** User approved the tabbed design. It reuses JSVision `TabView`, keeps
single-line inputs one row high, and uses DataGrid for every natural table. Inside the client
configuration dialog, redirect URI, logout URI, and origin collections use DataGrid row editors.
Long tab content uses one feature-local vertical `Scroller`; no generalized form or grid framework
is introduced.

**AR-4:** The independent security challenge is complete. The installed `oidc-provider` accepts one
scalar `client_secret` and exposes no supported custom verifier hook. The bridge uses indexed
SHA-256 matching for modern high-entropy secrets. A still-active legacy Argon2-only secret is checked
only after modern matching fails and is limited to the supported maximum of 10 active secrets per
client. Generation enforces that maximum atomically; the upgrade precondition refuses existing
over-limit data without mutating it. Legacy fallback uses a non-queuing try-acquire for one batch per
server process and reuses the existing 30-per-5-minute limit under an issuer/client Redis key after
parsing. Busy or rate-limited requests receive the existing fixed 429/Retry-After treatment and are
not classified as invalid credentials. A valid admitted match supplies the provider's current
canonical SHA-256 value.
The bridge preserves provider authentication-method checks and rejects malformed, duplicate,
invalid, public-client, and dependency-error cases without logging credentials. Replacing or
patching provider internals is substantially larger and relies on private behavior. Confidence:
high. Hardening: independently challenged.

**AR-5:** User approved a new ordered migration, the repository-compatible way to
correct already initialized databases without rewriting applied migrations.

**AR-6:** User approved the complete focused gate. Server/OIDC behavior changes make the server and
protocol checks applicable; this is not the earlier UI-only verification case.

**AR-7:** Migration 013 explicitly says existing Argon2-only secrets cannot be backfilled because
their plaintext is unavailable (`packages/server/migrations/013_client_secret_sha256.sql:7`). A
legacy secret can participate in overlap only after an administrator generates one modern secret
that can serve as the provider's canonical value. The recommended plan documents and tests that
one-time transition instead of adding request-local metadata infrastructure solely for legacy data.

**AR-8:** The recommended bridge has a narrow validation/provider-lookup window: a request already
validated just before revocation may complete. Subsequent requests reload active secrets and fail.
Making revocation linearizable across that boundary requires replacing provider authentication and
is disproportionate for this single-operator administration product.

**AR-9:** Authority: AI — delegated by `--auto-design`. Eligibility: internal testing interface
inside the already approved deterministic handoff seam; it changes no product behavior, access
policy, or public compatibility. Objective: prove the accepted in-flight revocation boundary
without timing-dependent tests or credential exposure. Decision: accept an optional
`afterCredentialValidation?: () => Promise<void>` dependency that receives no arguments and is
awaited only after successful active-secret validation, immediately before middleware
continuation; production omits it. Evidence: the middleware otherwise proceeds directly to
`next()`, while ST-14 requires deterministic coordination at that exact boundary. Rejected
alternatives: exposing credential/repository details enlarges the security-sensitive test API;
timing or polling is nondeterministic. Strongest counterargument: any seam increases middleware
surface, but this optional no-argument callback is smaller and safer than probabilistic race
orchestration. Confidence: High — reopen if the middleware no longer owns this handoff. Hardening:
the preflight challenger required a deterministic barrier, and the spec author independently
converged on the credential-free callback. Policy version: 1. Root invocation ID:
`exec-rd04-20260830T1228`. Reopen triggers: provider handoff moves outside this middleware or an
existing repository-standard barrier supersedes it.

## Confirmation

The user explicitly accepted all six previously open recommendations on 2026-08-30. Together with
the imported RD-04 scope decisions, every material planning choice is resolved and the
Zero-Ambiguity Gate passes.
