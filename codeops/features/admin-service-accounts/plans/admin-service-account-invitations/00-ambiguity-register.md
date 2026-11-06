# Ambiguity Register: Admin Service-Account Invitations

> **Status**: ✅ All40 decisions resolved; Phase3 assurance green, final CI/cleanup pending
> **Last Updated**: 2026-11-06 03:20
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
| 23  | Runtime / migration consistency           | SA-1-001 downgrade checks can miss uncommitted classification/ownership             | Early exclusive table fence with fresh snapshot / weaker write fence and later upgrades                                              | AI — delegated by --auto-design; independent challenge and complete technical ruling below. No risk waiver.                                          | ✅ Resolved |
| 24 | Runtime / authorization consistency | Lifecycle actor validation and existing organization/user lock ordering | Authoritative post-lock snapshot / stronger organization→actor serialization | AI — delegated by --auto-design; independent challenge and narrow mechanism recorded below. | ✅ Resolved |
| 25 | Runtime / regression fixtures | Older ordinary-human/unbound-client unit mocks omit new authority reads | Explicit external boundary fixture extensions; preserve old specification assertions | AI — delegated by --auto-design; independently challenged narrow correction, no risk waiver. | ✅ Resolved |
| 26 | Runtime / existing HTTP and reserved role integrations | Independent Phase2 review finds actor forwarding and reserved-role bypass gaps | Narrow existing-route propagation/error mapping and existing canonical/invitation guards | AI — delegated by --auto-design; necessary approved-contract corrections, verification/re-review pending. | ✅ Resolved |
| 27 | Runtime / sealed HTTP observation order | Secret verification writes its own valid system audit after the mutation | Move unchanged mutation-audit assertion before independent credential verification | User explicitly approved the exact assertion reorder; no expected value or assertion removed/changed. | ✅ Resolved |
| 28 | Runtime / older internal call shapes | Two older specifications omit newly required actor/application arguments | Extend exact call assertions and ordinary INSERT fixture only | User explicitly approved these two named specification updates and reaffirmed --auto-design --auto-commit. | ✅ Resolved |
| 29 | Runtime / verification temporary path | Long task path exceeds Linux Unix-socket address limit before harness startup | Command-scoped short temporary root; no product/harness changes | User explicitly approved /tmp/opencode/bc-c-0f9cb04b for sockets, leases and caches with complete cleanup. | ✅ Resolved |
| 30 | Runtime / CI test environment wiring | Turbo-filtered outer TEST variables are absent in integration/pentest workers | Pass already-derived URLs through existing env blocks; keep sealed isolation guards | AI — delegated by --auto-design; three-field test-runner correction, no workflow/product/oracle change. | ✅ Resolved |
| 31 | Runtime / exact cleanup ownership | Two anonymous volumes lack retained run labels after harness teardown | Preserve unless ownership confirmed; remove only exact unused resources | User explicitly confirmed both named volumes belong to this run and authorized removal. | ✅ Resolved |
| 32 | Runtime / delivery observation mechanism | Truthful machine acknowledgement must not reinterpret existing human/tenant transport results | Default-off internal acknowledgement reporting, enabled only for validated bound-account invitations | AI — delegated by --auto-design; challenged narrow mechanism preserves approved result/access policy. | ✅ Resolved |
| 33 | Runtime / oracle interface coordination | Counter failure isolation, exact audit projection and genuine credential barrier need fixed interfaces before authoring | Purpose key builder, closed flat audit metadata and existing real HTTP bridge seam | AI — delegated by --auto-design; independent challenge converged on focused existing-pattern mechanisms. | ✅ Resolved |
| 34 | Runtime / frozen management fixture mismatch | Two requests replace two-target setup with one target while asserting original policy | Send original fixture policy in only these two requests; retain every assertion | User explicitly approved the named file/two request-body corrections, resealing and rerun. | ✅ Resolved |
| 35 | Runtime / valid JSON preservation | Global parser rejects valid nested __proto__ data before machine validation | Exact-route existing parser/auth/audit composition, fresh post-parse identity, preserved human precedence/aliases | AI — delegated by --auto-design; independently challenged internal mechanism, no public/security policy change. | ✅ Resolved |
| 36 | Runtime / remaining assurance temporary path | Normal task path exceeds Unix-socket length limit | Exact short temporary root for remaining Bundle C harness sockets/leases/caches; per-run cleanup | User explicitly approved /tmp/opencode/bc-c-20261105 for this purpose; fixture/TLS approval scope unchanged. | ✅ Resolved |
| 37 | Runtime / post-lock credential expiry | RV-3-001/SA-3-001 use transaction-start time after a parent-lock wait | clock_timestamp() in the existing exact-secret predicate, retaining locks and strict expiry | AI — delegated by --auto-design; independent challenge selects current row-evaluation DB time, no policy change. | ✅ Resolved |
| 38 | Runtime / native expiry at locked admission | SA-3-002 can retain a pre-wait validity result after token expiry | Trusted native exp on existing request-only principal; strict post-wait and final-admission checks | AI — delegated by --auto-design; independently challenged bounded mechanism, no wrapper/store/new policy. | ✅ Resolved |
| 39 | Runtime / sealed delivery audit observation | Global before/after audit snapshot can include another invitation's unawaited write | Count `email.send.invitation` rows for this case's own invitationId; same 1/0 invariant | User explicitly approved the named file/observation change, reseal and gate rerun; no product change. | ✅ Resolved |
| 40 | Runtime / sealed unencodable-request fixture | First overflow depth of the test's own stack is encodable in the server handler on CI | Grow the same nested request to the largest failing power-of-two depth within 100 KiB | User explicitly approved the named file/input-construction change; assertion 400/no-effects unchanged. | ✅ Resolved |

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

