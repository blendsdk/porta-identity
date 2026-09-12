## Preflight Report: RD-04 — Applications and OIDC Clients

> **Status**: ✅ PREFLIGHT PASSED — all 13 findings resolved
> **Iteration**: 3 (bounded verification of PF-013)
> **Previous Iteration**: 1 new finding — accepted and fixed
> **This Iteration**: 0 new findings
> **Carried Forward**: none
> **Artifact**: single requirement at `codeops/features/admin-ui/requirements/RD-04-applications-and-oidc-clients.md`
> **Artifact SHA-256**: `3be501609d7207807eccf4ecdcef049cfbe11df6cf25b81f662425cc3729c48f`
> **Context Documents**: RD-01, RD-02, RD-03, requirements README, ambiguity register, roadmap, repository AGENTS.md
> **Modification Set During Audit**: RD-04, this report, and the RD-04 roadmap stage
> **Codebase Grounded**: 26 source files examined; 48 cited references verified
> **Last Updated**: 2026-08-30

> **SAME-SESSION REVIEW:** This artifact was created in the current session. Same-agent bias risk is
> elevated. Consider a fresh-session or human identity-domain review before execution if maximum
> independence is required.

### Codebase Context Summary

**Tech Stack:** Node.js 24 LTS for this work, TypeScript ESM, Yarn Classic/Turbo, Koa,
`oidc-provider`, PostgreSQL, Redis, Porta SDK/CLI, and JSVision 1.6.

**Architecture:** Applications and modules are deployment-global definitions. OIDC clients contain
an organization ID and reference one global application; secrets belong to a client. The Admin UI
is a single-process CLI/TUI whose selected organization is session-local operational context.
Server admin authorization is deployment-wide permission-based authorization, not membership in
the selected target organization.

**Key Files Examined:**

- `packages/cli/src/admin/application.ts`, `presentation.ts`, `user-workspace.ts`, and related tests
- `packages/sdk/src/domains/applications.ts`, `domains/clients.ts`, and their public types
- `packages/server/src/routes/applications.ts`, `routes/clients.ts`
- `packages/server/src/applications/service.ts`, `clients/service.ts`, `clients/validators.ts`
- `packages/server/src/clients/secret-service.ts`, `clients/secret-repository.ts`
- `packages/server/src/lib/admin-permissions.ts`, `lib/data-import.ts`
- `packages/server/src/middleware/admin-auth.ts`, `require-permission.ts`, `client-secret-hash.ts`
- `packages/server/src/oidc/configuration.ts`, migrations `003_applications.sql` and `004_clients.sql`

### Summary by Dimension

| #   | Dimension              | Findings | Highest Severity |
| --- | ---------------------- | -------: | ---------------- |
| 1   | Ambiguities            |        5 | 🟠 MAJOR         |
| 2   | Implicit Assumptions   |        3 | 🟠 MAJOR         |
| 3   | Logical Contradictions |        3 | 🟠 MAJOR         |
| 4   | Completeness Gaps      |        2 | 🟠 MAJOR         |
| 5   | Dependency Issues      |        2 | 🟠 MAJOR         |
| 6   | Feasibility Concerns   |        3 | 🟠 MAJOR         |
| 7   | Testability            |        1 | 🟡 MINOR         |
| 8   | Security Blind Spots   |        4 | 🟠 MAJOR         |
| 9   | Edge Cases             |        3 | 🟠 MAJOR         |
| 10  | Scope Creep Indicators |        0 | —                |
| 11  | Ordering & Sequencing  |        0 | —                |
| 12  | Consistency            |        3 | 🟠 MAJOR         |
| 13  | Codebase Alignment     |       10 | 🟠 MAJOR         |

### Summary by Severity

| Severity    | Count | Status   |
| ----------- | ----: | -------- |
| CRITICAL    |     0 | none     |
| MAJOR       |     9 | resolved |
| MINOR       |     4 | resolved |
| OBSERVATION |     0 | none     |

---

### PF-001: Client protocol combinations are unsafe and contradict runtime behavior 🟠 MAJOR

