# Ambiguity Register: Security Scan Remediation

> **Status**: ✅ GATE PASSED — approved scope; protected-fixture execution deferred until approval
> **CodeOps Artifact Schema**: 1
> **Last Updated**: 2026-11-08

## Authority and boundaries

The user requested one GitHub issue per scan finding, followed by review, analysis, planning,
preflight, remediation, and verification of every finding. This is a cross-cutting bugfix campaign,
so the repository's maintenance task lane owns the work. No new product capability is requested.

| Boundary                    | Scope                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planning target             | The eleven findings tracked by GitHub issues #227–#237                                                                                                                                |
| Context artifacts           | Supplied scan report, findings, provenance and outcome; affected source, existing tests, public and technical documentation; repository workflow policy                               |
| Authorized modification set | Remediation plans and evidence, affected implementation/tests/docs, and derived maintenance roadmap entries after a plan exists                                                       |
| Excluded                    | `scripts/pending-invitations.sql`; real credentials and deployment configuration; mutation/CI promotion (#127); statistical timing claims; release, deployment, publishing and `main` |
| Branch                      | `fix/security-scan-remediation`, based on the scanned revision                                                                                                                        |
| Current mode                | Normal decision mode; historical auto-design/auto-commit authority is not carried forward                                                                                             |

Only this register is authored while material decisions remain unresolved. No executable plan,
preflight pass, product fix, runtime reproduction, or test result is implied by this document.

## Verified scan provenance

| Field                  | Evidence                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| Scan                   | Completed full Standard scan, Codex Security 0.8.3, `gpt-6.1-sol`                                               |
| Original revision      | `29de116ed23f091d51b9752f649ccde9e555e846`                                                                      |
| Synthetic revision     | `cd7764984f57e9a29b4d57b0a5c65bacf9ad48d6`                                                                      |
| Published source links | `c30c42f51f820b303729bae40875f5581a5f1423`; all 24 cited files have identical Git blobs in the scanned revision |
| Finding identity       | 11 unique scanner finding IDs; 11 GitHub issues created and individually read back as open                      |
| Severity               | Nine high, one medium, one low; these are scanner ratings, not reproduced-exploit claims                        |
| Coverage               | 256 of 2,207 estimated snapshot files fully reviewed; whole-tree scope is not exhaustive review                 |
| Validation             | Source-only. Cross-tenant SSO additionally depends on unverified provider cookie/session reuse                  |

The source links deliberately use the verified published parent, because the scanner-wrapper
commit is local only. The original scanned revision remains recorded in every issue. No push
was performed to make links available.

## Finding inventory

| Issue                                                         | Finding ID                     | Reported severity       | Subject                                           | Remediation status         |
| ------------------------------------------------------------- | ------------------------------ | ----------------------- | ------------------------------------------------- | -------------------------- |
| [#227](https://github.com/blendsdk/porta-identity/issues/227) | `csf_1c9a5c07bff44dbdfecd6b13` | High                    | Branding custom CSS script injection              | Not fixed                  |
| [#228](https://github.com/blendsdk/porta-identity/issues/228) | `csf_3322f285e75877ce7a90f0d9` | High                    | Ordinary tokens accepted by Admin API             | Not fixed                  |
| [#229](https://github.com/blendsdk/porta-identity/issues/229) | `csf_5d0cfe7c6dc0c68391e8d581` | High                    | Stronger administrator credential takeover        | Not fixed                  |
| [#230](https://github.com/blendsdk/porta-identity/issues/230) | `csf_8e668418e3dc4f0416c00b05` | High                    | Bulk protected lifecycle bypass                   | Not fixed                  |
| [#231](https://github.com/blendsdk/porta-identity/issues/231) | `csf_1a46488d04d277ddc2377293` | High; medium confidence | Cross-tenant SSO account/client mismatch          | Runtime validation pending |
| [#232](https://github.com/blendsdk/porta-identity/issues/232) | `csf_68350f3069ae94b16c1f76ce` | High                    | Abandoned TOTP replaces enrolled email MFA        | Not fixed                  |
| [#233](https://github.com/blendsdk/porta-identity/issues/233) | `csf_3b54810ff1a1b11811a968bc` | High                    | Required MFA method bypass                        | Not fixed                  |
| [#234](https://github.com/blendsdk/porta-identity/issues/234) | `csf_47fc8aab3da0a8b540210cd8` | High                    | Password recovery retains old authority           | Not fixed                  |
| [#235](https://github.com/blendsdk/porta-identity/issues/235) | `csf_1c1f6ed330d6b5ff9a61f93f` | Low                     | CSV terminal controls                             | Not fixed                  |
| [#236](https://github.com/blendsdk/porta-identity/issues/236) | `csf_9f06604c0674be28b7d1a698` | High                    | Installer creates secrets with unsafe permissions | Not fixed                  |
| [#237](https://github.com/blendsdk/porta-identity/issues/237) | `csf_2fb4a1d45ee9f88fbd31110a` | Medium                  | Public backend trusts supplied client IP          | Not fixed                  |

## Decisions

| ID    | Category                       | Decision needed                                                                                                   | Viable alternatives under review                                                                                                                                                                                            | Authority / status                                                                                               |
| ----- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| AR-01 | Scope / security               | Remediate the eleven findings without expanding into a new platform or assurance program                          | Direct fixes using existing patterns; no optional subsystem or dependency                                                                                                                                                   | ✅ Resolved — user requested all eleven fixes; repository boundaries remain binding                              |
| AR-02 | Integration / security         | Which human administrative clients may obtain Admin API authority, and how are historical registrations admitted? | Constrained canonical Admin application/organization clients with full-Super-Admin-only management and explicit historical registration review; or introduce a durable bootstrap-client identity and narrower admission     | ✅ Resolved — user authorized the canonical-client restriction; production inventory withdrawn as a prerequisite |
| AR-03 | Behavior / security            | Preserve CSS-only branding or remove custom CSS?                                                                  | Retain benign CSS with ingestion and stored-data rendering controls; remove customization                                                                                                                                   | ✅ Resolved — retain CSS-only branding; reject HTML openers and suppress unsafe stored values                    |
| AR-04 | Stakeholder / security         | Which administrators may manage another administrator's credentials/factors?                                      | Existing effective-permission subset ceiling; or full-Super-Admin-only control-plane credential management                                                                                                                  | ✅ Resolved — effective-permission subset ceiling with bootstrap protection retained                             |
| AR-05 | State / security               | How should users with an enrolled factor incompatible with a changed policy proceed?                              | Verify existing factor before required-method enrollment; or fail closed pending authorized administrative reset                                                                                                            | ✅ Resolved — verify existing factor, then require the policy method; never replace on password alone            |
| AR-06 | State / integration            | Should old authority be revoked on recovery only, or on every password replacement?                               | Recovery-specific atomic operation; or revocation on all shared password writes with caller compatibility review                                                                                                            | ✅ Resolved — recovery-specific atomic revocation, other reset links retired, pending continuations checked      |
| AR-07 | Deployment / compatibility     | Change fresh-install defaults only, or alter existing deployments?                                                | Fresh defaults use loopback while saved settings remain explicit operator decisions; existing deployment changes require separate exact-path authorization                                                                  | ✅ Resolved — fresh defaults change; retained public binding warns; saved topology is never rewritten            |
| AR-08 | Verification / sensitive files | Authorize exact synthetic installer configuration fixture paths before creating, reading or removing them         | Use only named task-owned paths with dummy values; never inspect real configuration                                                                                                                                         | ✅ Resolved — user approved the exact root; 9 installer tests and 179 structure contracts passed                 |
| AR-09 | Verification                   | Confirm the verification gates and completion boundary                                                            | Specification-first tests; affected checks and structure; pentests and applicable production-security/protocol harness; UI for browser behavior; CLI compatibility from a clean revision; CI full verify before integration | ✅ Resolved — implementation and local gates completed; CI full verify remains the integration gate              |

## Review notes

- A blind independent design challenge completed in session `ses_e488b0978ffeXtNo0c0PvF5lzM`.
  The reviewer made no mutations and ran no tests. It confirmed all eleven source gaps, while
  retaining the unresolved runtime condition for #231. Its advice is not user approval.
- MFA fixes #232 and #233 must be designed together. Enforcing the required method must not
  create a password-only path for replacing an already enrolled factor.
- Admin token purpose (#228) and account/client tenant binding (#231) are distinct controls.
  Fixing one cannot be used as proof that the other is safe.
- The public issues contain bounded summaries, source locations, limitations, and acceptance
  checks, not real credentials or runnable exploit payloads.
- #127 remains open and unchanged (last update read back as 2026-09-25T06:28:32Z).
- No services, containers, installations, synthetic credential files, or temporary files have
  been created during triage.

## Approved remediation package (implemented)

The user authorized implementation of these bounded corrections. They preserve existing behavior
except where a change is explicitly listed. No new dependency, generalized security subsystem,
per-tenant provider fleet, or assurance framework was added.

| Issues    | Recommended correction                                                                                                                                                                                                                                                                                                                                                                                        | Grounding and compatibility constraint                                                                                                                                                                                                                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #227      | Keep CSS-only branding; reject literal `<` in new input and suppress unsafe existing stored CSS at rendering. Use a value-free diagnostic for suppression.                                                                                                                                                                                                                                                    | `packages/server/src/organizations/validators.ts:57`; `packages/server/src/auth/effective-branding.ts:104`. This closes HTML escape, not all harmful styling. Removing customization remains a viable but breaking alternative.                                                                                                                                      |
| #228      | Accept only active clients in the canonical Admin application and super-admin organization; reserve their creation and security-sensitive changes to full Super Admin. Decide historical admission before implementation.                                                                                                                                                                                     | `packages/server/src/middleware/admin-auth.ts:215`; `packages/server/src/clients/service.ts:189`; `packages/server/src/cli/commands/init.ts:340–419`. No durable protected bootstrap-client identity is recorded. Documented programmatic clients must be considered, not silently removed.                                                                          |
| #229      | Use authoritative actor/target effective permissions: a target's canonical Admin permissions must be a subset of the actor's. Cover password set/clear and factor disable/reset/recovery, both route families, and credential-bearing direct service updates.                                                                                                                                                 | `packages/server/src/users/service.ts:247–256,463`; `packages/server/src/routes/two-factor-admin.ts:123–239`. Preserve bootstrap protection. The service accepts email changes, but the current HTTP schema does not; do not claim an exposed HTTP email-change exploit. Full-Super-Admin-only control-plane credential management is a viable stricter alternative. |
| #230      | Check protected targets inside each item's transaction, retain concealed per-item failure codes, align suspension permission with the individual route, and invalidate authority/cache after commit.                                                                                                                                                                                                          | `packages/server/src/lib/bulk-operations.ts:115–151,229–252`; `packages/server/src/lib/admin-permissions.ts:31–32`. Raw bulk `BEGIN` is not visible to transaction-local after-commit hooks; use a real transaction-bound item operation.                                                                                                                            |
| #231      | Require account/client/issuer organization agreement before SSO reuse, consent and issuance; require target-organization login on mismatch. Preserve same-organization SSO and correct silent-auth errors.                                                                                                                                                                                                    | `packages/server/src/oidc/account-finder.ts:66`; `packages/server/src/routes/interactions.ts:1146`. Test authorization, userinfo and refresh context separately. Retained-cookie runtime proof remains required; no reproduced exploit is claimed.                                                                                                                   |
| #232–#233 | Separate first enrollment, existing-factor challenge and verified-factor migration in trusted interaction state. Reject/restart legacy in-flight states. Enforce current policy and persisted enrollment at reveal and commit; delete abandoned TOTP on email enrollment. Verify an existing incompatible factor before enrolling the required method, then prove the required factor before login completes. | `packages/server/src/routes/two-factor.ts:555–676`; `packages/server/src/two-factor/service.ts:265–340,719–747`. Password-only replacement is prohibited. Fail-closed administrative-reset-only migration would strand the bootstrap user under current protection. Preserve documented magic-link authentication semantics.                                         |
| #234      | Make recovery token consumption, password replacement, durable audit and authority revocation atomic using existing transaction/revocation helpers. Invalidate other outstanding reset links and pre-reset authentication continuations for the subject. Defer cache/Redis cleanup until commit.                                                                                                              | `packages/server/src/routes/password-reset.ts:498–542`; `packages/server/src/lib/authority-revocation.ts:21`; `packages/server/src/oidc/adapter-factory.ts:63–65`. Nested pending-factor identity is not currently collected as an account reference. Recommend recovery-specific semantics; changes to all password-write consumers need separate confirmation.     |
| #235      | Sanitize controls only for interactive stdout while preserving CSV separators. Keep file and noninteractive payload content, appended newline and informational-output behavior unchanged.                                                                                                                                                                                                                    | `packages/cli/src/commands/exports.ts:100–111`; `packages/cli/src/output.ts:28–40,114–115`. The existing sanitizer replaces newlines, so document structure must be preserved deliberately. Exact machine-only stdout is a separate compatibility change and is not included.                                                                                        |
| #236      | Restrictive creation permissions, an exclusive private same-directory temporary file, atomic replacement and safe owned destination checks before reuse. Reject linked/nonregular/unsafe targets; preserve safe saved values during reinstall.                                                                                                                                                                | `install-porta.sh:596–600,676–707`. Umask alone does not repair permissive existing targets. Rejecting symlink-managed configuration is an explicit compatibility decision. No real installation file may be inspected or rewritten.                                                                                                                                 |
| #237      | Change fresh defaults and Compose fallback to loopback, warn about retained public binding plus proxy trust, and document explicit external-proxy versus direct-exposure choices. Do not rewrite saved topology.                                                                                                                                                                                              | `install-porta.sh:501,512,722`; `packages/server/src/server.ts:114–119`. Direct exposure requires forwarding trust disabled; external proxies require operator-controlled network isolation. Remote/container proxy topologies remain supported through explicit configuration.                                                                                      |

### Reconciliation

**Challenger: converged** on direct controls using existing patterns rather than new frameworks.
**Hardening changed the proposal:** remove the false assumption that a protected bootstrap client
already exists; include verified-factor migration to avoid bootstrap lockout; preserve current
noninteractive export behavior; include pre-reset pending authentication continuations in recovery
tests. The historical administrative-client inventory was withdrawn as a prerequisite; the
canonical-client restriction and full-Super-Admin management boundary were authorized instead.

**Confidence:** high for the source gaps and direct-control approach; medium for MFA upgrade
compatibility and the unexecuted cross-tenant SSO path. A different effective provider session
partition could invalidate that finding's claimed runtime path.

### Implementation evidence

| Area      | Implemented control                                                                                                          | Tests                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| #227      | Shared `isSafeBrandingCustomCss`, ingestion rejection, legacy-value suppression                                              | `organizations/validators.spec.test.ts`, `auth/effective-branding.spec.test.ts` |
| #228      | Issuing-client canonical app/org check; full-Super-Admin client management                                                   | `middleware/admin-auth.test.ts`, `clients/service.test.ts`                      |
| #229      | `admin-authority-ceiling.ts` applied to password, email verification and factor recovery                                     | `rbac/admin-authority-ceiling.spec.test.ts`, users/two-factor route suites      |
| #230      | Transaction-bound protected checks; concealed results; post-commit cache invalidation; suspension permission                 | `lib/bulk-protected.spec.test.ts`, bulk/admin suites                            |
| #231      | Account/client/issuer org agreement; consent account-tenant check; pending-factor reference                                  | account-finder, RBAC claim and interactions suites                              |
| #232–#233 | Enrollment/challenge/migration states; policy at reveal and commit; abandoned-TOTP cleanup; deferred email-migration cleanup | two-factor service, route, security and login-boundary suites                   |
| #234      | Conditional single-use consumption, atomic password/audit/revocation, other reset links retired                              | `routes/password-reset.test.ts`                                                 |
| #235      | Interactive-only export sanitizer preserving CSV structure                                                                   | `exports-terminal.spec.test.ts`, exports suite                                  |
| #236      | Restrictive umask, exclusive temporary file, atomic rename, linked-target rejection                                          | installer tests passed: mode 0600, atomic replacement, linked-target rejection  |
| #237      | Loopback fresh defaults and Compose fallback; public-binding warning; deployment guidance                                    | installer tests passed: loopback default, compose fallback, custom bind         |

### Existing-installation clarification

The user answered "yes, and yes" after being asked whether Porta is already used and whether
applications or scripts call its Admin API. Existing installations and custom Admin API consumers
therefore need an explicit compatibility path. Actual deployment client IDs are not required to
design or implement the repository fix; requesting that inventory now was premature. Use synthetic
clients to verify compatibility. The canonical-client restriction is implemented; operator
selection of real clients belongs to a separately authorized rollout. Do not silently remove
custom Admin consumers or automatically trust every historical registration. This answer does not
approve synthetic protected-fixture access.

### Verification proposal

Start with immutable specification tests and observed red results, then implementation and green
results, implementation diagnostics, and independent phase review. Use `pnpm test:changed` only
after fixture authorization and side-effect checks. Run affected lint/typecheck/build and structure
checks; server fixes also need pentests and registered production-security/protocol assurance;
browser changes need UI tests, and retained SPA/BFF changes need the OIDC harness. Run CLI
compatibility assurance from a clean committed revision if its contract changes. This campaign
crosses shared authentication, database and workspace boundaries, so a final local `pnpm verify`
is justified by the repository exception. CI full verification remains required before integration.
No commit, push, merge, release or deployment authority is inferred from this verification proposal.

### Protected-fixture approval request

Proposed exact task-owned fixture root:

`/tmp/opencode/codeops/runtime-2e64c189-6f5f-4970-9768-0e45862b48a1/security-scan-fixtures/`

Request approval to create, inspect and delete synthetic installer configuration and temporary
replacement fixtures only within that root, including their test-only `.env` files. Any generated
values are disposable test values and must never be printed or published. No operator or repository
`.env`, credential store, signing material or installation is included. Check later selectors for
other protected paths before running them; this request does not authorize unrelated fixtures.

The existing installer specification creates randomized target directories and `.env` files
(`repo-tests/monorepo/install-script.spec.test.mjs:52–58,138–163`). Its temporary root must be confined
to the approved task-owned root before running it. Without approval, do not run `pnpm test:changed`,
`pnpm test:structure` or `pnpm verify`, because they include that specification.
