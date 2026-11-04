# Preflight Report: Admin Service-Account Invitations

> **Status**: ✅ PASSED — CLEAN; all 9 findings verified closed at plan level
> **Iteration**: 2
> **Artifact**: Full plan at codeops/features/admin-service-accounts/plans/admin-service-account-invitations/
> **Audited SHA256**: e1910c464e951f060134578d7bbcda79c02ecfc6312f733cd96158073cd9c609
> **Qualified corrected SHA256**: 3b0694a878208cdb33d0fcfcccc182a6bb10311d837767aa8fe8f33079a4d4e3
> **Hash rule**: sorted ten original plan Markdown files, filename + NUL + bytes + NUL; exclude report/continuity notes
> **Scope**: Strict; plan only. Source, tests, policy and sibling documentation are read-only context.
> **Authority**: Inherited auto-design, policy1, root bundle-c-20261104; no automatic risk waiver
> **Last Updated**: 2026-11-04

⚠️ SAME-SESSION REVIEW: the lead authored this plan. Five fresh independent auditors counter
shared framing through disjoint dimension clusters. The report is not a pass or implementation
claim. All major resolutions received one consolidated independent challenge before selection;
two independent auditors verified the corrections and bounded all13 dimensions in iteration2.

## Codebase context

TypeScript ESM, Koa, oidc-provider9.11.2, Zod, PostgreSQL, Redis, Vitest and pnpm/Turbo. The plan
adds one binding table/internal account flag, native opaque metadata and narrow existing
transaction/authentication integrations. Its minimum design and fixed product scope are in00-index
and AR-15–17. No new framework, dependency, infrastructure, Admin UI or general machine admin.

Observed context includes human/tenant authentication, canonical role permissions, client/secret
lifecycles, queued recovery and artifact consumption, the hybrid token adapter, invitation and
administrative audit transactions, database nesting, SDK/CLI contracts and registered assurance
consumers. Specific additional code evidence is recorded below. The native model diagnostic is
not HTTP/production evidence. No new standards-conformance claim is qualified by this audit.

## Scan coverage so far

| Cluster   | Dimensions | Result                                                    |
| --------- | ---------- | --------------------------------------------------------- |
| Soundness | 1,3,12     | Complete: PF-003/004/005                                  |
| Grounding | 2,13       | Complete: PF-006/007/009                                  |
| Delivery  | 4,5,11     | Complete: PF-001/006/007                                  |
| Risk      | 6,8,9      | Complete: PF-006/007/008                                  |
| Fit       | 7,10       | Complete: PF-001/002; no unapproved support surface found |

Web/authentication, distributed/concurrent and data/migration lenses augment these dimensions.
All13 dimensions and selected lenses returned in iteration1 and received bounded iteration2
verification. No new broad discovery, product-policy change or risk waiver is implied.

## PF-001 — Earlier green gates depend on later implementations 🟠 MAJOR

**Dimensions:**4/5/7/11. **Location:**07 ST-12/ST-25 and phase mappings;99 Phase1/2 green gates.
**Reports:** PA-FIT-001 and PA-DELIVERY-001, consolidated by dependency root cause.
**Evidence:** users/invite-service.ts:178–235 requires live reference queries; lib/database.ts:73–84
owns replacement atomicity. Phase1 only implements reads/parsing; Phase2 introduces writes. Native
machine issuance/access does not exist until Phase3, so earlier universal rejection proves no
usable-token revocation.

**Problem:** ST-12's durable invalid-replacement assertion cannot pass in Phase1; ST-25's complete
usable-token outcomes cannot be credited in Phase2. Test-owned SQL or unconditional prefeature
denial would be weaker substitute evidence.

**Options:** Allocate each assertion to its executable phase, retaining final expectations; or
move the corresponding production mutation/token boundary earlier and enlarge that phase.
**Resolution:** AI — delegated by --auto-design; AR-20 correction ruling. Allocate assertions to
the executable phase: ST-12 read corruption, ST-61 durable replacement, ST-25 version transitions,
ST-62 usable tokens. Matching specification/green tasks corrected. Pending fix verification.

## PF-002 — Packed machine journey lacks a specification-first delivery task 🟠 MAJOR

**Dimension:**7. **Location:**07 ST-57;99 Phase4 specification tasks and final qualification.
**Report:** PA-FIT-002.
**Evidence:** assurance/compat/command.ts:229–257 dispatches existing read/credential-isolation
journeys; p1-read.ts:133–146 has a closed six-read matrix. consumer.ts:272–320 supplies reusable
package consumer/provenance preparation. None of those existing journeys issues a feature token,
invites and proves post-revocation rejection.

