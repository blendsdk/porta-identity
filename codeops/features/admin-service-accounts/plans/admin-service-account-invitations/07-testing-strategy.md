# Testing Strategy: Admin Service-Account Invitations

> **Authority**: R13; AR-14/16/20

## Oracle and verification policy

Independent spec authors receive the governing03 excerpts and the ST rows, planned signatures,
framework conventions and a forbidden implementation-file list. They do not derive expected
behavior from existing implementation. Each phase observes intended red before implementation,
then green, then implementation tests. Existing security oracles are never edited, skipped or
retried away. Split files by concern at roughly200–300 lines. Comments state durable behavior,
not plan IDs. Parent observes actual commands, not merely an author's claimed result.

Expected-red verification is a negative oracle result, not a production pass. If affected workspace
checks are not green, auto-commit remains pending until the coherent implementation checkpoint;
never stage a failing workspace merely to satisfy commit cadence. After green, verified changes
are committed/pushed through the git-commit skill in push mode. Task marks and evidence remain
immediate; this does not waive any failure or reduce final verification.

Use real Zod/yargs/provider/native JSON, real scratch PostgreSQL/Redis and actual HTTP wherever the
case depends on them. Mock only external DB/HTTP/email boundaries in narrow unit tests. Synthetic
model diagnostics do not count as endpoint evidence. Work on Node24 with a focused Node22 public
contract check. No new runner, containers, authority fixture store or mutation framework.

## Specification test cases

Fixture IDs below are distinct valid UUIDs; all accounts, clients, organizations and application
definitions are synthetic and owned by the test. Every target includes both allowlist arrays,
which may be empty. Same assignment under different organizations is a distinct target-qualified
entry; duplicates within one target are forbidden. Pair totals count every occurrence.