**Dimension:** Security Blind Spots, Logical Contradictions, Codebase Alignment
**Location:** RD-04 AC-08, AC-09, AC-18, and “Validation and supported client values”
**Codebase Evidence:** `packages/server/src/routes/clients.ts:70`; `packages/server/src/clients/service.ts:170`;
`packages/server/src/lib/data-import.ts:218`; `packages/server/src/oidc/configuration.ts:505`
**The Problem:** The RD allowlists individual values but permits unusable or unsafe combinations.
The Admin route also accepts them, even though import validation already rejects public-client
secret authentication, public `client_credentials`, disabled public PKCE, confidential `none`, and
non-origin allowed-origin URLs. The stored `requirePkce` flag can currently say false while runtime
always requires PKCE. OAuth Security BCP requires public authorization-code clients to use PKCE and
exact redirect matching ([RFC 9700 §2.1](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.1)).

**Options:**

| Option | Description                                                                                                                                              | Pros                                             | Cons                                                    |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| A      | Share the existing safe compatibility rules across Admin routes/import/UI and reconcile stored PKCE with runtime; public clients can never disable PKCE. | One authoritative rule set; complete safe editor | Focused server/runtime correction is required           |
| B      | Expose only immutable safe server defaults and defer protocol editing.                                                                                   | Smaller implementation                           | Contradicts the approved complete configuration surface |

**Recommendation:** Option A — reuse rules Porta already has; do not invent broader application-type policy.

**Confidence:** High — changed only if Porta intentionally supports unsafe/unusable stored combinations.
**Hardening:** The challenge added explicit runtime reconciliation; **Challenger: converged**.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-002: Secret rotation currently invalidates the prior “active” secret 🟠 MAJOR

**Dimension:** Feasibility Concerns, Security Blind Spots, Codebase Alignment
**Location:** RD-04 AC-12, “Secrets” scope decision, and “Data sensitivity”
**Codebase Evidence:** `packages/server/src/clients/secret-service.ts:58`;
`packages/server/src/clients/service.ts:599`; `packages/server/src/clients/secret-repository.ts:199`;
`packages/server/src/middleware/client-secret-hash.ts:43`
**The Problem:** Generation stores multiple active secrets, but production OIDC metadata exposes
only the newest active SHA-256 value. Generating a replacement therefore makes the older
still-labelled-active secret unusable immediately. The RD promises rotation and metadata that would
mislead an operator and could cause an outage.

**Options:**

| Option | Description                                                                                                                | Pros                                                | Cons                                                     |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------- |
| A      | Make runtime authentication accept every active, unexpired secret until explicit revoke/expiry, with token-endpoint tests. | Matches schema and zero-downtime rotation semantics | Security-sensitive runtime change                        |
| B      | Remove rotation from RD-04 until the runtime is corrected in a separate feature.                                           | Avoids touching token authentication now            | Leaves the approved client-management surface incomplete |

**Recommendation:** Option A — it makes existing “active” metadata truthful and supports normal secret rotation.

**Confidence:** High — changed only if the product explicitly chooses immediate-cutover secrets.
**Hardening:** Immediate cutover was rejected as misleading; **Challenger: converged**.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-003: Nested secret revoke does not verify its parent client 🟠 MAJOR

**Dimension:** Security Blind Spots, Edge Cases, Codebase Alignment
**Location:** RD-04 AC-12, “Ownership model,” and “Tenant isolation”
**Codebase Evidence:** `packages/server/src/routes/clients.ts:376`;
`packages/server/src/clients/secret-service.ts:187`; `packages/server/src/clients/secret-repository.ts:134`
**The Problem:** `POST /clients/:id/secrets/:secretId/revoke` ignores `:id` and revokes solely by
secret ID. A stale or mismatched ID can revoke a credential belonging to another displayed client.

**Options:**

| Option | Description                                                                                                         | Pros                                   | Cons                             |
| ------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------- |
| A      | Require the route client ID and secret ID to belong together, and also validate returned secret metadata in the UI. | Protects API, SDK, CLI, and UI callers | Small server contract correction |

**Recommendation:** Option A — UI-only validation was considered and dropped because crafted or stale non-UI requests bypass it.

**Confidence:** High — changed only if the nested client ID is deliberately documented as decorative, which it is not.
**Hardening:** **Challenger: converged**.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-004: Selected organization is incorrectly described as server authorization 🟠 MAJOR