## AR-23 — Runtime atomic downgrade refusal

- **Authority:** AI — delegated by --auto-design; policy1; root bundle-c-20261104; exec-plan.
- **Eligibility/objective:** Enforce the already-approved refusal to erase any surviving service
  classification or client ownership. This changes a migration consistency mechanism, not product
  authority, retention policy, external action permissions or compatibility promises.
- **Decision:** Before destructive work, reject transaction isolation other than READ COMMITTED.
  Acquire ACCESS EXCLUSIVE on client_service_accounts, then users, before the existence check,
  using separate top-level SQL statements and holding both through DOWN's transaction. Recheck
  after lock waits with a fresh READ COMMITTED snapshot. Preserve existing refusal text and all
  immutable assertions. Reproduce flag-only and marker-only races with two connections, then prove
  intended refusal rather than generic deadlock/timeout rejection; test higher-isolation rejection.
- **Evidence:** Migration037's current pre-check precedes destructive DDL. Existing migration024
  already fences validation with a transaction-held table lock. src/lib/migrator.ts:25–38 supplies
  no isolation override. Installed node-pg-migrate migrationBuilder.js:674 defaults transactions on;
  migration.js:139–148 wraps each default migration in BEGIN/COMMIT; runner.js:152–162 also supports
  whole-run transactions. Neither silently establishes a fresh snapshot under higher isolation.
- **Rejected alternatives:** SHARE ROW EXCLUSIVE also excludes writes but later DROP/ALTER must
  upgrade locks and may deadlock with readers; a cooperative advisory fence adds writer integration
  without need. Maintenance advice alone does not enforce refusal. Silently changing isolation or
  relying on SERIALIZABLE is not a sound stale-snapshot guard.
- **Strongest counterargument:** Early exclusive locks block users-table reads even when DOWN
  refuses. DOWN already needs those locks to erase schema, and it is a maintenance operation.
  Reverse-order writer transactions can still produce a safe operation failure; never retry away
  a deadlock or mislabel it as the intended existence refusal.
- **Confidence/hardening:** High static confidence. Blind challenger
  ses_e54acc8caffeH4WMMcL0Gvuw94 converged on binding→users exclusive locks and explicit isolation
  refusal, and identified no reserved-policy decision. Actual runtime reproduction/green and the
  one scoped security re-review remain required; this ruling is not fix verification.
- **Reopen triggers:** Runner transaction behavior differs, concurrent regression cannot establish
  its blocking barrier/intended refusal, unexpected writer ordering causes material failure, or
  a larger fencing framework becomes necessary. No new infrastructure or existing-oracle rewrite.

## AR-40 — User-approved unencodable-request fixture depth

- **Authority:** User selected “Deepen the fixture (Recommended)” after the exact sealed file, the
  failing assertion, the stack-dependent input construction and the unchanged 400/no-effects
  invariant were shown. This is a fixture-construction change, not a product or policy decision.
- **Evidence:** The helper doubled an array nesting depth until this test process's own
  `JSON.stringify` threw, then sent that exact body. The server handler runs with a different
  remaining stack, so on CI it still encoded the value and correctly returned 201; the assertion
  expected 400 from the test process's boundary. The same test failed on the earlier checkpoint, so
  this is not a correction regression. Local runs consistently overflowed at the selected depth.
- **Decision:** After the shape first fails locally, keep growing it through power-of-two depths
  while the complete request stays within the existing 100 KiB limit, and send the largest failing
  depth (~32k, well beyond any handler stack). The assertion remains 400 with no invitation, user,
  audit or mail effects; the positive 1024-depth preservation case is unchanged.
- **Boundary:** No product file, error mapping, byte limit, assertion meaning or other oracle
  changes. The prior seal is superseded with exact provenance; all other seals stay unchanged.
  Qualification requires the case to pass alone, the file to lint/typecheck and the final CI to pass.

## AR-39 — User-approved scoped delivery audit observation
- **Authority:** User selected “Approve scoped check (Recommended)” in this conversation after the
  exact sealed file, the failing assertion, the asynchronous-write root cause and the unchanged
  1/0 invariant were shown. This is a verification-observation correction, not a product change.
- **Evidence:** `sendInvitationEmail` records `email.send.invitation` without awaiting the insert.
  The sealed delivery oracle compared global before/after audit ID sets. Under the authoritative
  full gate, the control invitation's insert landed between those snapshots, so a rejected-only
  case observed one “new” success audit (assertion line80: expected0, received1). The product path
  returns before recording a success audit for rejected/unknown acknowledgements, so this is an
  observation race, not a delivery defect.
- **Decision:** Replace the global snapshot with a count of `email.send.invitation` rows whose
  `metadata->>'invitationId'` equals the case's own committed invitation ID. The sent case must
  still have exactly1 such audit and failed/unknown cases exactly0; the transport-rejection case
  still requires0. The personal-message/leak checks are unchanged. Re-seal with a supersession
  record and rerun the full gate.