| ID    | Concrete input / scenario                                                                                                    | Required result                                                                                                                                                                  | Source                   |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| ST-1  | One valid organization with empty assignment arrays                                                                          | Parsed strict policy; no implicit assignment authority                                                                                                                           | R5/R6;03-01              |
| ST-2  | Non-UUID, unknown field, wildcard, missing array, zero/101 targets                                                           | Fixed validation failure before mutation                                                                                                                                         | R6;03-01                 |
| ST-3  | Exactly100 targets and100 total role/claim pairs each                                                                        | Syntactically accepted within the body limit; live reference admission is separately covered in Phase2                                                                           | R6;AR-16                 |
| ST-4  | 101 total role pairs or101 claim pairs spread over targets                                                                   | Rejected, not independently capped per target                                                                                                                                    | R6;AR-16                 |
| ST-5  | Case-variant duplicate org/pair; same pair on two distinct orgs                                                              | Duplicates rejected; cross-target use accepted/counts twice                                                                                                                      | R6;03-01                 |
| ST-6  | Invite allowed target without assignments; exact allowlisted pairs                                                           | Accepted; JSON values preserved                                                                                                                                                  | R5;03-01/03-03           |
| ST-7  | Unlisted target or one unlisted role/claim pair among allowed entries                                                        | Entire request denied; no partial invitation                                                                                                                                     | R5;03-01                 |
| ST-8  | Control-plane target or canonical Admin application assignment                                                               | Rejected even if explicitly supplied                                                                                                                                             | R5;AR-16                 |
| ST-9  | Fresh migration on existing human users                                                                                      | Existing users remain human; no service-role assignment                                                                                                                          | R2/R12;03-01             |
| ST-10 | Duplicate client/account ownership inserts                                                                                   | Database uniqueness rejects second binding                                                                                                                                       | R2;03-01                 |
| ST-11 | Downgrade with inactive/revoked flagged user; downgrade with none                                                            | First refuses without data loss; empty feature safely reverses                                                                                                                   | R12;03-01                |
| ST-12 | Corrupt stored JSON policy read through the production reader                                                                | Reject corrupt storage without fallback or unrestricted policy; durable invalid replacement is ST-61                                                                             | R6/R9;03-01              |
| ST-13 | Human Super Admin first set with unused email                                                                                | New classified real account, reserved role, binding and audit commit together                                                                                                    | R2/R4/R9;03-02           |
| ST-14 | First set collides with existing human email or receives userId                                                              | 409 collision/no adoption; unknown userId input400                                                                                                                               | R2/R6;03-02              |
| ST-15 | App Admin/User Admin/tenant client attempts binding or bound mutation                                                        | 403; no account, role, secret, policy or audit mutation                                                                                                                          | R4;03-02                 |
| ST-16 | First binding and restoration with preexisting secrets                                                                       | All old secrets retired; response contains none; new secret is separate                                                                                                          | R7;03-02                 |
| ST-17 | Policy replacement or restore supplies another email                                                                         | 400; no ownership change                                                                                                                                                         | R2/R7;03-02              |
| ST-18 | Revoke twice, then restore                                                                                                   | First atomically deactivates; second no-op; same owned account restored with new version and no usable old secret                                                                | R7/R9;03-02              |
| ST-19 | Service account tries password or ordinary OIDC account flow                                                                 | Same generic rejection as invalid human authentication; no session                                                                                                               | R3;03-02                 |
| ST-20 | Service account requests magic link/reset; queued job already exists                                                         | No usable recovery artifact or delivery; classification checked at issuance                                                                                                      | R3;03-02                 |
| ST-21 | Preexisting magic/reset artifact consumed after account classification fixture                                               | No usable login/password change; authoritative consumption guard                                                                                                                 | R3;03-02                 |
| ST-22 | Generic password/profile/activation mutation targets service user                                                            | Rejected without authority-restoring changes; human user unchanged                                                                                                               | R3/R4;03-02              |
| ST-23 | Generic assignment of reserved role to human; ordinary membership changes on service user                                    | Rejected; no mutation even under a matching delegation ceiling                                                                                                                   | R4;03-02                 |
| ST-24 | Service user has extra role or a human token carries reserved role                                                           | No extra machine authority; no service-role human authorization                                                                                                                  | R3/R4;03-02              |
| ST-25 | Overlapping secret generation versus explicit secret revocation at the Phase2 lifecycle boundary                             | Generation alone preserves binding version; revocation changes it atomically. Actual usable-token outcomes are ST-62 in Phase3                                                   | R7;03-02                 |
| ST-26 | Ordinary client/user operations under their existing admin roles                                                             | Existing successful behavior and errors retained                                                                                                                                 | R4/R10;03-02             |
| ST-27 | Inject failure before lifecycle audit commit; concurrent first set/secret generation                                         | Whole security operation rolls back; no promotion race or unretired pre-binding secret                                                                                           | R7/R9;03-02              |
| ST-28 | Physical client/account deletion with live binding                                                                           | No usable binding/token authority; surviving owned user never becomes human                                                                                                      | R3/R7;03-02              |
| ST-29 | Real token POST for active eligible binding and scope                                                                        | Native opaque token expires after300seconds; server-owned account/binding/version retained                                                                                       | R1;03-03                 |
| ST-30 | Unbound/public/tenant client, wrong issuer or missing scope                                                                  | No invitation-capable Admin token/access                                                                                                                                         | R1/R5;03-03              |
| ST-31 | Missing, malformed, pre-binding or stale feature metadata                                                                    | Denied; binding creation/replacement never upgrades old tokens                                                                                                                   | R1/R7;03-03              |
| ST-32 | Valid feature token invokes get/update/delete/config/preview/binding management                                              | Denied; only the real invitation POST is enabled                                                                                                                                 | R5;03-03                 |
| ST-33 | Valid feature token invites into allowlisted ordinary organization                                                           | Existing201 invitation/result and separate delivery outcome; no eager user creation                                                                                              | R5/R8/R10;03-03          |
| ST-34 | One unauthorized role/claim among allowed assignments                                                                        | Entire invite rejected before durable effects                                                                                                                                    | R5;03-03                 |
| ST-35 | Allowed role identity's live definition changes                                                                              | Current definition semantics, not frozen permission snapshot; canonical Admin references still denied                                                                            | R5/R6;AR-16              |
| ST-36 | Client/account disabled or role removed while a valid token remains                                                          | Next authorization denied using authoritative DB state despite cached objects                                                                                                    | R7;03-03                 |
| ST-37 | Revoke/restoration/replacement with a token minted earlier                                                                   | Old version denied; fresh eligible token succeeds                                                                                                                                | R7;03-03                 |
| ST-38 | 31st invitation across multiple allowed organizations in one hour                                                            | Strict global client ceiling429 with Retry-After, not one budget per target                                                                                                      | R11;03-03                |
| ST-39 | Authority DB or strict counter unavailable                                                                                   | Safe503; no invitation mutation; no allow-on-error fallback                                                                                                                      | R11;03-03                |
| ST-40 | Revocation commits before invite obtains authority lock                                                                      | No committed invitation and no delivery                                                                                                                                          | R8;03-03                 |
| ST-41 | Invite commit wins; SMTP held until later revocation completes                                                               | Revocation not blocked by SMTP; committed invitation/delivery semantics retained                                                                                                 | R8;03-03                 |
| ST-42 | Machine and human invitation audit                                                                                           | Machine client plus bound account/binding attribution; unchanged human attribution; no token/secret values                                                                       | R9/R10;03-03             |
| ST-43 | New native feature token looked up as human AccessToken; ordinary tenant token lifetime                                      | Token classes stay separate; existing tenant lifetime and authorization unchanged                                                                                                | R1/R10;03-03             |
| ST-44 | Maximum bounded request, non-finite nested number, unencodable full request                                                  | Valid JSON preserved; invalid value rejected before mutation without fixed nesting cap                                                                                           | R6;03-03                 |
| ST-45 | Wrong path/method/header/parameter variants against protected operations                                                     | No authentication, authorization, tenant or rate-limit bypass                                                                                                                    | R1/R5/R11;03-03          |
| ST-46 | Human Super Admin GET/PUT/DELETE binding subresource                                                                         | Exact approved secret-free envelope/statuses, immutable account ownership and idempotent revoke                                                                                  | R10;03-04/AR-19          |
| ST-47 | SDK get/set/revoke with valid payloads                                                                                       | Exact encoded method/path/body and validated unwrapped result;204 resolves void                                                                                                  | R10;03-04                |
| ST-48 | SDK malformed binding response or dot-segment identifier                                                                     | Reject incomplete/malformed data or traversal without unsafe fallback                                                                                                            | R6/R10;03-04             |
| ST-49 | CLI valid policy-file and optional email                                                                                     | One set invocation; no preflight GET, retry, extra prompt or saved credential/report                                                                                             | R10;03-04                |
| ST-50 | CLI malformed JSON/UTF-8, special/oversized file, bad policy/email                                                           | Safe local failure before SDK client construction; path/body not echoed                                                                                                          | R6/R10;03-04             |
| ST-51 | CLI get/set/revoke in JSON mode                                                                                              | Exact unwrapped binding or client-ID/revoked confirmation; no secrets/versions                                                                                                   | R10;03-04                |
| ST-52 | CLI human output with long/control-character labels                                                                          | Ordinary text retained without truncation; controls/invisibles replaced by existing sanitizer; JSON preserves original values through escaping; no padding amplification         | R10;03-04                |
| ST-53 | CLI auth/permission/conflict/dependency failure, including verbose JSON                                                      | Existing safe stderr classifications and exits; no raw input/cause/stack                                                                                                         | R10;03-04                |
| ST-54 | SDK existing client methods and CLI ordinary client commands                                                                 | Existing method/output/authentication behavior unchanged                                                                                                                         | R10;03-04                |
| ST-55 | Fresh init versus migrated existing installation                                                                             | Same reserved canonical role/permission, no grant to existing humans                                                                                                             | R2/R12;03-01/03-02       |
| ST-56 | Export/import requests involving control-plane service identity                                                              | Existing control-plane exclusion retained; no service-to-human import conversion                                                                                                 | R3/R12;03-01             |
| ST-57 | Packed SDK credential provider obtains feature token and invites                                                             | Package/source provenance qualified; actual scoped invite result and revocation denial observed separately from adjunct compatibility                                            | R1/R13;03-04             |
| ST-58 | Production profile and ordinary browser login regressions                                                                    | Existing HTTPS/cookies/CORS/CSP/authentication controls pass; no new observer gap waived                                                                                         | R3/R13;AGENTS.md         |
| ST-59 | Public help and operator documentation                                                                                       | Explain scope, limits, retirement/replacement secrets, live definitions, rollout and delivery/revocation semantics accurately                                                    | R13;03-04                |
| ST-60 | Final clean-source verification and teardown                                                                                 | Named-source CI/gates pass; all owned stacks/DBs/worktrees/temp removed, unrelated resources preserved                                                                           | R13;AGENTS.md            |
| ST-61 | Existing policy replacement has an invalid final live reference                                                              | Production setServiceAccount rejects atomically; original policy/version/role/secret state unchanged; authored before Phase2 writes                                              | R6/R9;03-01/03-02;PF-001 |
| ST-62 | Prove a machine token can invite, generate overlapping secret, then explicitly revoke a secret                               | Token remains usable after generation alone; pre-revocation version fails after revocation; fresh token from a remaining active secret succeeds                                  | R7;03-03;PF-001          |
| ST-63 | Real HTTP credential proof paused before first binding, restoration or retirement of the proven overlapping secret           | Retired/pre-binding proof cannot acquire the newer privileged generation; both modern and legacy proof paths covered; ordinary-client handoff oracle unchanged                   | R1/R7;03-03;PF-007       |
| ST-64 | Bulk activation/deactivation mixes ordinary users with active/revoked service users                                          | Classified users remain unchanged with existing concealed denial; ordinary item results/partial outcomes retained                                                                | R3/R4;03-02;PF-008       |
| ST-65 | Physically delete owned account, then GET/PUT with omitted, same or different email; revoke marker and try downgrade         | Same revoked ownerless row retained, no deleted account PII; GET/PUT409, DELETE204; no account re-creation/reassignment; downgrade refuses surviving marker                      | R2/R7/R12;03-01;PF-009   |
| ST-66 | Deactivate/reactivate or remove/repair bound-client eligibility                                                              | Eligibility loss atomically revokes binding/account and changes version; repair does not restore access; explicit restoration retains owner and retires old secrets              | R7;03-02;PF-003          |
| ST-67 | Full createApp machine invitation with sent/failed/unknown delivery, final generic-audit failure, and paused SMTP/revocation | Both audits use correct actors; final fields reflect post-outer-commit delivery; final-audit failure rolls back all durable effects/no mail; SMTP does not hold revocation locks | R8/R9/R10;03-03;PF-006   |