**Dimension:** Implicit Assumptions, Security Blind Spots, Codebase Alignment
**Location:** RD-04 Feature Overview, “Authorization,” and “Tenant isolation”
**Codebase Evidence:** `packages/server/src/middleware/admin-auth.ts:145` and `:270`;
`packages/server/src/middleware/require-permission.ts:31`; `packages/server/src/routes/clients.ts:269`
**The Problem:** The server authorizes deployment administrators by admin permissions; it does not
authorize client detail/mutations by the Admin UI’s selected target organization. The selection is
an operational context and integrity guard, not an authorization boundary. Claiming otherwise makes
the security model inaccurate.

**Options:**

| Option | Description                                                                                                                                                                         | Pros                                                    | Cons                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| A      | State explicitly that `admin:client:*` authority is deployment-wide; validate selected organization immediately before mutation and validate returned ownership before publication. | Matches the approved global-admin model and current API | Requires an explicit project-level exception/clarification to generic tenant-isolation wording |
| B      | Introduce organization-bound server authorization/routes.                                                                                                                           | Makes selected org an API auth boundary                 | Changes the approved deployment-admin model and expands the API considerably                   |

**Recommendation:** Option A — keep the existing global administrative authority, but make UI context checks strict and the documentation honest.

**Confidence:** Medium — Option B becomes mandatory if deployment-wide client authority was not intentional.
**Hardening:** The challenge required an explicit authority statement rather than an implied exception; **Challenger: converged**.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-005: Client workspace capability dependencies are incomplete 🟠 MAJOR

**Dimension:** Dependency Issues, Completeness Gaps, Codebase Alignment
**Location:** RD-04 AC-01, AC-07, AC-08, and “Authorization”
**Codebase Evidence:** `packages/server/src/lib/admin-permissions.ts:174`;
`packages/cli/src/admin/presentation.ts:151`; `packages/server/src/routes/applications.ts:150`;
`packages/server/src/routes/clients.ts:245`
**The Problem:** The built-in `porta-app-admin` can manage clients but lacks `admin:org:read`, so it
cannot select an organization. Separately, resolving application names and selecting an active
application require `admin:app:read`, but client actions list only client permissions.

**Options:**

| Option | Description                                                                                                                                                                                  | Pros                                            | Cons                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| A      | Add `admin:org:read` to the built-in App Admin with an idempotent existing-install correction; use Application ID fallback without app-read; require app-read plus client-create for Create. | Makes the built-in role usable; no new endpoint | App Admin gains deployment-wide organization visibility                             |
| B      | Require administrators to combine App Admin with a separate organization-reading role.                                                                                                       | No built-in role change                         | Contradicts the role’s stated client-management purpose and is easy to misconfigure |

**Recommendation:** Option A — it is the smallest coherent permission correction; do not invent another organization-selection permission.

**Confidence:** Medium — changed if organization names are intentionally hidden from App Admin despite deployment-wide client management.
**Hardening:** The challenge narrowed the change to org-read and rejected a joined server projection; **Challenger: converged**.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-006: Terminal-state mutation behavior is undefined 🟠 MAJOR

**Dimension:** Ambiguities, Edge Cases, Codebase Alignment
**Location:** RD-04 AC-04 through AC-06 and AC-09 through AC-12
**Codebase Evidence:** `packages/server/src/applications/service.ts:181` and `:375`;
`packages/server/src/clients/service.ts:295`; `packages/server/src/clients/secret-service.ts:58`
**The Problem:** Archive and revoke are permanent, yet the server still permits several edits,
module changes, and secret generation after those states. The RD does not say what the UI exposes.

**Options:**

| Option | Description                                                                                                                                             | Pros                                                                        | Cons                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------- |
| A      | Archived applications and revoked clients are read-only; inactive entities remain editable; secret mutations require a non-revoked confidential client. | Familiar permanent-state behavior; prevents credentials for revoked clients | UI intentionally exposes less than current API          |
| B      | Expose every mutation the server currently accepts.                                                                                                     | Literal complete API surface                                                | Makes “permanent” terminal states incoherent and unsafe |

**Recommendation:** Option A — it is the smallest coherent provider-style lifecycle rule.

**Confidence:** High — changed only if archived/revoked are intentionally non-terminal labels.
**Hardening:** **Challenger: converged**.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-007: Required lifecycle operations are absent from the SDK correction list 🟠 MAJOR