- **Rejected alternative:** Awaiting the product audit write would change ordinary human/tenant
  delivery timing and could misclassify an already-sent email when the best-effort audit fails.
- **Boundary:** No product file, assertion meaning, other oracle or ordinary behavior changes.
  The prior seal is superseded with exact provenance; all other invitation seals stay unchanged.
  Qualification requires the corrected file to pass alone and within a complete strict root gate.

## AR-38 — Native expiry at locked dispatch admission

- **Authority/eligibility:** AI — delegated by --auto-design; policy1; root bundle-c-20261104;
  necessary correction of SA-3-002 under the existing strict300-second native expiry contract.
  No new access policy, continuous-validity promise, persisted identity field or support surface.
- **Decision:** Carry only readonly tokenExpiresAt epoch seconds from finite validated native exp
  on the existing request-only AuthenticatedServiceAccount principal. Keep the persisted identity
  namespace exactly the three UUIDs; never accept expiry from input/header/identity extras. After
  awaited authentication authority acquisition, recheck strict expiry before returning the principal;
  expired authentication returns null. Preserve the existing native lookup and initial checks.
- **Final admission:** After both requireServiceAccountAuthority and authorizeServiceAccountInvitation
  finish inside the existing transaction, compare trusted expiry again immediately before invoking
  the feature counter. That second helper also awaits potentially blocking definition checks, so
  checking earlier is insufficient. Expired admission returns the established fixed401, not403.
  Preserve trusted expiry when replacing the principal's live authority in the handler; fresh
  post-upload authentication must still replace parser-selection state rather than reusing it.
- **Clock/boundary:** Require exp > Date.now()/1000; equality rejects. This follows the native
  application clock, not PostgreSQL transaction time. Do not recompute lifetime, clip TTL, add grace
  or margins, retry, or require validity through later counter I/O/persistence/COMMIT/SMTP. Already
  admitted/committed invitations are not cancelled or recalled on later expiry.
- **Evidence:** authentication.ts:46–55 checks before awaited authority; admin-invitations.ts:30–40,
  109–126 reacquires and awaits authority/reference checks before counter without retained expiry.
- **Rejected alternatives:** Retaining the whole native model is viable but exposes/couples more
  state and is not a fresh revocation lookup. Another lookup inside locked dispatch needs extra
  provider/token context and dependency I/O yet still needs a post-await expiry comparison. Checking
  only after authentication misses the later dispatch wait. Reordering owners/holding auth locks
  across upload breaks AR-35 without eliminating the need for current admission time.
- **Strongest counterargument:** A second validity representation could be dropped or misused.
  Limit the primitive to elapsed-time checking, preserve native validation and explicitly test the
  principal handoff and both waits. No raw token/model/callback or lineage store is carried.
- **Confidence/Hardening:** High. Independent challenger ses_e521d4fdaffeMPjupXMk1qc0H0 recommends
  this smallest mechanism and confirms eligible scope. Source-free full-app post-upload and later
  dispatch lock regressions, exact equality, unexpired positive controls and no effects must show
  intended red before implementation, then green and the single scoped security re-review.
- **Reopen triggers:** Need for new token wrapper/store, raw-token propagation, generalized callback,
  continuous validity, different expiry policy or additional provider context/lookup machinery.

## AR-37 — Current PostgreSQL time for exact proof expiry

- **Authority/eligibility:** AI — delegated by --auto-design; policy1; root bundle-c-20261104;
  necessary internal correction for the already-approved post-lock exact-credential expiry contract.
  RV-3-001 and SA-3-001 are the same root cause, not two independent correction designs.
- **Decision:** Replace only NOW() with clock_timestamp() in the existing post-lock exact-secret
  expiry predicate. Keep strict >, nullable expiry, exact row/client/status, lock order, transaction,
  native model, TTL and error mapping unchanged. No expiry margin, clipping, retry or new store.
- **Evidence:** The transaction starts before parent locking (lib/database.ts:73–84); the later
  credential query (service-accounts/tokens.ts:40–49) must not use that earlier timestamp.
- **Rejected alternatives:** statement_timestamp() fixes the reported parent wait, but is captured
  before any delay inside the new statement. One exact row needs no statement-wide consistency;
  clock_timestamp() observes time at comparison for the same one-expression cost. Node comparison
  adds cross-clock/precision concerns; restarting the transaction releases required locks. Existing
  ordinary credential selectors also use transaction time and cannot replace exact proof validation.
- **Boundary/counterargument:** Statement time is viable and was the initial review recommendation.
  Current comparison time is stronger at equal cost. Neither choice guarantees continued credential
  validity through later commit/native persistence/HTTP delivery; the approved admission point is
  the locked exact-secret check, not continuous expiry or cancellation of committed work.
- **Confidence/Hardening:** High. Independent blind challenger ses_e521d4fdaffeMPjupXMk1qc0H0
  confirms eligibility and recommends this bounded option. Real modern/legacy Basic/POST red/green,
  future/NULL expiry controls and the single scoped re-review remain required; static ruling is
  neither a gate pass nor a waiver.
- **Reopen triggers:** Need for application-clock comparison, expiry margins, extra locking,
  transaction restart, changes to ordinary helpers or a new continuous-validity policy.

## AR-36 — Remaining Bundle C assurance temporary root

- **Authority:** User selected “Approve short path (Recommended)” after the exact path/purpose and
  per-run cleanup were named. This is a workspace-hygiene exception, not a native permission bypass.