## Test placement and selection

| Phase | Planned oracle concern/files                                                                                                           | Selection                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1     | server tests/unit/service-accounts/policy.spec.test.ts; tests/integration/service-accounts/schema.spec.test.ts                         | ST-1–7/9–12; parser/schema/read only                     |
| 2     | server unit/integration service-accounts lifecycle and human-auth/role/credential/bulk boundaries; focused pentest additions           | ST-8/13–28/55/56/61/64–66; ST-25 version invariants only |
| 3     | server integration/E2E/pentest native-token, binding-route, full-createApp audit/delivery, credential-proof and concurrency boundaries | ST-29–46/62/63/67; actual usable-token outcomes          |
| 4     | SDK service-account transport/type contracts; CLI commands/client-service-account*.spec.test.ts; packed/E2E evidence                   | ST-47–60                                                 |

Do not substitute fixture SQL for production policy replacement, or prefeature token denial for
revocation of a formerly usable token. ST-57 has its own independent specification task and live
driver task before qualification: assurance/tests/service-account-packed.spec.test.ts and
compat/service-account-invitations*.ts, governed by03-04. No assertion is deferred until after its
implementation; these allocations correct the original plan before any immutable tests exist.

Paths are package-relative. Do not grow oversized general tests. Additional focused test files
are allowed only for these concerns; update literal structure inventories to the actual added
files, never remove old inventory entries. Implementation tests live in separate *.impl.test.ts
files and may inspect implementation. The parent updates each task immediately, never siblings.