**Problem:** The plan correctly calls these adjunct evidence but leaves the new acceptance oracle
and executable delivery work until a final qualification task after implementation.

**Option:** Add an independent ST-57 oracle task and a focused packed feature probe using existing
consumer/provenance/cleanup helpers. Name its implementation owner and invocation. A new harness,
selector framework or infrastructure is neither necessary nor approved.
**Resolution:** AI — delegated by --auto-design; AR-20 correction ruling.03-04 names the packed
specification, focused driver/collector and existing compatibility invocation;99 adds independent
author and delivery tasks. Existing credential-isolation evidence stays separate. Pending verification.

## PF-003 — Eligibility loss does not define the binding state transition 🟠 MAJOR

**Dimension:**1. **Location:**03-02 replacement/restoration/client coupling;99 task2.2.6.
**Report:** PA-SOUND-001. **Evidence:** clients/service.ts:508–515,535–542 changes client status;
configuration update at333–405 has no new binding coupling today.

**Problem:** If a binding remains active when eligibility is removed, ordinary activation or a
configuration restoration could restore service access outside the approved retirement lifecycle.

**Options:** Atomically revoke binding/account and change version on eligibility loss; or reject
eligibility-removing operations until explicit binding revocation. Both use existing states but
the latter adds an operator prerequisite. No automatic authority restoration is acceptable.
**Resolution:** AI — delegated by --auto-design; AR-18 correction ruling within AR-15. Atomically
revoke binding/account with fresh version on eligibility loss; normal client repair does not
restore it.03-02/99 name coupling, ST-66 tests it. Pending fix verification.

## PF-004 — CLI revoke JSON shape is not exact 🟡 MINOR

**Dimension:**1. **Location:**03-04 CLI output;07 ST-51.
**Report:** PA-SOUND-002. **Evidence:** cli/src/output.ts:71–72 serializes the supplied object and
imposes no envelope; client-secret.ts:180–182 provides no reusable confirmation contract.

**Problem:** Independent authors could choose different property names/types while satisfying
the current prose. **Options:** Explicit `{clientId: internalUuid, status: 'revoked'}` or
`{clientId: internalUuid, revoked: true}`; repeated success must use the same shape.
**Resolution:** AI — delegated by --auto-design; AR-19 correction ruling.03-04 now specifies
exact `{clientId: '<internal UUID>', status: 'revoked'}` for initial/repeated success. Pending direct check.

## PF-005 — Human output cannot be both raw-lossless and sanitized 🟡 MINOR

**Dimension:**12. **Location:**07 ST-52 versus03-04 safe human rendering.
**Report:** PA-SOUND-003. **Evidence:** cli/src/output.ts:28–40 replaces controls/invisible
characters with U+FFFD; JSON at71–72 preserves data through escaping.

**Option:** Preserve ordinary text without truncation, apply established human sanitization to
unsafe characters, and preserve original values in JSON. A new reversible human escaping protocol
would contradict the stated reuse boundary and is not necessary.
**Resolution:** AI — delegated by --auto-design; AR-19 correction ruling. ST-52 now separates
ordinary text, established human sanitization and JSON original preservation. Pending direct check.

## PF-006 — The real outer mutation owner and response finalization are omitted 🟠 MAJOR

**Dimensions:**4/5/6/9/11. **Location:**03-03 route/transaction/audit integration;99 Phase3 targets.
**Reports:** PA-DELIVERY-002 and PA-RISK-003, consolidated.
**Evidence:** server.ts:251 mounts adminMutationAudit before routers. Its middleware:49–70 owns
the outer transaction, requires adminUser and hard-codes user audit attribution. database.ts:73–92
reuses that owner and executes post-commit effects later. invite-service.ts:315–396 copies delivery
status into a result before an enclosing transaction's effects execute.

**Problem:** A machine-only state can cause rollback for missing adminUser; populating adminUser
alone still misattributes the generic audit. Merely nesting inviteUser does not update its already
copied delivery result after SMTP. Router-only tests miss both integration failures.

