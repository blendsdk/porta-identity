# Task T-02: Isolate machine-upload authentication observation

> **Type**: Task (lightweight) · **Feature**: admin-service-accounts · **CodeOps Artifact Schema**: 1
> **Progress**: 4/4 tasks (100%)
> **Reasoning**: medium — deterministic database synchronization without changing security assertions
> **Baseline**: c800823ab103b38ffc1e2f6f15c8ca1cc024eb4e
> **Phase baseline tree**: 3dcbe57c9813a4f7b21d7beed39ae025f25ec2e2
> **Scope mode**: strict
> **Status**: Local work complete — remote integration acceptance required

## Objective

Fix the post-merge failure in `machine-upload.impl.test.ts` without skipping or weakening
the revoked-binding, strict-expiry, no-invitation, no-user or no-email assertions.
The CI error occurred in the observer before the actual security assertions.

**Smallest viable design:** Reserve a PostgreSQL observer connection before starting
authentication, and use that connection for the completion check. The observer must not
borrow the backend it is observing. Keep the existing real HTTP upload, transaction/lock
barriers, monotonic deadline and test timeouts unchanged. Add no production code or helper
framework; reuse the existing implementation-test file and pool.

## Regression and boundaries

- First add an internal-observer regression to the existing implementation test.
  Reserve one connection for observation, commit on a second connection and return it
  to the pool as the only idle connection. The old pool-based observer must fail even
  though the transaction committed; the isolated observer must pass.
- This is a regression of test internals, not a new product specification. Existing
  security specifications and all production behavior remain unchanged.
- Preserve all security cases and assertions. Do not increase timeouts, add retries,
  mock authority, remove cases or substitute elapsed time for transaction observations.
- Modification set: the one machine-upload implementation-test file, this plan folder
  and the admin-service-accounts feature roadmap.
- Temporary PostgreSQL and Redis use a unique scratch Compose project and loopback
  ports, existing images and test-only stores. Never reset existing developer stores.
- The user authorized normal test loading of the two repository dotenv paths earlier
  in this conversation; no secret inspection or publication is permitted.

## Tasks

- [x] T-02.1 Add the deterministic observer regression and confirm RED before changing synchronization. Verified 2026-11-18: the already-committed backend reproduced the exact 90-second CI observer error.
- [x] T-02.2 Use an independently reserved observer, release all checked-out clients in finally, and confirm GREEN with the unchanged revocation/expiry security assertions. Verified 2026-11-18: all three upload tests passed, including unchanged revoked-binding and strict-expiry cases.
- [x] T-02.3 Run scoped static/structure and integration checks, obtain independent correctness/security review and remove all task-created test infrastructure. Verified 2026-11-18: 602 integration tests, 179 structure contracts, lint/typecheck and independent reviews passed; isolated infrastructure removed.
- [x] T-02.4 Prepare the verified commit/PR handoff and final staged-diff review, with mandatory pre-merge and post-merge CI acceptance recorded on the PR. Verified 2026-11-18: explicit staged paths, diff whitespace, baseline alignment and complete handoff reviewed.

**Task verify:** Start with `pnpm test:changed`. Run
`pnpm --filter @portaidentity/server exec vitest run --project integration tests/integration/service-accounts/machine-upload.impl.test.ts`
against isolated test stores, then
`pnpm --filter @portaidentity/server exec vitest run --project integration tests/integration/service-accounts`
for the complete service-account feature, including machine HTTP and lifecycle-concurrency cases.
Run server lint, server typecheck and `pnpm test:structure`.
CI owns the full `pnpm verify`, browser, OIDC, Docker and dependency checks.

This changes a file-local test observer, not shared infrastructure, runner setup or product
security behavior. Local checks stay narrow under project guidance. Any security assertion
failure blocks progress; repeated stability runs are evidence, not a way to retry away failures.

**Review:** Independent correctness and security-coverage review is required. No OIDC model,
interaction, grant or token-contract change requires a provider specialist.
**Documentation:** No architecture or public API change is expected.
**Integration authority:** The user authorized this fix landing in develop. Use a fix branch
from current develop and a verified PR; no release, deployment or direct develop push.
Portfolio sync is deferred on this non-integration branch.

## Integration acceptance

Local task checkboxes describe work that can be verified before the tested commit is
published. Completion of that checklist does not claim the remote integration has passed.
Delivery still requires commit/push, a PR to develop, every pre-merge check passing,
the authorized merge and a successful post-merge develop run. Record those immutable
commit/run/merge links on the PR so recording success does not itself change the
already-tested revision or trigger an endless documentation-only acceptance loop.

## Evidence

- `pnpm test:changed` baseline passed 179 structure contracts; no affected unit tests selected.
- Isolated PostgreSQL/Redis scratch services are healthy on task-owned loopback ports, using pre-existing images. No developer stores are used.
- RED: the new internal-observer regression failed with `Initial authentication did not commit before body completion`, despite an explicit completed COMMIT. The two security scenarios were excluded only for this regression-only RED command, not changed or disabled.
- GREEN: the complete upload file passed all three tests, with no skips. Server lint and typecheck passed.
- Final `pnpm test:changed` passed 179 structure contracts; integration is explicitly selected because the changed file is outside unit selection.
- An expanded service-account-directory run exceeded the outer shell's 180-second limit without emitting a test verdict. Its process ended and left no active test database sessions. The same selection was then completed without that external limit; no assertion failure was discarded.
- The progress helper displays the correct mini-plan count but exits 1 for pre-existing full-plan-only `00-index.md` requirements. The documented lightweight checklist remains authoritative; no support tooling is changed.
- Correctness reviewer: no findings. Security reviewer initially raised SA-001 (major), alleging an initial-expiry-check ordering gap. Publication was paused while the reviewer checked the outer transaction owner in `routes/admin-invitations.ts:134`, since nested authentication does not issue its own COMMIT.
- Security reviewer explicitly withdrew SA-001 as a factual false positive after confirming the outer transaction commits only after the complete initial-authentication success callback. Final correctness and security reviews have no findings; see `00-quality-review.md`. No risk was waived and no assertions changed.
- Complete service-account integration selection: 56 files and 602 tests passed, with no skips. Explicit final structure run: 179 passed, zero failed.
- Cleanup: the unique scratch Compose project was torn down with `down -v`; Docker container, network and volume inventories confirm no task-owned resources remain. Pre-existing images were reused and retained. Verification logs, scratch Compose file and review diff were removed.
- Only commit/PR message files remain temporarily until the authorized integration workflow finishes.
- The final checklist item covers the locally verifiable handoff. Its original integration requirements remain mandatory in the explicit acceptance section and are not waived; PR comments will retain the actual CI/merge/post-merge evidence.