## Commands and evidence

Start `pnpm test:changed`; if none selected, use the smallest relevant project. Per checkpoint,
run affected workspace lint/typecheck/build plus `pnpm test:structure`; use targeted Vitest files
with server --project unit/integration/e2e/pentest as appropriate. Authentication phases require
`pnpm test:pentest`, browser regressions require `pnpm test:ui`. Shared identity changes qualify
for the documented full-local exception when no narrower gate is credible; otherwise CI owns
`pnpm verify`. Never execute protected local .env/credential/TLS files without exact approval.
Use an owned clean verification worktree and isolated test HOME when possible; no operator config
is copied. Any required fixture-secret file access needs explicit authorization before the run.

Registered final assurance: `pnpm assurance:harness --project security --profile production-security`;
use registered `protocol` as applicable to the actual token boundary. Packed compatibility uses
registered `pnpm assurance:compat --select p1-admin` and
`pnpm assurance:compat --select compatibility`. The latter gains the explicitly specified03-04
direct machine journey; its existing credential-isolation evidence remains separately reported.
The unchanged p1-admin read journey is adjunct evidence only: direct new-feature ST-57 cannot
be credited from those reads. Extend existing
test seams only when needed for the new contract, not a parallel harness or blanket observer waiver.

The provenance helper reads root .npmrc as well as test setup's known .env access. Before executing
any affected command, obtain exact-path approval for protected files it will access/create, even
in a clean owned worktree; absence of operator files is not blanket permission. Never inspect or
hash protected files merely to classify them. This gate may block a run, not weaken its assertions.

Capture logs under the owned runtime scratch, report safe metrics/source hashes/qualifications,
and delete raw logs/results after qualification. Before completion verify docker ps -a, docker
network ls, docker volume ls and task-created images against the owned baseline. Use owned
lifecycle commands. Do not remove concurrent resources or run global prune.