- **Decision:** Remaining Bundle C assurance runs may use /tmp/opencode/bc-c-20261105 only for
  harness sockets, leases and caches. Remove it after each run. No product/harness code change.
- **Boundaries:** Existing generated fixture credentials/TLS approvals remain limited to the owned
  verification worktree. No operator files, other credential stores or disclosure is authorized.
- **Qualification:** Record actual source/run provenance independently of the temporary directory's
  name; verify owned runtime cleanup before removing it.

## AR-35 — Exact-operation parser composition

- **Authority/eligibility:** AI — delegated by --auto-design; policy1; root bundle-c-20261104;
  exec-plan. This realizes the approved supported-JSON contract using existing middleware only.
  No dependency, serializer, generic auth framework, extra infrastructure or public policy change.
- **Evidence:** The default co-body/Bourne parser rejects an own __proto__ JSON property before
  the machine handler; native JSON.parse safely retains it as data. Invitation persistence assigns
  claims to a fixed details.claims field and serializes into parameterized JSONB, never merges its
  arbitrary value keys into control objects. The original global parser covers case-sensitive
  /api/ prefixes before authentication; careless route movement changes human error precedence.
- **Decision:** One exact POST predicate matching router case/trailing-slash aliases coordinates
  global parser deferral, invitation opt-in and audit deferral. Only the server-global audit mount
  enables deferInvitationToRouter; the dedicated POST invokes the unchanged default owner once
  after parsing/final authentication, around permission checks and actual dispatch.
- **Parser selection:** Run existing auth without invoking downstream mutation. Its short native
  authority transaction ends before reading the body. Only validated machine state selects the
  same100KiB JSON/form/text parser with native onProtoPoisoning ignore; claim values remain opaque
  data. Humans/denials use the unchanged standard parser only where the old global /api/ prefix
  covered them, preserving uppercase /API human coverage. Syntax/size errors override captured
  authentication denials/errors; existing authentication writes no response headers. Captured
  thrown errors use the same original audit error owner after parsing, not a new classifier.
- **Fresh authority:** On initially authenticated requests, clear both identity lanes and rerun
  existing authentication after bounded parsing and before the outer mutation transaction. Only
  this second lookup supplies dispatch identity. Existing handler checks binding/version under
  client/binding/account locks again; slow upload cannot retain expired or revoked native authority.
  Existing Admin rate limiting stays ahead of both lookups. Machine case aliases always use the
  outer owner; existing human prefix/audit behavior is retained.
- **Retained-guard coverage:** Existing Admin CORS and write limiting recognize the case-sensitive
  /api/admin/ prefix. Machine opt-in additionally requires that prefix, so an uppercase /API or
  /api/ADMIN alias cannot acquire a new unprotected machine lane. Case aliases below the protected
  prefix and a trailing slash still share parsing, budget and transaction ownership. Legacy human
  alias behavior is neither widened nor rewritten. This is a necessary approved-security-boundary
  constraint, not acceptance of an uncovered alias or a new public access policy.
- **Rejected alternatives:** Global or path-only ignore reinterprets human input. Reading raw
  parser-error bodies or replaying consumed streams creates unnecessary sensitive handling.
  Unqualified auth-before-parse changes400/413 precedence; trusting parser-selection identity
  across upload permits stale authority. A custom serializer/parser or generalized deferred-auth
  service is unnecessary.
- **Strongest counterargument:** Middleware order can duplicate/omit the final transaction or
  carry an old identity. One predicate, default owner reuse and explicit identity clearing constrain
  that risk; runtime tests must cover aliases, error precedence, upload-time revocation and rollback.
- **Confidence/Hardening:** High static fit after blind challenger ses_e52554103ffe12DdlFj3HksKrv
  ruled refined B conditionally eligible with these binding bounds. No reserved decision is needed
  only while human behavior, precedence and coverage remain unchanged. Static ruling is not green.
- **Reopen triggers:** Human result/error precedence drifts, raw-body recovery is needed, a second
  durable owner appears, auth headers change parser responses, or any generalized support surface
  becomes necessary. No immutable assertion changes are authorized by this mechanism.

## AR-34 — Exact frozen management request correction

- **Authority:** User selected “Approve correction (Recommended)” in this conversation, after the
  exact file, two request changes, unchanged assertions, reseal and rerun were named.
- **Evidence:** The shared bound fixture has two targets. The same-normalized-email and identical-
  replacement cases in management-route.contract.spec.test.ts sent only lifecycle.target while
  requiring the original two-target projection. Keeping an omitted target in production would
  violate the approved complete-replacement contract and the other passing replacement cases.
- **Decision:** Only those two request bodies send the original fixture targets. All expected
  projections, security assertions, version changes and other full-replacement tests stay unchanged.
  The prior file seal is superseded with exact provenance; other seals remain unchanged.
- **Qualification:** Rerun the corrected cases and full group before implementation acceptance.
  Prior red evidence remains historical; do not claim the corrected bytes ran in that older run.

## AR-33 — Narrow counter, audit and credential-fixture interfaces

- **Authority:** AI — delegated by --auto-design; policy1; root bundle-c-20261104; exec-plan.
- **Eligibility/objective:** Freeze internal interfaces needed by independent Phase3 oracles for
  already-approved rate, attribution and credential-race behavior. No product/access/retention
  policy, public API, extra infrastructure or material support surface is introduced.
