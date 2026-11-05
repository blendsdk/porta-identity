# Ambiguity Register: Admin Service-Account Invitations

> **Status**: ✅ GATE PASSED — all22 items resolved, including two user-approved runtime oracle-fixture corrections
> **Last Updated**: 2026-11-05 10:43
> **CodeOps Artifact Schema**: 1
> **Mode**: auto-design · policy version 1 · root invocation bundle-c-20261104
> **Workflow**: make-plan → exec-plan; user-selected auto-commit for verified feature checkpoints
> **Branch**: plan/admin-service-account-invitations
> **Baseline**: develop at 4b162773377df32c2fbbba0e0aaf18b97265698d

## Planning boundaries

| Boundary          | Authority                                                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Planning target   | Bundle C is issue [#184](https://github.com/blendsdk/porta-identity/issues/184), narrowed to invitation-only Admin API service-account access through client credentials. User explicitly approved the recommended target after the saved bundle mapping proved incomplete.          |
| Context artifacts | The issue, Bundle A's authentication references, existing server/OIDC/client/RBAC code, SDK and CLI authentication, tests, public/technical documentation and CodeOps guidance are read-only context.                                                                                |
| Modification set  | The user first approved the separate planning branch and destination, then approved the recommended Bundle C direction and requested implementation. While the planning gate is blocked, author only this incremental register; implementation follows an executable, approved plan. |
| Destination       | `codeops/features/admin-service-accounts/plans/admin-service-account-invitations/` — explicitly approved in the target-confirmation question.                                                                                                                                        |
| Integration       | Bundle A merged through PR #218 at 89bd2dce; its derived portfolio reconciliation is committed on develop at the baseline above. Bundle C starts after that checkpoint and must remain separate.                                                                                     |

The current objective authorizes progressing Bundle C toward implementation, not carrying Bundle A's
historical delegated design or execution modes into it. Do not change credentials, permission rules,
release workflows, existing requirements or sibling plans. Product authentication and authorization
changes remain limited to the confirmed feature and must follow specification-first execution.
A full plan remains blocked until concrete decisions are resolved and the complete register is
confirmed; approval of recommendations does not invent answers that were not actually proposed.

## Register

| #   | Category                                  | Ambiguity / gap                                                                     | Options / next decision                                                                                                              | User decision / authority                                                                                                                            | Status      |
| --- | ----------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | Scope ambiguities                         | The old plan records A → C → D → E but does not explicitly define C's issue number. | Check the existing authentication references and open issue; request explicit target confirmation.                                   | User selected “Approve #184 planning (Recommended)” after the evidence-backed recommendation.                                                        | ✅ Resolved |
| 2   | Feature gaps / stakeholder conflicts      | Required operations for the first service account.                                  | Invitations only / existing recognized admin roles with their full permission sets.                                                  | User selected “Invitations only (Recommended)”; broader administrative authority is not approved.                                                    | ✅ Resolved |
| 3   | Scope ambiguities / UX & presentation     | Who manages the client-to-account binding, and through which surfaces?              | Authenticated administrators through the existing API, SDK and conventional CLI / server operators through deployment configuration. | User selected “Authenticated administrators”; the question explicitly excluded a new Admin UI.                                                       | ✅ Resolved |
| 4   | Naming & terminology / scope              | Feature, plan destination and separate planning branch.                             | New admin-service-accounts feature and the recorded invitation-focused plan destination.                                             | User selected “Approve #184 planning (Recommended)” on the question naming the feature/destination and separate branch. Approval was discovery-only. | ✅ Resolved |
| 5   | Security / tenancy and delegation         | Target organizations and assignments                                                | Explicit targets and application-qualified allowlists / unrestricted control plane                                                   | User approved the concrete public-contract packet; see AR-16.                                                                                        | ✅ Resolved |
| 6   | Security / management                     | Binding and indirect credential authority                                           | Human Super Admin only / generic client-update rights                                                                                | User approved the concrete lifecycle packet; see AR-15.                                                                                              | ✅ Resolved |
| 7   | Data / account lifecycle                  | Provisioning, classification and restoration                                        | New permanently noninteractive owned user / adopting existing accounts                                                               | User approved new-account-only creation and same-owned-account restoration; AR-15.                                                                   | ✅ Resolved |
| 8   | Technical / token bridge                  | Native token identity and lifetime                                                  | Native opaque model plus server metadata / AccessToken impersonation                                                                 | User approved native300-second ClientCredentials and issuance version; mechanism AR-18.                                                              | ✅ Resolved |
| 9   | Behavior / revocation                     | Issued tokens and secret changes                                                    | Version invalidation and explicit rotation/revocation distinction                                                                    | User approved first-bind/restoration secret retirement and coarse token invalidation on secret revocation; AR-15.                                    | ✅ Resolved |
| 10  | API / SDK / CLI                           | Public binding management contract                                                  | GET/PUT/DELETE subresource and matching SDK/CLI                                                                                      | User approved exact names and input shape in AR-16; wire/error integration AR-19.                                                                    | ✅ Resolved |
| 11  | Data / concurrency / audit                | Atomic changes and attribution                                                      | Existing PostgreSQL transaction/audit patterns / separate coordination system                                                        | User approved transactional storage and dual identity; scoped lock mechanism AR-18.                                                                  | ✅ Resolved |
| 12  | Validation / bounds / abuse               | Concrete policy bounds and rate limits                                              | Bounded explicit policy and strict client-wide counter                                                                               | User approved1–100 target orgs,100 total role pairs,100 total claim pairs,100KiB body and30/hour/client; AR-16.                                      | ✅ Resolved |
| 13  | Naming / minimum surface                  | Role, scope and implementation boundaries                                           | Narrow reserved role and existing permission name / broader role or framework                                                        | User approved porta-invite-service and separately checked admin:user:invite permission/scope; AR-16.                                                 | ✅ Resolved |
| 14  | Evidence / ownership / roadmap            | Plan owner and verification                                                         | Standalone owning requirements, feature roadmap and spec-first gates                                                                 | User approved the concrete contract/planning packet; verification decomposition AR-20.                                                               | ✅ Resolved |
| 15  | Security / concrete lifecycle             | Permanent classification and retained-secret promotion                              | Concrete lifecycle packet / revision                                                                                                 | User selected “Approve lifecycle (Recommended)”; full decision below.                                                                                | ✅ Resolved |
| 16  | Product / concrete contract               | Exact interfaces, live definitions and bounds                                       | Concrete bounded public-contract packet / revision                                                                                   | User selected “Approve contract (Recommended)”; full decision below.                                                                                 | ✅ Resolved |
| 17  | Workflow / authority                      | Technical and commit modes                                                          | --auto-design --auto-commit / no-commit / normal mode                                                                                | User explicitly selected “--auto-design --auto-commit (Recommended)”.                                                                                | ✅ Resolved |
| 18  | Technical / storage and consistency       | Native metadata, JSONB and mutation ordering                                        | JSONB/native opaque metadata/short transaction / normalized graph or wrapper store                                                   | Authority: AI — delegated by --auto-design; complete provenance below.                                                                               | ✅ Resolved |
| 19  | Technical / wire integration              | Error mapping, safe response and existing interfaces                                | Existing route/SDK/CLI patterns / parallel protocols                                                                                 | Authority: AI — delegated by --auto-design; complete provenance below.                                                                               | ✅ Resolved |
| 20  | Technical / delivery and verification     | Phase boundaries, lenses, migration guard and evidence                              | Existing tests/assurance and guarded rollout / new support infrastructure                                                            | Authority: AI — delegated by --auto-design; complete provenance below.                                                                               | ✅ Resolved |
| 21  | Runtime / immutable oracle fixtures       | Three new specification fixture calls mismatch established helper signatures        | Correct only approved calls / keep affected gates blocked                                                                            | User explicitly approved the three fixture-call corrections; no assertion or expected-value change.                                                  | ✅ Resolved |
| 22  | Runtime / immutable oracle fixture status | New migration oracle assumes createTestUser persists a status override              | Initialize requested fixture status through parameterized SQL / keep blocked                                                         | User explicitly selected “Approve status fixture (Recommended)”; preserve the inactive-account assertion and all expected values.                    | ✅ Resolved |

## Initial evidence

These observations describe current behavior, not the proposed security contract.

| Evidence                                                                                                                                                                          | Consequence for discovery                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `codeops/features/cli-automation/plans/invitation-automation/02-current-state.md:27` and `03-03-bulk-invitations.md:18` link Bundle C to authentication but do not name an issue. | The parent recommended #184, then obtained explicit confirmation rather than treating the old mapping as authority.  |
| `packages/server/src/middleware/admin-auth.ts:210–222` uses AccessToken lookup and requires accountId.                                                                            | A client-credentials token is not automatically an Admin API identity.                                               |
| `packages/server/src/middleware/admin-auth.ts:258–318` checks active user, super-admin membership and recognized canonical Admin roles.                                           | Preserve account, tenant and role authority; do not replace them with unrestricted client identity.                  |
| `packages/server/src/lib/admin-permissions.ts:161–179` gives User Admin user deletion, 2FA, role assignment and session revocation as well as invitations.                        | The existing role is broader than the user's invitation-only choice. Exact minimum permission closure is still open. |
| `packages/server/src/oidc/configuration.ts:497–509` enables client credentials with a separately named opaque token model; `:520–529` has no explicit ClientCredentials TTL.      | Verify model lookup and effective lifetime before choosing token mechanics.                                          |
| `packages/server/src/clients/service.ts:571–579` checks current client state during provider client lookup.                                                                       | This alone does not prove already-issued Admin API tokens stop working on client revocation.                         |
| `docs/guide/sdk-node.md:61–68` explicitly warns that client-credentials tokens are not currently accepted by the Admin API.                                                       | Keep current compatibility/documentation truthful until the new boundary is specified and verified.                  |

## Independent initial challenge

Read-only challenger `ses_e59a2c5e6ffeCRykm2ZnZnbsuW` independently inspected the relevant
boundaries. It recommended establishing the minimum required operations before selecting an
authorization policy. It warned that an invite-only role is permanent policy and may omit
permissions genuinely required by invitation workflows; using a broader existing role merely to
avoid that work would nevertheless require explicit acceptance of its full grants.

The challenger also identified token-model lookup, active-client revalidation and effective
ClientCredentials lifetime as unverified boundaries. It made no changes, network calls or
temporary artifacts. This initial challenge does not qualify a future design or implementation.

**Confidence:** High in the inspected boundary observations; the design is intentionally unresolved.
**Hardening:** The parent confirmed the target with the user and retained the authority and
revocation questions rather than inferring a service-token bridge from the existing grant toggle.
**Challenger:** Converged on scope-first discovery; no architecture or security waiver approved.

## Gate and next discovery

All 12 categories were scanned and refined through the explicit concrete decisions below.
The initial scan and approval sequence remain as historical evidence. No item is silently
deferred. Plan authoring is now authorized; product implementation still follows the plan's
specification-first tasks. The portfolio write is deferred until integration into develop.

## Historical sequence — approval of the recommended direction

After receiving the ten-row recommendation table, the user instructed:

> “Porta is becomming a professtional product. Go with the best options possible to implement
> bundle C towards that goal. you have my approval”

This is explicit bulk approval of the concrete recommendations, not activation of auto-design,
auto-commit, a security waiver or approval of unspecified public contracts. The approved target
remains the invitation-only Admin API service-account feature, not a silent substitution with the
existing tenant invitation API. The following approved details refine AR-5–14:

| AR  | Approved recommendation                                                                                                                                                                                                 | Remaining closure before the gate passes                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 5   | Explicit target organizations, no wildcard or super-admin target; application-qualified allowlists for any role/claim pre-assignment.                                                                                   | Specify exact allowlist representation and limits.                                                                                  |
| 6   | Super Admin-only binding management; no management or self-elevation by machine credentials; review indirect authority from secret management.                                                                          | Close secret-management and account-role mutation boundaries.                                                                       |
| 7   | One dedicated real account per confidential client; no ordinary human-account binding or shared accounts; enforce noninteractive login/recovery behavior.                                                               | Verify the minimum provisioning and permanent account-classification mechanism.                                                     |
| 8   | Native opaque ClientCredentials tokens, explicit server-owned binding, invitation-specific scope/control-plane issuer, proposed five-minute lifetime and no refresh tokens; issuance-time authorization version.        | Verify the native issuance/storage hook and specify the scope and version wire shape.                                               |
| 9   | Authoritative revocation for new requests, invalidate older authorization versions after policy changes, no retroactive authority for pre-binding tokens; distinguish overlapping rotation from emergency invalidation. | Specify exact secret revocation and in-flight authorization behavior.                                                               |
| 10  | Small client-binding read/create-or-replace/revoke subresource through API/SDK/conventional CLI; reuse invitation semantics; no Admin UI, bulk framework or secret-returning read.                                      | Specify exact endpoint, input/output, error and CLI contracts.                                                                      |
| 11  | PostgreSQL transactions and constraints; binding mutation and durable audit together; client/account/target/version attribution without secrets; no separate coordination system.                                       | Specify authorization/revocation ordering and deletion effects.                                                                     |
| 12  | Bounded inputs, strict authority/counter failures, preserve existing endpoint protections; use the existing 30/hour invitation limit as the starting reference and add a client-wide ceiling.                           | The previous recommendation explicitly left concrete numeric bounds and throughput for confirmation; no extra numbers are inferred. |
| 13  | Narrow canonical role proposed as porta-invite-service; reuse admin:user:invite as the operation permission; focused implementation without new dependencies, workers or generalized platform.                          | Specify the OAuth scope separately and verify role seeding/permission integration.                                                  |
| 14  | Standalone owning requirements, immutable specification-first tests, negative/security/revocation/audit/abuse coverage, relevant assurance and packed compatibility, public/maintainer docs.                            | Confirm precise verification selectors and new feature-roadmap creation; plan not yet executable.                                   |

At this point in discovery those remaining items were concrete subquestions, not new features.
They kept the original groups open until the later exact user decisions and delegated mechanisms
below closed them. No user choice is inferred from the general professionalism goal.

## Native token diagnostic and concrete lifecycle challenge

On2026-11-04 the parent ran a scratch-free, in-memory diagnostic against the installed real
oidc-provider. The probe generated an ephemeral ES256 key in memory, used a memory adapter, and
printed no tokens, secrets or keys. The final assertions passed:

- Native ClientCredentials save invokes the asynchronous extraTokenClaims hook.
- Account, binding and authorization-version metadata survive opaque persistence and lookup.
- An explicit300-second expiry and invitation scope are preserved.
- The same artifact is not accepted by AccessToken lookup; native destroy invalidates it.

Two initial probe attempts stopped before the assertions: the diagnostic key needed extractable
export, then the synthetic client needed explicit ES256 metadata. These were probe-construction
errors, not product verification failures. This evidence qualifies native model mechanics only,
not the real token endpoint, production adapters, issuer routing or revocation races.

Source confirmation: `node_modules/oidc-provider/lib/models/formats/opaque.js:40–42` awaits the
native extra-token hook; `models/client_credentials.js:11–17` persists extra metadata but no
top-level accountId; `models/base_token.js:43–74` selects model-specific TTL.
Porta's hybrid adapter also already checks current client/user/grant authority against PostgreSQL
(`packages/server/src/oidc/adapter-factory.ts:87–125,204–209`). The new binding/version checks
must complement that existing protection, not assume no live-authority checks exist today.

Independent challenger `ses_e591a7176ffefaqtn1VJ8QTJH7` reviewed the concrete account/credential
boundary without inspecting the parent's provider-hook work. It recommended a permanent internal
user flag and atomic provisioning of a new dedicated real account during explicit binding
creation; no adoption of an existing human user. Ordinary authentication, recovery and mutation
paths need direct checks, including artifact consumption and persistence, not merely UI hiding.

The challenger identified retained pre-binding secrets as an authority-promotion risk: an existing
App Admin secret holder could otherwise gain the newly attached service authority. It recommends
retiring all old secrets during first binding or restoration, then generating the replacement
through the existing secret operation under Super Admin control. This disruptive choice required
the explicit confirmation subsequently recorded in AR-15. Generic role assignment,
human-token use of the reserved service role, and bound-client mutations need matching guards.

Its alternative permanent owned-account table is viable but does not remove the cross-cutting
authentication checks. It classified the narrow flag, guards and transaction controls as direct
feature security controls, not a generalized identity system. New account registries, conversion
workflows, per-secret token-lineage frameworks or credential-management frameworks remain excluded.

**Confidence:** High in native model mechanics and the cited credential/account risks; full
endpoint, production and concurrency qualification remain required. **Hardening:** Independent
challenge exposed secret promotion and permanent classification requirements before any product
implementation or executable plan was written. No files, services or containers were created by
the diagnostic or challenger.

## AR-15–17 — Exact user decisions closing discovery

**Authority:** User, through the question tool after the concrete security challenge.

**AR-15:** The user selected “Approve lifecycle (Recommended)” for the complete packet:
explicit binding creation atomically provisions a new real account in the super-admin organization;
permanent internal service classification; no existing-human adoption; one owned account per
confidential client; no human login/recovery/password setting or generic role changes; only human
Super Admin binding/client/credential mutations. First binding or restoration retires all old
client secrets; fresh secret generation remains a separate existing operation. Revocation disables
binding/account; restoration reuses only its same owned account with a fresh version and secret
retirement. Ordinary overlapping secret generation preserves tokens; explicit secret revocation
invalidates all earlier machine tokens for that client. The user was warned that promotion disrupts
pre-binding consumers. Previously approved non-retroactivity means committed invitations and
post-commit email are not recalled by later revocation.

**AR-16:** The user selected “Approve contract (Recommended)” for:
GET/PUT/DELETE `/api/admin/clients/:id/service-account`; secret-free metadata; PUT creates or
fully replaces policy; idempotent DELETE revocation. Initial accountEmail is required and then
immutable. Targets contain organizationId, allowedRoles(applicationId,roleId), and
allowedClaimDefinitions(applicationId,claimDefinitionId). Bounds:1–100 distinct non-control-plane
organizations; at most100 role pairs and100 claim-definition pairs over the whole policy; existing
100KiB request body. Reject wildcards, duplicates and canonical Admin-application assignments.
Allowlisted identities use live application definitions, not frozen permission snapshots.
Strict30/hour/client across targets; preserve existing Admin/token limits; separately require
permission and scope admin:user:invite;300-second native machine tokens. SDK names:
clients.getServiceAccount/setServiceAccount/revokeServiceAccount. CLI namespace:
client service-account get/set/revoke, with --email and bounded --policy-file for set.
Create the feature roadmap, standalone owning requirements and specification-first plan.
No other Admin operations, Admin UI, new dependency or infrastructure is approved.

**AR-17:** The user explicitly selected “--auto-design --auto-commit (Recommended)”, with the
question explaining eligible technical delegation and commit/push of verified feature checkpoints.
Root invocation: bundle-c-20261104; policy1; make-plan → explicitly invoked exec-plan. Reserved
scope/security policy, credentials, risk acceptance, compatibility breaks, destructive actions and
publication remain user-owned. No merge, release or issue-state mutation is authorized.

## AR-18 — Scoped persistence and native authority mechanisms

- **Authority:** AI — delegated by --auto-design; policy1; root bundle-c-20261104.
- **Eligibility/objective:** Implement AR-15/16's fixed lifecycle and authority without another
  token store, identity platform or coordination layer.
- **Decision:** One client_service_accounts table with unique client/account ownership, UUID
  binding/version, validated native JSONB policy and active/revoked state; permanent internal
  users.is_service_account boolean, false for all existing users. Native opaque extra metadata
  carries the account/binding/version; malformed/missing metadata grants nothing. Authoritative
  feature checks complement existing hybrid-adapter checks. Account loss retains the same revoked,
  non-restorable row with nullable owner and no deleted account PII (PF-009). Mutations lock client → binding →
  account consistently; invitation authorization holds the relevant conflicting locks through
  invitation/audit commit, never through SMTP. Use the existing transaction owner and after-commit
  delivery, not another transaction abstraction. Separate small queries are preferable to an
  optimizer-dependent multi-row lock order. Policy replacement and effective lifecycle changes
  mint an unpredictable fresh UUID version; no token enumeration or per-secret lineage store.
- **Evidence:** Native probe above; adapter-factory.ts:87–125; lib/database.ts:73–92;
  users/invite-service.ts:317–381; user-role-service.ts:215; clients/service.ts:571.
- **Rejected alternatives:** Normalized target/assignment graph adds tables without a demonstrated
  query need; wrapper tokens duplicate native expiry; status-only classification re-enables human
  authentication after unbinding; no-lock invitation checks can race durable revocation; SMTP-held
  locks let external email latency block authority changes.
- **Strongest counterargument:** JSONB cannot enforce each reference by foreign key. Validate
  complete updates and every requested assignment against live definitions; stale references
  never become wildcards or silent policy repair.
- **Confidence/hardening:** High in the bounded mechanism; independent challenger
  ses_e591a7176ffefaqtn1VJ8QTJH7 converged on JSONB/native metadata/short commit-bound locking.
  Native HTTP and concurrency specifications remain mandatory evidence, not assumed passes.
- **Reopen triggers:** Native hook cannot bind the trusted issuer, inconsistent lock order,
  concurrency violation, or a need for generalized state/repair machinery.

## AR-19 — Compatible route, SDK and terminal integration

- **Authority:** AI — delegated by --auto-design; policy1; root bundle-c-20261104.
- **Eligibility/objective:** Implement the exact newly approved subresource through established
  envelope, validation and command patterns without changing existing contracts.
- **Decision:** Route id is the internal client UUID. GET/PUT use `{data: binding}`; binding fields
  are id, clientId(internal UUID), serviceAccountId, accountEmail, status, targets, createdAt and
  updatedAt. No secret, token or authorization version is exposed. PUT returns201 on initial
  provisioning and200 on replacement/restoration; accountEmail may be omitted afterwards or match
  the original case-insensitively, never select another account. DELETE returns204 for absent or
  already revoked bindings on an existing eligible client; missing client is404. GET missing
  binding is404; a retained lost-owner marker makes GET/PUT409 and DELETE204 without erasure.
  SDK unwraps the data object. CLI policy-file is UTF-8 JSON `{targets:[...]}`,
  at most100KiB; set adds --email as accountEmail when supplied. Validate complete local input
  before constructing the SDK client; mutations are direct explicit commands, without automatic
  mutation retries, new confirmation workflow or persistent credential/report files.
- **Errors:**400 fixed validation message,401 existing invalid-authentication boundary,403 fixed
  authorization denial,404 fixed missing-resource message,409 fixed account-ownership/lifecycle
  conflict; recognized dependency outages503, unexpected defects sanitized500. Preserve413/429
  and existing human/JSON CLI exit/error contracts. No raw paths, input, SQL, causes or secrets.
  Admin clients must be active, confidential and control-plane-owned with client_credentials;
  no implicit conversion of a tenant or public client. The reserved role contributes no human
  AccessToken authority, and machine authorization never unions other account roles. Other
  assigned roles make a dedicated service principal fail closed.
- **Evidence:** routes/clients.ts:99–149,257–261; SDK clients.ts:122–146,167–187;
  CLI client.ts:137–158; Bundle A's error-format and bounded-input conventions; server.ts:156–158.
- **Rejected alternatives:** New authentication/management namespace duplicates existing clients;
  broad User Admin grants violate AR-2; modifying ordinary token models breaks the proven class
  boundary; raw errors and unknown-field passthrough weaken closed validation.
- **Strongest counterargument:** Reusing clients adds guards to existing paths. Limit guards to
  permanently service-owned accounts and feature-bound clients; leave ordinary clients unchanged.
- **Confidence/hardening:** High in route/SDK/CLI fit; inherited independent challenge requires
  service-role and credential guards at authoritative mutation boundaries, not cached route checks.
- **Reopen triggers:** An existing response/exit changes, metadata leaks secrets, or a new required
  public capability is discovered.

## AR-20 — Verification, migration and phase decomposition

- **Authority:** AI — delegated by --auto-design; policy1; root bundle-c-20261104.
- **Eligibility/objective:** Sequence approved work and qualify its security with existing tools.
- **Decision:** Four dependency-ordered phases: schema/policy; permanent account/lifecycle guards;
  native OAuth/Admin invitation integration; SDK/CLI/docs and end-to-end qualification. Each has
  independent spec authors, intended red, implementation/green, implementation tests, verification,
  correctness review and risk-selected security/concurrency review. Domain lenses: web application,
  distributed/concurrent and data/migration; no compiler/financial evidence.
- **Verification:** Start with pnpm test:changed; use scoped workspace lint/typecheck/build plus
  relevant unit/integration/E2E tests and structure before verified commits. Authentication/shared
  boundaries require pentest and production-security harness. SDK/CLI require registered packed
  compatibility from clean commits. CI pnpm verify, UI and OIDC harness must pass before completion.
  Coverage: core90%, support80%, glue60%. Use existing tests/harness, not a new runner. Exact commands
  and registered selector coverage are owned by07-testing-strategy after it is authored.
- **Migration:** Add037 without rewriting applied files; upgrade all incompatible HTTP and recovery
  worker processes before provisioning any service account. Older binaries are not safe once flags
  exist. Refuse schema downgrade while any flagged user OR binding/ownership marker exists,
  including revoked/inactive users;
  do not reinterpret them as humans. No new deployment switch or global setting. Existing portability
  excludes the control-plane organization (portability/repository.ts:242), so no new export format.
- **Specialists:** None. Generic spec authors and correctness/security reviewers with bounded
  protocol/tenancy/migration packets cover the invariants; no unique recurring capability gap
  justifies a standing agent, routing edit or support framework.
- **Evidence:** AGENTS.md verification/cleanup rules; package.json:23–35,52–64;
  server vitest.config.ts project selectors; native probe and independent challenge above.
- **Rejected alternatives:** Full local verification per tiny task violates the narrow-run policy;
  skipping security gates or relying on model-only probes is insufficient. New orchestration,
  general account-kind registries or per-secret token lineage have no approved necessity.
- **Strongest counterargument:** Four phases touch shared identity boundaries; avoid exposing the
  management route until account guards and machine authorization are ready. Intermediate code
  remains inaccessible through public routes.
- **Confidence/hardening:** High in ordering and existing tooling; standalone immutable tests,
  actual production gates and independent reviews must establish behavior. No fixture independence
  or full assurance coverage is credited before observation.
- **Reopen triggers:** A command reaches protected operator credentials/configuration, old-process
  coexistence cannot be excluded, assurance lacks the needed direct observation, or expanded
  infrastructure/retention policy becomes necessary. Respect exact-path approvals before any
  protected-file access; do not weaken permissions or test assertions.

## AR-21 — Runtime oracle fixture-call correction

**Authority:** User; explicit question-tool answer “Approve fixture calls (Recommended)” on
2026-11-05. The new schema migration/reader oracles called existing createTestRole and
createTestClaimDefinition with an object, while their established signatures require an application
ID string (tests/integration/helpers/factories.ts:326–330,411–415). The first migration run passed
15 schema cases but five migration cases failed at fixture setup before their feature assertions.
No failure was treated as a pass. The user approved exactly three call-site corrections in
schema.migration.spec.test.ts and schema.reader.spec.test.ts, with no assertion, expected result,
existing helper or product behavior change. Preserve the original oracle identities, reseal the
authorized files, and rerun affected gates. Changing production helpers to accept the incorrect
test calls was rejected because it changes an established interface to hide test setup failure.
No broader test rewrite or relaxation is authorized. Reopen on any required expectation change.

## AR-22 — Runtime inactive-account fixture initialization

**Authority:** User, explicit question-tool answer “Approve status fixture (Recommended)” on
2026-11-05. After AR-21's exact call corrections,19/20 migration/schema cases passed. The remaining
failure showed that createTestUser's InsertUserData has no status input; the new oracle's status
override therefore left its purported inactive user active. Approved correction: create the
ordinary user normally, then set the requested fixture status through parameterized SQL before
baseline data is recorded in schema.migration.spec.test.ts. The inactive-account downgrade
assertion and every expected value remain unchanged. Changing existing user creation behavior
to accommodate the mistaken fixture was rejected as unrelated product/harness expansion.
Preserve prior seals, record the authorized setup delta, and rerun all affected gates. No broader
oracle rewrite or weakened assertion is authorized.

## Preflight correction rulings — amendments to AR-18–20

**Authority:** AI — delegated by --auto-design. **Policy:**1; **root:**bundle-c-20261104;
parent make-plan → preflight → make-plan correction. These are necessary mechanisms and sequencing
inside AR-15/16, not new capabilities, ownership policy, accepted risk or larger support surfaces.
The original decision alternatives/evidence remain above; PF-001–009 preserve defect provenance.

Independent challenger ses_e58e20ab6ffeQxNa5iww6mtekV confirmed all seven major root causes and
converged on the choices below. It specifically preferred proven-secret-ID revalidation over
adding binding admission work to credential validation. Native model feasibility does not qualify
the HTTP interleavings. Scope remains the newly authored feature plan and eventual authorized
product implementation, not sibling artifacts or original protected operator configuration.

| Finding / amendment  | Selected mechanism                                                                                                                                                                                                | Viable alternative rejected / strongest counterargument                                                                                                                                                    | Decisive evidence / reopen trigger                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| PF-001 / AR-20       | Keep parser/schema/read oracles in Phase1; durable replacement ST-61 in Phase2; version invariants ST-25 there and actual usable-token outcomes ST-62 in Phase3.                                                  | Bringing writes/tokens forward is viable but enlarges the first checkpoint without need; independent state tests alone cannot prove formerly usable tokens fail.                                           | invite-service.ts:203–232; original phase implementation boundaries. Reopen if a green gate still requires absent later behavior.                  |
| PF-002 / AR-20       | Explicit independent packed ST-57 oracle and focused live driver/collector/validator, integrated into existing compatibility selector with separate feature evidence.                                             | A separate focused invocation is viable but unnecessary when the current selector already owns prepared consumer/provenance/cleanup; selector broadening must not overwrite credential-isolation outcomes. | assurance/compat/command.ts:229–257, consumer.ts:278–320;03-04 owns exact files. Reopen if cleanup or evidence taxonomy cannot remain independent. |
| PF-003 / AR-18       | Eligibility loss atomically revokes binding/account and changes version; ordinary repair cannot restore authority.                                                                                                | Requiring explicit revoke first adds a new operator prerequisite to ordinary client lifecycle; automatic revocation must still validate the resulting authoritative configuration under lock.              | clients/service.ts:333–405,508–542. ST-66 must prove repair stays revoked.                                                                         |
| PF-004 / AR-19       | CLI JSON revoke is exactly clientId/internal UUID plus status/revoked, repeated success identical.                                                                                                                | revoked:true is viable but diverges from binding-status terminology without benefit.                                                                                                                       | cli/output.ts:71–72 and ST-51; reopen on any incompatible observed envelope.                                                                       |
| PF-005 / AR-19       | Preserve ordinary human text, existing control/invisible replacement, JSON-escaped original values.                                                                                                               | Reversible human escaping is a new protocol and contradicts the approved existing sanitizer.                                                                                                               | cli/output.ts:28–40,71–72 and ST-52.                                                                                                               |
| PF-006 / AR-18       | Retain actual outer adminMutationAudit transaction owner; exact trusted machine-actor branch, no synthetic adminUser; finalize delivery result after actual outer commit/SMTP.                                    | Exact-operation self-management is viable but duplicates ownership and raises regression cost; no new general callback framework is needed.                                                                | middleware/admin-mutation-audit.ts:49–70, database.ts:73–92, invite-service.ts:390–395. ST-67 full createApp evidence required.                    |
| PF-007 / AR-18       | Preserve exact modern/legacy proven secret ID in raw-request-keyed WeakMap; bind to client/issuer; revalidate ownership/status/expiry under client lock before deriving metadata.                                 | Atomic epoch capture is viable but adds binding work to the earlier bridge; outer ctx.state cannot cross native context replacement.                                                                       | client-secret-hash.ts:173–184,206–216; server.ts:470–473,579. ST-63 must prove no privilege promotion while preserving ordinary handoff.           |
| PF-008 / AR-18       | Exclude classified users in both existing bulk lock/update SQL predicates; concealed denial and ordinary partial results retained.                                                                                | Shared assertion is viable but adds indirection without replacing the two necessary predicate checks.                                                                                                      | lib/bulk-operations.ts:115–143,228–244; ST-64.                                                                                                     |
| PF-009 / AR-18/19/20 | Same revoked binding row retains client ownership after physical user deletion, owner FK null and policy empty, no deleted account PII; GET/PUT409, DELETE204; downgrade refuses surviving rows as well as flags. | A minimal client marker is viable but adds another ownership field; same row already distinguishes lost ownership. A nullable FK alone is insufficient without explicit revocation/version coupling.       | users/service.ts:793–824 and repository.ts:948–953. ST-65 verifies no reassignment or marker-erasing downgrade.                                    |

**Confidence:** High in root causes and bounded corrections; medium-high in credential transport
pending real HTTP evidence. **Hardening:** Five independent partition audits, one blind consolidated
challenger and source checks precede these rulings. No finding is waived or dismissed. The owning03,
07 and99 documents must agree before a bounded iteration2 verification can qualify the plan.
The original broad source hash is retained in the report; corrected-content identity is recorded
only after all corrections. Any new product-policy consequence or support escalation reopens the
gate and stays user-owned. No immutable specification files exist yet, so these are pre-oracle
plan corrections, not changes to a failing test's expected behavior.