**Dimension:** Completeness Gaps, Feasibility Concerns, Codebase Alignment
**Location:** RD-04 AC-05, AC-10, AC-17, and “SDK and conventional CLI corrections”
**Codebase Evidence:** `packages/server/src/routes/applications.ts:218`;
`packages/server/src/routes/clients.ts:309`; `packages/sdk/src/domains/applications.ts:23`;
`packages/sdk/src/domains/clients.ts:23`
**The Problem:** The server supports application/client activate/deactivate, but the SDK omits them
and exposes nonexistent restore operations. The RD requires SDK-backed thin services without
explicitly authorizing all lifecycle and internal-ID corrections needed to implement them.

**Options:**

| Option | Description                                                                                                                                                | Pros                                                      | Cons                             |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------- |
| A      | Explicitly correct activate/deactivate/archive/revoke/module-deactivate, internal-ID targeting, response wrappers, and affected conventional CLI commands. | Accurate public contract; preserves thin Admin UI service | Wider SDK/CLI compatibility work |

**Recommendation:** Option A — direct Admin UI HTTP calls were considered and dropped because they violate AC-17 and preserve known public SDK defects.

**Confidence:** High — server routes and SDK omissions are directly verified.
**Hardening:** **Challenger: converged**.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-008: Application lifecycle warnings do not define the actual global effect 🟠 MAJOR

**Dimension:** Ambiguities, Logical Contradictions, Codebase Alignment
**Location:** RD-04 AC-03, AC-05, Feature Overview, and Acceptance Criterion 4
**Codebase Evidence:** `packages/server/src/applications/service.ts:268`;
`packages/server/src/clients/service.ts:151` and `:556`
**The Problem:** Deactivate/archive changes the global definition and blocks creation of new clients,
but existing active clients continue authenticating because runtime checks only client status. A
generic “global effect” warning can wrongly imply an application-wide outage.

**Options:**

| Option | Description                                                                                                                               | Pros                                 | Cons                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| A      | Preserve current behavior and state precisely that the transition prevents new client registration but does not disable existing clients. | Accurate; no runtime policy redesign | Application lifecycle is not a kill switch                      |
| B      | Make application status disable all referenced clients.                                                                                   | Provides a global kill switch        | New high-impact cross-organization runtime policy outside RD-04 |

**Recommendation:** Option A — document and test the existing behavior; defer any global kill-switch feature.

**Confidence:** High — changed only by a deliberate new product lifecycle decision.
**Hardening:** The challenge rejected the broader shutdown behavior; **Challenger: converged**.
**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-009: “Existing server defaults” are not an exposed contract 🟡 MINOR

**Dimension:** Implicit Assumptions, Testability
**Location:** RD-04 AC-18
**Codebase Evidence:** `packages/server/src/clients/validators.ts:150`; `packages/server/src/routes/clients.ts:70`
**The Problem:** Defaults are private server helpers and vary by client/application type. The SDK
has no defaults operation, so initializing concrete UI values would duplicate server policy.

**Options:**

| Option | Description                                                                                               | Pros                              | Cons                                   |
| ------ | --------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------- |
| A      | Leave optional values unset, label them “Server default,” and display the returned values after creation. | No duplicate policy; cannot drift | Operator does not preview every result |
| B      | Copy exact defaults into the requirement and UI.                                                          | Full preview                      | Creates a second defaults policy       |

**Recommendation:** Option A — it matches AC-18’s intent without adding an endpoint or policy engine.

**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-010: The form and validation contract has small but test-blocking gaps 🟡 MINOR

**Dimension:** Ambiguities, Completeness Gaps, Testability
**Location:** RD-04 AC-08, AC-11, “Validation and supported client values”
**Codebase Evidence:** `packages/server/src/routes/clients.ts:71`; `packages/cli/src/admin/user-service.ts:82`;
`packages/server/src/applications/types.ts:25`; `packages/server/src/clients/types.ts:27`
**The Problem:** The exhaustive create list omits the supported initial confidential-secret label;
scope, individual URL length, and allowed-origin count lack boundaries; and the referenced closed
status sets are absent. Immutable boundary tests cannot be written exactly.

**Options:**

| Option | Description                                                                                                                                     | Pros                                                      | Cons                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| A      | Add confidential-only initial label; 2,048-character URL/scope bounds; 0–10 origins; and explicit application/module/client/secret status sets. | Small, deterministic, consistent with existing validation | Adds local UI limits where the server is looser |

**Recommendation:** Option A — allowing unbounded terminal text was considered and dropped because it contradicts the RD’s safety requirement.