- **Decision:** service-accounts/rate-limit.ts exports
  `buildServiceAccountInvitationRateLimitKey(clientId: string): string`, re-exported through the
  existing feature barrel and used by production strict limiting. The sole variable is the live
  internal client UUID with a fixed purpose prefix; target/token/binding/version never split the
  client-wide budget. Tests poison only that exact key in real owned Redis, not unrelated limits.
- **Audit projection:** Both user.invited and admin.mutation.committed record actor_type client,
  actor_id null, user_id null, actor_client_id public OAuth client ID, and live actor_client_name.
  Reuse closed flat metadata serviceAccountId, bindingId and authorizationVersion from validated
  authoritative state, alongside existing safe metadata. Native token namespace spelling stays
  unchanged. No request/token spread, synthetic adminUser or human-branch change.
- **Credential barrier:** A small test-only HTTP fixture calls actual tenant resolver, client/tenant
  binding, credential bridge and configured native provider. Use the existing credential-free
  afterCredentialValidation seam, preserve original URL/body/raw request identity, resolved org
  transfer and issuer context. Do not extend createApp or inject authority. Full createApp still
  owns invitation/audit/delivery qualification; isolated native HTTP qualifies only proof races.
- **Evidence:** auth/rate-limiter.ts:96–114 already performs strict real INCR/EXPIRE/TTL;
  users/invite-service.ts:340–355 uses flat metadata; lib/audit-log.ts:84–125 separates client
  identity and user_id; server.ts:459–579 owns the real protocol envelope;
  middleware/client-secret-hash.ts:138–146/176–216 supplies the existing genuine pause seam.
- **Rejected alternatives:** Guessing/observing private counter keys risks faulting another
  limiter. Nested audit metadata is viable but adds no benefit to the current flat convention.
  A new createApp hook enlarges production API without need; ESM interception is less direct and
  its pass-through behavior would need separate proof. No alternate runner or authority framework.
- **Strongest counterargument:** A copied metadata projection could still use untrusted/stale
  values. Populate it only after native and live transaction-bound checks; distinguish internal
  and public client IDs in full-application audit tests. Preserve null user_id independently.
- **Confidence/Hardening:** High static fit. Blind challenger ses_e52987e3fffe7M3p87fu5nT6ZB
  converged on these three mechanisms, completing the original bounded interface challenge.
  Real red/green, dependency-failure and lock/commit tests remain mandatory; no gate is waived.
- **Reopen triggers:** The existing seam cannot preserve real request/issuer context, fault
  isolation needs a new adapter/framework, or audit attribution requires a new identity lane.

## AR-32 — Bound-invitation delivery acknowledgement

- **Authority:** AI — delegated by --auto-design; policy1; root bundle-c-20261104; exec-plan.
- **Eligibility/objective:** An internal mechanism for the already-approved truthful sent/failed/
  unknown machine delivery outcome, without changing ordinary human/tenant/direct-call results.
  No access policy, transport abstraction, retry, queue or public input is added.
- **Evidence:** Existing EmailResult exposes accepted/rejected recipient arrays
  (auth/email-transport.ts:49–62). sendInvitationEmail currently ignores those arrays and catches
  transport exceptions as failed (auth/email-service.ts:412–440). Nested inviteUser copies its
  delivery holder before the real outer commit (users/invite-service.ts:318–399). Existing unit
  and external fixtures rely on the ordinary semantics and remain unchanged.
- **Decision:** Add only optional internal `reportRecipientAcknowledgement` to the existing
  InvitationEmailOptions, default absent/false. Enable it from the trusted, validated bound-account
  invitation path only, not all `kind: service` callers (which also includes ordinary tenant
  clients), and never from request/header/token-supplied flags. It changes reporting, not authority.
  Accepted-only acknowledgement is sent/true; rejected-only is failed/false; neither or both is
  unknown/false. A rejected transport Promise remains failed/false in both modes. Final response
  reads the holder after the actual outer commit/email effect. No outcome rolls back a committed
  invitation or adds retry/cancellation.
- **Safe effects:** The opted-in branch must not emit an unconditional sent audit for failed or
  unknown acknowledgement, and must not copy arbitrary transport errors or credentials into
  audits/logs/responses. Keep ordinary delivery contracts and their sealed tests unchanged.
- **Rejected alternatives:** Global recipient-result reinterpretation breaks preserved human and
  tenant fixtures/contracts. Exception-code heuristics change the established failed outcome.
  Faulting private post-commit internals to manufacture unknown violates real external-seam testing.
  A new outcome adapter/callback framework is unnecessary.
- **Strongest counterargument:** A caller could misuse a generic boolean. Keep enablement inside
  the validated bound-account path and assert lane isolation; it is not an incoming schema field.
- **Confidence:** High, subject to real full-createApp and compatibility tests.
- **Hardening:** Blind challenger ses_e52987e3fffe7M3p87fu5nT6ZB converged on this bounded option;
  it is an eligible technical mechanism, not a reserved product/security-policy change or material
  new support surface. No execution gate is qualified by static challenge alone.
- **Reopen triggers:** Need to reinterpret ordinary delivery results, infer ambiguous exception
  outcomes, expose the option publicly, change transport APIs or add a general delivery framework.

## AR-31 — User-confirmed anonymous-volume cleanup