**Options:** Retain the existing owner with a narrow trusted machine-actor branch and post-outer-
commit response finalization; or make only the exact invitation POST self-managed, preserving all
existing transaction/audit guarantees. Exempting a users prefix without equivalent guarantees is
not viable. Require full-createApp success, audit rollback, delivery and SMTP/revocation overlap.
**Resolution:** AI — delegated by --auto-design; AR-18 correction ruling. Retain the outer owner,
trusted exact-operation machine attribution and post-outer-commit result finalization.03-03 names
full-createApp ST-67;99 adds the explicit middleware/result task. Pending fix verification.

## PF-007 — Credential proof can cross into a newer privileged generation 🟠 MAJOR

**Dimensions:**8/9/11. **Location:**03-02 secret lifecycle;03-03 native extra issuance;99 Phase3 tests.
**Reports:** PA-DELIVERY-003 and PA-RISK-001, consolidated.
**Evidence:** client-secret-hash.ts:137–146,173–184 proves a presented secret then rewrites it to
the canonical digest. Existing client-secret-bridge.spec.test.ts:316–347 deliberately permits an
already-validated ordinary request across overlapping-secret revocation. Native grant creation and
opaque extra hooks run after authentication (provider grants/client_credentials.js:43–66;
models/formats/opaque.js:40–42).

**Attack:** Authenticate old secret A; pause; promote/restore/revoke A and mint versionV2; resume
using canonical B; the feature hook reads V2 and stamps newly valid authority. Current binding
checks alone do not tie credential proof to the authority epoch.

**Options:** Capture binding/version with credential validation serialized against lifecycle
changes, refusing later generation promotion; or carry the exact proven secret ID in trusted
request-only state and revalidate it under the parent lock at issuance. Preserve ordinary-client
handoff semantics. Neither requires persisted secret lineage or another token store. Test first
binding, restoration and explicit revocation with controlled real HTTP interleavings.
**Resolution:** AI — delegated by --auto-design; AR-18 correction ruling. Select exact proven
modern/legacy secret ID revalidation under client lock; transport only via trusted raw-request-keyed
state, never the canonical digest or outer ctx.state.03-03, ST-63 and99 name the handoff, native
context boundary and HTTP races. Ordinary handoff remains unchanged. Pending fix verification.

## PF-008 — Bulk status SQL bypasses ordinary-user service guards 🟠 MAJOR

**Dimensions:**8/9. **Location:**03-02 generic mutation guards;99 Phase2 modification set/tasks.
**Report:** PA-RISK-002. **Evidence:** routes/bulk.ts:95–109 admits existing lifecycle authority;
lib/bulk-operations.ts:110–144,228–244 locks/updates users directly, bypassing users service guards.
User Admin already has lifecycle permission (admin-permissions.ts:165–170).

**Problem:** An ordinary lifecycle administrator could change a dedicated service user's status
without approved binding/version transitions. A revoked binding's separate denial does not make
this generic management path permissible under AR-15.

**Options:** Exclude flagged users in existing bulk lock/mutation predicates and retain concealed
per-item denial; or call a narrow guard against the already locked row/transaction client. Preserve
ordinary-user results. This is a necessary denial-path correction, not a new bulk capability.
**Resolution:** AI — delegated by --auto-design; AR-18 correction ruling.03-02/99 explicitly own
both bulk SQL denial predicates; ST-64 covers mixed activation/deactivation. Pending fix verification.

## PF-009 — Physical owner deletion loses the no-reassignment boundary 🟠 MAJOR

**Dimensions:**2/13; data/migration. **Location:**03-01 binding foreign keys/deletion;
03-02 same-owned-account restoration;07 ST-28. **Report:** PA-GROUND-003.
**Evidence:** users/repository.ts:948–953 physically deletes the account, invoked by service.ts:824.
The proposed binding is the only durable client/account ownership record.

**Problem:** Removing the binding when the user is deleted makes a later PUT indistinguishable
from first provisioning, so the same surviving client can silently acquire another owned account.
Keeping a non-null account foreign key cannot implement physical deletion. Immediate token denial
alone does not prove the approved permanent no-reassignment rule.

**Options:** Preserve a revoked, non-restorable ownership marker in the same binding row, with
an appropriate nullable FK and fail-closed lost-owner handling; or retain an equivalent minimal
client-owned marker. A separate identity registry is unnecessary. Permitting new ownership or
forbidding all physical deletion would change the existing approved lifecycle, not resolve it.
Account PII is not implicitly authorized for retention by a technical ownership marker.
**Resolution:** AI — delegated by --auto-design; AR-18/19/20 correction ruling. Preserve the same
revoked ownerless binding row; nullable account FK, empty targets and no retained deleted account
PII; GET/PUT409 and idempotent DELETE204 without marker erasure. Downgrade refuses any surviving
binding marker.03-01/02, ST-65 and99 now name this boundary. Pending fix verification.