**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-011: Permission and global-scope presentation rules conflict 🟡 MINOR

**Dimension:** Ambiguities, Consistency
**Location:** RD-04 Feature Overview, AC-01, and AC-03
**Codebase Evidence:** `packages/cli/src/admin/presentation.ts:129`; RD-02 established visible-disabled capability affordances
**The Problem:** AC-01 requires visible-disabled unavailable actions, while AC-03 can be read as
hiding them. The overview also says global operations warn about platform scope, but only detail and
destructive confirmations have defined warning placement.

**Options:**

| Option | Description                                                                                                                                         | Pros                       | Cons                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------- |
| A      | Keep unavailable actions visible-disabled with fixed reasons; add a concise persistent Applications scope notice and repeat it in mutation dialogs. | Consistent and unambiguous | Repeats short text in scarce terminal space          |
| B      | Keep scope text only on detail and destructive confirmations.                                                                                       | Less visual repetition     | Create/edit/module operations can lose scope context |

**Recommendation:** Option A — a short workspace notice and concise dialog line are sufficient; no additional warning framework.

**User Decision:** Resolved — User accepted recommendation: Option A.

### PF-012: Module slug uniqueness is described inaccurately 🟡 MINOR

**Dimension:** Consistency, Codebase Alignment
**Location:** RD-04 “Ownership model,” line stating application and module slugs are globally unique
**Codebase Evidence:** `packages/server/migrations/003_applications.sql:24`;
`packages/server/src/applications/types.ts:53`
**The Problem:** Application slugs are global, but module slugs are unique only within their parent
application. The current wording can produce incorrect SDK validators and tests.

**Options:**

| Option | Description                                                                     | Pros                         | Cons |
| ------ | ------------------------------------------------------------------------------- | ---------------------------- | ---- |
| A      | State application slugs are global and module slugs are unique per application. | Matches database and service | None |

**Recommendation:** Option A — this is the only accurate contract.

**User Decision:** Resolved — User accepted recommendation: Option A.

---

## Iteration 2 Verification

PF-001 through PF-012 are verified fixed. The bounded fresh scan found one related but independent
nested-resource integrity gap.

### PF-013: Nested module mutations do not verify their parent application 🟠 MAJOR

**Dimension:** Feasibility Concerns, Edge Cases, Codebase Alignment
**Location:** RD-04 AC-06, “Ownership model,” and Acceptance Criterion 5
**Codebase Evidence:** `packages/server/src/routes/applications.ts:265` and `:295`;
`packages/server/src/applications/service.ts:427` and `:466`;
`packages/server/src/applications/repository.ts:489`; `packages/sdk/src/domains/applications.ts:34`
**The Problem:** Module update and deactivate routes name both an application and module, but the
server discards the application ID and mutates solely by module ID. A mismatched pair can therefore
change a module under another global application while the URL and UI identify the selected parent.

**Options:**

| Option | Description                                                                                                                                                   | Pros                                                                | Cons                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A      | Enforce `(applicationId, moduleId)` atomically at the server mutation boundary, retain both IDs in the SDK, and reject mismatched returned modules in the UI. | Makes the nested contract truthful; prevents wrong-product mutation | Small focused server/repository correction                                                   |
| B      | Validate only in the UI and document the route parent as decorative.                                                                                          | No server change                                                    | Update validation happens after the wrong mutation; deactivate returns no entity to validate |

**Recommendation:** Option A — it mirrors the accepted secret-parent integrity rule and changes only
the two existing module mutation paths.

**Confidence:** High — changed only if Porta deliberately declares nested application IDs decorative.
**Hardening:** The independent challenge strengthened Option A to use an atomic application-scoped
mutation and immutable mismatch tests; **Challenger: converged**.

**User Decision:** Resolved — User accepted recommendation: Option A.

---

## Iteration 3 Verification

PF-013 is verified fixed: RD-04 now requires atomic application/module association at the server
mutation boundary, retains both IDs in the SDK contract, rejects mismatched returned module data,
and includes immutable mismatch acceptance coverage. The direct dependency surface introduced no
new finding.

---

## Current Verdict

**✅ PREFLIGHT PASSED — all 13 findings are resolved and verified.** The scan found no reason to add
a runtime matrix, generalized UI framework, search/pagination UI, multi-operator locking, or
application-wide client shutdown.