- **Authority:** User selected “Confirm and remove” for exactly
  19bbf5007edff0c8e0ae81b177529e427bcde00fb6f3569125caea355f72f952 and
  a14a62819eea60149bccffcd1a4c359d0e1f5517fcc1ab2ed5991bfacac1d62c.
- **Evidence/boundary:** Both were absent from the pre-run baseline and created together during
  harness startup, but anonymous labels and retained Docker events did not independently prove
  ownership. Parent preserved them until the user confirmed ownership. No contents were read.
- **Action:** Confirm no container uses either volume, then remove only these exact two. Completed.
  No global prune, unrelated-resource cleanup or broader harness change is authorized.

## AR-30 — Existing integration worker test-URL wiring

- **Authority:** AI — delegated by --auto-design; policy1; root bundle-c-20261104; exec-plan.
- **Eligibility/objective:** Test-runner mechanism needed to execute the existing immutable
  specifications under the authoritative root command. No product behavior, security policy,
  fixture guard, dependency, infrastructure or CI workflow changes.
- **Evidence:** Source CI42089720974 fails at client-http-fixtures.ts:86 before product assertions.
  The read-only workflow supplies both test URLs, but Turbo's strict task environment does not
  allowlist them. Existing Vitest integration env supplies derived DATABASE_URL/REDIS_URL only;
  direct local category runs retained TEST_* variables and therefore missed the root-runner gap.
- **Decision/exact scope:** In packages/server/vitest.config.ts, add TEST_DATABASE_URL:testDbUrl
  and TEST_REDIS_URL:testRedisUrl to the existing integration project's env block. Full root
  verification then exposes the same missing Redis marker in the pentest project's reused human
  fixture; add TEST_REDIS_URL:testRedisUrl to that project's existing env block as well. These
  three fields use the same already-derived URLs supplied to the real application. Keep the sealed fixtures' strict
  equality checks unchanged, and do not edit the read-only CI workflow or Turbo policy.
- **Rejected alternatives/counterargument:** Removing the fixture guards weakens reset safety and
  changes sealed fixtures. Broad Turbo environment passthrough changes every task and is larger
  than necessary. Duplicating URL derivation in test helpers would drift. Three runner fields are
  sufficient; the important counterargument is that full root execution, not another direct
  category run, must now demonstrate qualification.
- **Confidence/hardening:** High for the observed precondition failure and existing env block.
  CI provides the red evidence. Local full pnpm verify is now warranted by the test-infrastructure
  exception; fresh source CI remains mandatory. Production review closures remain valid because
  no product source changes. Do not infer any pass from the earlier clean-source harness while
  it runs on the preceding revision.
- **Reopen triggers:** An oracle/assertion must change, another environment surface is needed, or
  full root verification reports a genuine product failure. Stop rather than broaden this ruling.

The first full-root run passes integration899 and E2E134, but four human pentest cases stop at
their unchanged explicit Redis-isolation precondition. This is the same runner root cause, not
permission to alter an assertion or claim a successful security gate. The focused pentest selector
and complete root command must both pass with outer TEST variables absent after the third field.

The initial third-field patch matched the analogous E2E block instead of pentest; focused tests
correctly remained red. The marker was moved to the exact pentest block and AST verification
confirms E2E is unchanged. No assertion changed or failing run was credited. The complete root
verification rerun remains authoritative.

At2026-11-05 21:06, the exact three-field correction passes four focused human pentest cases and
full root pnpm verify with both outer TEST variables absent: SDK610, CLI1,795 and server
unit4,417/integration899/E2E134/pentest334, plus structure158 and every lint/typecheck/build task.
Fresh source CI is still required; no failed run is relabeled and no sealed fixture changed.

## AR-29 — User-approved command-scoped short assurance temporary root

- **Authority:** User selected “Approve short temp root” for the exact path
  /tmp/opencode/bc-c-0f9cb04b. This exception is limited to the production-security run's temporary
  sockets, leases and caches; remove the directory after cleanup.
- **Evidence:** The registered command exits1 before tests with tsx IPC listen EINVAL. The original
  task path exceeds Linux's Unix-socket address limit. No product assertion or harness outcome is
  qualified by this startup failure.
- **Decision:** Set command-scoped CODEOPS_TMPDIR and TMPDIR to that short owner-only directory.
  Keep logs in the existing owned task scratch. Generated credentials/TLS files stay beneath the
  previously approved verification runtime; no operator configuration or credentials are copied.
  Do not alter repository code, the harness, security checks, provenance or exit taxonomy.
- **Boundary:** Reusing the long path cannot start the existing IPC boundary. Changing harness
  code solely for this environment would be unnecessary scope. Short-root approval does not
  authorize protected files outside the earlier exact runtime scope or any risk waiver.

## AR-28 — User-approved older specification call-shape updates

- **Authority:** User explicitly answered “I approve, use --auto-commit and --auto-design” to the
  two-file correction packet. Root bundle-c-20261104 and policy1 remain unchanged.
- **Exact scope:** In tests/unit/routes/client-require-consent.spec.test.ts, add the existing
  authenticated fixture actor 'admin-id' as the third updateClient argument. In
  tests/unit/routes/invitation-deferral.spec.test.ts, add the existing application 'app-1' as the
  third assignment SQL parameter, and match the INSERT mock before the broader FROM roles branch.