## Verification and protected-path boundary

Planning structural checks passed: ten required documents,58 unique ordered tasks, ST-1–60 and
valid local links. The clean verification worktree passed changed selection/structure158 and CLI
123 files/1,795 tests plus lint/typecheck/build after satisfying pnpm's real-directory requirement
and building the SDK's declared dist exports. Setup failures are retained in continuity notes;
no assertion, version or safety check changed. These are baseline checks, not Bundle C acceptance.

Verified existing packed syntax is pnpm assurance:compat --select p1-admin and --select compatibility.
Provenance also reads root .npmrc (scripts/source-provenance.ts:77–92). No protected-path permission
is inferred from a clean worktree, auto-design or the implementation objective. Obtain exact-path
authorization before any such access; no original operator configuration has been copied/read.

## Consolidated challenge and ruling provenance

Challenger ses_e58e20ab6ffeQxNa5iww6mtekV independently confirmed all seven major root causes;
none is a duplicate of another. It recommended allocating dependency-sensitive assertions,
explicit packed delivery ownership, automatic eligibility-loss revocation, retaining the outer
mutation owner, proven-secret-ID revalidation, direct bulk denial predicates and the same-row
lost-owner marker. Its strongest counterarguments and source evidence are preserved in the
register's correction amendments. No new reserved product/security/retention decision was needed:
the marker retains no deleted account PII and enforces already approved no reassignment.

All rulings: **Authority: AI — delegated by --auto-design**; policy1; root bundle-c-20261104;
eligible testing, consistency, persistence and internal security mechanisms inside AR-15/16.
Fixes were authored in the existing make-plan implementation objective, not inferred from
preflight's read-only authority. Alternatives, confidence, hardening and reopen triggers are owned
by the register amendments. No critical/major risk is accepted, dismissed or deferred.

## Iteration2 verification — all findings closed

Auditor ses_e58cfdac1ffeG7XCyat3lsQYOQ verified PF-001/002/004/005 and dimensions1/3/4/5/7/10/11/12.
Auditor ses_e58d02fbbffekBsAB2CTiEi1XL verified PF-003/006/007/008/009 and dimensions2/6/8/9/13,
with web/auth/tenancy, concurrency and data/migration lenses. Both read all ten core documents
and direct source seams, found no residual or new independent root, and made no implementation
qualification claim. Their supplied review hash was329a030480d3b4c8625b5dfa6fdf624a3a8b9d00e77244fb5a2bedda7e25c086;
the parent independently computed it. The only subsequent core change replaces the index's pending
status with the observed plan pass. That metadata-only delta was directly checked; the qualified
corrected hash above includes it. No behavior, oracle, ownership or task dependency changed.

| Finding | Iteration2 status | Fix evidence                                                                                   |
| ------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| PF-001  | Closed            | 03-01 reader;07 ST-12/25/61/62 and phase allocation;99 explicit preimplementation author tasks |
| PF-002  | Closed            | 03-04 direct packed files/seam/provenance/cleanup;99 tasks4.1.3/4.2.5                          |
| PF-003  | Closed            | 03-02 eligibility-loss transition; ST-66; task2.2.6                                            |
| PF-004  | Closed            | 03-04 exact CLI revoke object and repeat behavior                                              |
| PF-005  | Closed            | 07 ST-52 and existing human/JSON rendering contract                                            |
| PF-006  | Closed            | 03-03 actual outer-owner/actor/result finalization; ST-67; explicit middleware task3.2.7       |
| PF-007  | Closed            | 03-03 exact proven modern/legacy secret transport/revalidation; ST-63; task3.2.1               |
| PF-008  | Closed            | 03-02 both bulk predicates; ST-64; task2.2.13                                                  |
| PF-009  | Closed            | 03-01 same-row lost-owner marker/downgrade; ST-65; task2.2.11                                  |

The above closure supersedes individual 'pending fix verification' history in the finding entries.
All7 major and2 minor findings are fixed, not accepted risk or dismissals. The corrected plan has
65 tasks and67 ST cases; no actual oracle or product code existed during this preflight. Native
HTTP, production-security, packed compatibility, final CI and cleanup remain execution obligations.
Consider a human identity/security domain review in addition to automated review for this feature.