- **Preservation:** Every existing payload, response, consent, CSRF and missing-reference assertion
  remains. No production check is weakened; application ownership remains checked at persistence.
  No other sealed specification update is authorized by this ruling.
- **Adjacent implementation fixtures:** The non-spec clients.test.ts and
  client-secret-expiry.impl.test.ts now supply and assert the same authenticated actor. These
  retain their original payload/result checks. All four files require fresh verification.
- **Evidence:** The preceding affected run passed158 structure checks but failed six assertions
  across these four files due to the changed internal call shapes. New feature oracles already
  pass the corrected real HTTP boundaries. This entry grants no failing-gate waiver.

## AR-27 — User-approved sealed HTTP assertion ordering

- **Authority:** User explicitly approved the proposed reorder in
  packages/server/tests/integration/service-accounts/client-http-secrets.spec.test.ts.
- **Problem/evidence:** The corrected generation route returns the expected201, but the test then
  independently verifies its new secret before checking all newly added audit actors. Successful
  verification correctly writes client.secret.verified as a system authentication event. That
  observation is not part of the human mutation and must not be falsely attributed to its actor.
- **Decision:** Move the existing expectClientHttpAudit assertion before
  expectClientHttpSecretUsable in the bound generation case. Keep every assertion and expected
  value intact. Do not change correct production audit behavior or delete test-generated audits.
- **Verification:** The sorted complete line sets before/after are identical. Against the exact
  pre-correction client router, all28 HTTP cases again show17 intended failures/11 controls.
  Against corrected credential routes, all15 selected credential HTTP/lifecycle cases pass.
- **Seal supersession:** client-http-secrets.spec.test.ts SHA256 changes from
  c6d2f663c864acfc8a93af60e175270a86972b1166a72d920ea661b93751c2ab to
  2790ffbc772991dbf5169d2513409492c32de2099d1ba9c00053c782a102ef38. All other new/old oracle
  identities remain unchanged. This approval is limited to this exact reorder, not future edits.

## AR-26 — Runtime existing-route and reserved-membership corrections

- **Authority:** AI — delegated by --auto-design; policy1; root bundle-c-20261104; exec-plan.
- **Eligibility/objective:** Necessary implementation corrections to already-approved human Super
  Admin mutation access and permanent/reserved identity separation. No product/access-policy,
  retention, acceptance waiver or optional addition is selected. No new layer/dependency/harness.
- **Evidence:** Correctness reviewer ses_e53995e40ffeaPe64fTdRaQj87 reports RV-2-001 Major: five
  existing client handlers omit actorId, so legitimate bound-client mutations fail. RV-2-002
  Minor: existing client/user mappers omit the new management-denial error and return503 rather
  than403. Security auditor ses_e5398af8cffeUhY28SndLfViJH reports SA-2-001 Major: canonical role
  protection sets omit the separate machine role, permitting generic role-definition tampering.
  SA-2-002 Minor: invitation admission/acceptance bypass generic membership checks and can assign
  the reserved role to an ordinary human. Parent inspected every cited caller and confirmed.
- **Decision:** Pass the authenticated actor ID to the five existing client service calls. Map
  management denials to the established sanitized403 envelope in existing client/user mappers.
  Add only the machine role to existing canonical role-protection sets, keeping it outside the
  human permission catalog. Reject canonical reserved-role invitation admission and exclude that
  role at actual pre-assignment persistence, including already-issued invitations. Preserve
  ordinary roles, same-slug roles in other applications and existing best-effort acceptance.
- **Exact focused modification scope:** routes/clients.ts, routes/user-error-handler.ts,
  rbac/role-service.ts, routes/roles.ts, users/invite-service.ts and routes/invitation.ts; focused
  new independent HTTP/role/invitation specifications and necessary implementation regressions;
  actual inventory/evidence. These are direct existing callers of the approved boundaries, not
  new endpoints or broader machine capabilities. Frozen old Phase2 oracles remain unchanged.
- **Rejected alternatives/counterargument:** Allowing omitted actors, unioning the machine role
  into human roles, merely hiding UI controls, or checking invitation admission without guarding
  old persisted assignments leaves a demonstrated gap. A new global role framework is unnecessary.
  Extra DB/HTTP coverage costs runtime but is required because service-only tests missed callers.
- **Confidence/hardening:** High; independently grounded by the two completed review partitions.
  Fresh source-restricted specification authors cover full createApp client HTTP and reserved-role
  admission/acceptance before any correction is written. Actual red, green, affected security
  requalification and one scoped re-review remain required; no finding is waived or dismissed.
- **Reopen triggers:** A remedy changes an existing public outcome beyond the approved403/role
  denials, needs an oracle expectation changed, weakens ordinary-client behavior or introduces
  another support surface. Pause that remedy rather than extending this ruling.

## AR-25 — Runtime ordinary-unit fixture compatibility

- **Authority:** AI — delegated by --auto-design; policy1; root bundle-c-20261104; exec-plan.
- **Eligibility/objective:** Testing mechanism within approved lifecycle behavior, not a change to
  product expectations, access policy or the immutable specification oracle. AR-21/22's earlier
  user approval is not expanded or reused.
- **Evidence:** After all240 new oracles pass, affected tests expose62 older unit failures across
  ten files. Repository/DB mocks lack newly required classification, parent/binding transaction
  reads and reserved-role lookup. Existing protocol implementation fixtures supply only cached
  data although mutations now read authoritative rows. No production fallback is appropriate.
- **Decision/scope:** Extend only inspected ordinary-human/unbound-client external DB/repository
  fixtures. Return explicit results for the named new queries; reject unrecognized queries rather
  than globally returning empty/false. Keep all old specification assertions, error expectations,
  authority, tenant and no-write checks unchanged. The ten files are unit/auth/system-config-
  consumers.spec.test.ts; unit/clients/{service.test.ts,secret-service.test.ts,secret-parent-
  integrity.spec.test.ts,protocol-compatibility.impl.test.ts}; unit/rbac/{tenant-user-roles.spec.
  test.ts,user-role-service.test.ts}; unit/users/{service.test.ts,tenant-user-service.impl.test.ts};
  unit/cli/commands/init.test.ts. No sealed Phase2 fixture or oracle may change.
- **Implementation expectations:** The non-spec init test must expect the approved sixth role,
  use distinct role IDs and additionally prove invitation-only mapping and no human service-role
  grant. The non-spec user service test must assert the same user/hash through updateHumanPassword
  instead of the now-inappropriate generic updateUser call; cache/audit expectations remain.
- **Rejected alternatives/counterargument:** Skipping tests, weakening denial assertions, mocking
  feature authorization or weakening production guards would invalidate verification. Callback
  transaction fixtures do not prove real rollback/locks, so unchanged real-DB oracles and planned
  hardening remain mandatory. No blanket authority to repair every future failure follows.
- **Confidence/hardening:** High for inspected paths. Independent challenger
  ses_e54265de5ffeqdLM6KfwZOLhRf confirmed the narrow fixture ruling and distinguished the two
  implementation-expectation updates from oracle changes. Parent individually checks remaining
  mapped mocks and reruns affected/unchanged sealed tests. No risk acceptance or gate waiver.
- **Reopen triggers:** A human-facing result/error/authorization decision changes; old security
  assertions need editing; a new sealed fixture needs alteration; or another failure lacks a
  concrete fixture-only explanation. Stop that correction rather than expand this ruling.

**Individually inspected follow-up:** The full unit run passes4,416/4,417 assertions; its sole
failure is unit/migrations/record-deletion-lifecycle.impl.test.ts:28 searching for the obsolete
five-role loop text. Update only that implementation selector to the actual six-role loop and
add an explicit found-selector assertion. Preserve every initialization ordering/repeat-safety
assertion. This is a source-text implementation check, not a security oracle or behavior change.

## AR-24 — Runtime lifecycle authorization point and lock ordering

- **Authority:** AI — delegated by --auto-design; policy1; root bundle-c-20261104; exec-plan.
- **Eligibility/objective:** Internal consistency mechanism for the existing human Super Admin
  policy. No new capability, actor registry, retention rule or stronger commit-time revocation
  product is introduced. Preserve the approved smallest design and existing mutation signatures.
- **Decision:** Revalidate only the supplied actor ID through one authoritative database statement
  inside the existing transaction after acquiring the client lock. Require the live active,
  unflagged user in the actual super-admin organization and canonical Super Admin/legacy role.
  Ignore supplied role/permission arrays. The statement's post-wait READ COMMITTED snapshot is the
  authorization point; a revocation committed earlier is observed, while later concurrent actor
  revocation does not retroactively cancel the already-authorized operation. Reject unsupported
  inherited isolation rather than relying on stale authority. Do not lock human actor rows or
  assignments merely to hold authority through commit.
- **Resource order:** Ordinary lifecycle remains client→binding→owned account, then required
  roles/credentials. Existing bound client/secret methods lock the parent before checking binding
  existence, including revoked/ownerless rows; missing actor cannot bypass that boundary. Generic
  service-user role mutations reject permanent classification before organization/target locks.
  Physical service-user deletion discovers a parent without a lock, then locks client→binding→
  control-plane organization→owned user, revalidates ownership and reuses existing deletion
  capture. Split narrow internal lock helpers where needed; no new coordination layer.
- **Evidence:** database.ts reuses the outer transaction. user-role-service.ts:150–163 locks the
  organization before the user; users/repository.ts:796–805,870–900 preserves that order. Actor-first
  locks can deadlock with that path and the new user's organization FK. The existing combined
  feature helper already locks the owned account, so it cannot precede deletion's organization lock.
- **Rejected alternative/counterargument:** Organization→actor locking is viable but adds broad
  serialization and stronger authority-lifetime guarantees not required by the contract. A plain
  pre-lock route/cache check is insufficient. The chosen read-only check does not prevent every
  deadlock; audit FK locks still matter, so early permanent generic-user denials and the distinct
  physical-deletion order are mandatory. No automatic retry or universal deadlock-freedom claim.
- **Confidence/hardening:** High contract fit, medium complete runtime lock coverage. Independent
  challenger ses_e548045e3ffeNcOMVNKOrKAiiH recommended this smallest mechanism, identified the
  generic-role and deletion cycles, and found no reserved policy choice. Real concurrency evidence
  and the independent Phase2 review remain required.
- **Reopen triggers:** Commit-time actor revocation is requested, stronger inherited isolation
  cannot fail closed, classification becomes mutable, ownership reassignment appears, or a
  generic writer must lock a classified account before rejecting it. No oracle expectation change.

## Preflight correction rulings — amendments to AR-18–20 (historical)

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
