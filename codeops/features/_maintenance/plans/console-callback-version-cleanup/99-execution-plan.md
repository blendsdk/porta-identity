# Task T-01: Porta Console callback URI, startup version log, and agent cleanup directive

> **Type**: Task (lightweight) · **Feature**: _maintenance · **CodeOps Artifact Schema**: 1
> **Progress**: 0/15 tasks (0%)
> **Issue**: [#141](https://github.com/blendsdk/porta-identity/issues/141)
> **Delivery**: branch `fix/141-console-callback-uri` from an up-to-date `develop`; three
> Conventional Commits; one pull request to `develop` (closes #141).
> **Preflight**: [00-preflight-report.md](00-preflight-report.md) — PF-001…PF-006 resolved and
> applied.

## Objective

Deliver three maintenance changes together:

1. **Console sign-in (issue #141).** On a fresh `porta init`, the admin native public client must
   accept the Porta Console loopback callback `http://127.0.0.1:<port>/api/oidc/callback` and
   `http://localhost:<port>/api/oidc/callback`, on any port (RFC 8252 §7.3 as implemented by
   `node-oidc-provider`). Only `/callback` and `/auth/callback` are registered today, so the
   Console authorization request fails with `invalid_redirect_uri` before the login page renders.
2. **Running-version visibility.** The server must report its release version in the startup log
   so an operator can identify the running build. The public `GET /health` response stays
   unchanged: it is unauthenticated, and every enforced fingerprinting control in the repository is
   public-surface-only. T-01.11 corrects the mis-scoped `AGENTS.md` invariant clause so the
   guidance matches that boundary (PF-001).
3. **Agent cleanup directive.** `AGENTS.md` must require the coding agent to remove every Docker
   container, network, volume, image, and test Porta installation it creates for a task.

## Scope

**In scope**

- Two extra loopback redirect URIs on the existing admin native client created by `porta init`.
- Unit and integration tests that pin the full five-URI list, plus a database-level
  `redirect_uris` assertion.
- Public docs: shared CLI + Console client wording, the one-time `porta client update` command for
  existing installations, and the corrected metadata response example.
- A `SERVER_VERSION` constant kept aligned by the existing sync script, a structure-test pin, and
  one `version` field in the `Server started` log entry.
- A surgical correction to the `AGENTS.md` product-version invariant clause so it covers
  public/unauthenticated responses and headers only (PF-001), plus the hand-authored cleanup prime
  directive in the same file.
- Verification: `yarn verify`, `yarn docs:build`, the `protocol`/`production-security` assurance
  harness, and a live authorize-endpoint probe with a negative control.

**Out of scope**

- No change to `/api/admin/metadata` selection, no dedicated Console client, no Console-repository
  change.
- No DB schema or data migration. The `clients.redirect_uris` column already stores `TEXT[]`
  (`packages/server/migrations/004_clients.sql:16`) and the ten-URI maximum is application-level
  (`packages/server/src/clients/validators.ts:92`), so the two extra URIs fit the existing schema.
  New installations receive them from `porta init`; existing installations are updated with
  `porta client update`. Applied migrations are immutable (`AGENTS.md`).
- No `version` field in `GET /health`; no new authenticated version endpoint.
- No `[::1]` redirect URI (the Console binds `127.0.0.1`; `validateRedirectUri` rejects `[::1]` in
  production at `packages/server/src/clients/validators.ts:145-154`).
- No fix for the unrelated open issue #47 (`/health` CLI contract mismatch).
- No hand edit of `RELEASE_NOTES.md`: the release workflow generates it from commit history
  (`.github/workflows/release.yml:96-115`).

## Confirmed decisions

| #   | Decision                                                                                                                                      | Source                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| D-1 | Add the two Console loopback URIs to the existing admin native client; keep the client name and selection                                     | Issue #141 accepted fix; user-approved plan   |
| D-2 | Unit and integration tests pin the full five-URI list                                                                                         | Issue #141 acceptance criteria                |
| D-3 | Docs: shared-client wording, existing-install `porta client update` tip, correct the stale metadata example                                   | User decision (docs + fix stale example)      |
| D-4 | Version is visible in the startup log only; no public response change; the `AGENTS.md` invariant clause is scoped to public surfaces (PF-001) | User decision; PF-001 resolution              |
| D-5 | `SERVER_VERSION` in `packages/server/src/version.ts`, synced like `SDK_VERSION`/`CLI_VERSION`; pino field                                     | User decision                                 |
| D-6 | Cleanup prime directive in the project `AGENTS.md` only, outside the CODEOPS markers                                                          | User decision                                 |
| D-7 | Verification: `yarn verify`, `yarn docs:build`, `protocol` + `production-security` harness, live probe                                        | User decision; `AGENTS.md` verification rules |
| D-8 | Live proof is an authorize-endpoint probe, not a Console UI run                                                                               | User decision                                 |
| D-9 | One combined pull request to `develop`; release notes come from commit messages, not a hand edit                                              | User decision; release workflow evidence      |

## Smallest viable design

- **#141:** two literal URIs appended to the existing `redirectUris` array in
  `packages/server/src/cli/commands/init.ts:343-347`; the provider already matches loopback ports
  flexibly and matches paths exactly (`node_modules/oidc-provider/lib/models/client.js:444-466`).
- **Version:** one constant in `packages/server/src/version.ts`, one entry in the existing
  `derivedVersions` list in `scripts/sync-versions.js`, and one extra pino field in the existing
  startup log call at `packages/server/src/index.ts:60`.
- **Cleanup directive:** one Markdown section in `AGENTS.md`; no tooling, no scripts, no CI change.

Rejected larger alternatives: dedicated Console client with metadata-selection change, Console-side
path change, dynamic client registration (RFC 7591), a public `/health` version field, a new
authenticated version endpoint, and a data migration. Each fails the minimum-sufficient-design rule
for this task.

## Tasks

### Phase 1 — Issue #141: Console callback URI

> **Phase baseline tree**: `975e8befbf987c4f8c0acb21f7b233fda3ebb57f` · scope: strict · expected
> paths: `packages/server/src/cli/commands/init.ts`,
> `packages/server/tests/unit/cli/commands/init.test.ts`,
> `packages/server/tests/integration/cli/init.test.ts`, `docs/cli/bootstrap.md`,
> `docs/api/authentication.md`

- [x] T-01.1 **Spec first (red).** Add a dedicated test in the `admin client creation` block of
      `packages/server/tests/unit/cli/commands/init.test.ts` asserting `createClient` is called with
      `redirectUris: ['http://127.0.0.1/callback', 'http://localhost/callback', 'http://127.0.0.1/auth/callback', 'http://127.0.0.1/api/oidc/callback', 'http://localhost/api/oidc/callback']`.
      Run `yarn workspace @portaidentity/server test:unit tests/unit/cli/commands/init.test.ts` and
      confirm it fails on the missing Console URIs.
      ✅ (completed: 2026-09-27 20:28)
- [x] T-01.2 **Implement.** Add the two Console URIs in
      `packages/server/src/cli/commands/init.ts:343-347` and rewrite the Step 7 comment to name both
      loopback consumers (CLI and Porta Console). Rerun the targeted unit command and confirm green.
      ✅ (completed: 2026-09-27 20:29)
- [x] T-01.3 **Integration.** In `packages/server/tests/integration/cli/init.test.ts`, mirror the
      five URIs at line 139 and assert `clientResult.rows[0].redirect_uris` equals the list in the DB
      check at lines 148-154. Run
      `yarn workspace @portaidentity/server test:integration tests/integration/cli/init.test.ts`
      (requires PostgreSQL, Redis, MailHog — start them with `yarn docker:up`).
      ✅ (completed: 2026-09-27 20:29)
- [x] T-01.4 **Docs — CLI.** Update `docs/cli/bootstrap.md`: item 3 of "What it does" names the
      shared CLI + Console client, and a `::: tip` block documents the one-time existing-install
      command `porta client update <client-uuid> --redirect-uris "http://127.0.0.1/callback,http://localhost/callback,http://127.0.0.1/auth/callback,http://127.0.0.1/api/oidc/callback,http://localhost/api/oidc/callback"`
      with `<client-uuid>` taken from the `ID` column of `porta client list --app <app-uuid>`
      (application UUID from `porta app list`), noting that the metadata `clientId` is the public
      OIDC identifier, not the update identifier. State that `--redirect-uris` replaces the complete
      stored list, so operators with custom URIs must include them alongside the five from
      `porta init` (PF-004; RV-001).
      ✅ (completed: 2026-09-27 20:31)
- [x] T-01.5 **Docs — API.** Update the metadata section of `docs/api/authentication.md`: state that
      the returned `clientId` is the shared admin native client used by the `porta` CLI and the
      Porta Console over loopback, and correct the stale example JSON to the actual response shape
      `{ "issuer", "orgSlug", "clientId" }` (`packages/server/src/server.ts:240-244`).
      ✅ (completed: 2026-09-27 20:31)
- [x] T-01.6 **Structure and docs build.** Run `yarn test:structure` and `yarn docs:build`.
      ✅ (completed: 2026-09-27 20:31)
- [x] T-01.7 **Live probe (acceptance criterion #1, PF-003).** With the dev stack running
      (`yarn docker:up`), create a fresh scratch installation:
      `docker compose -f docker/docker-compose.yml exec -T postgres createdb -U porta porta_probe`
      (only after confirming `porta_probe` does not already exist), then `yarn migrate`, then a
      non-interactive
      `porta init --email admin@probe.local --given-name Probe --family-name Admin --password '<dev password>'`.
      Run the server on port `3210` with `NODE_ENV=development`,
      `DATABASE_URL=postgresql://porta:porta_dev@127.0.0.1:5432/porta_probe`,
      `REDIS_URL=redis://127.0.0.1:6379`, `ISSUER_BASE_URL=http://127.0.0.1:3210`, a development
      `COOKIE_KEYS` value, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025`,
      `SMTP_FROM=noreply@porta.local`, and a 64-hex `SIGNING_KEY_ENCRYPTION_KEY`. Read `issuer` and
      `clientId` from `GET http://127.0.0.1:3210/api/admin/metadata`, then confirm:
      (a) `GET {issuer}/auth/authorize?response_type=code&client_id={clientId}&scope=openid&redirect_uri=http://127.0.0.1:4780/api/oidc/callback&code_challenge=<valid S256 challenge>&code_challenge_method=S256`
      returns `303` (redirect toward the login interaction), and
      (b) the same request with `redirect_uri=http://127.0.0.1:4780/api/oidc/evil` returns `400`
      with `invalid_redirect_uri`.
      Clean up immediately: stop the server, drop the `porta_probe` database, and remove only the
      Docker resources this task created.
      ✅ (completed: 2026-09-27 20:32)

### Phase 2 — Startup version log

> **Phase baseline tree**: `f9769c2d1d30c52aa8fa95abeeccbfdb4207aeba` · scope: strict · expected
> paths: `packages/server/src/version.ts`, `packages/server/src/index.ts`,
> `scripts/sync-versions.js`, `repo-tests/monorepo/release.spec.test.mjs`,
> `docs/guide/deployment.md`

- [x] T-01.8 **Spec first (red).** Extend `repo-tests/monorepo/release.spec.test.mjs` with:
      (a) `packages/server/src/version.ts` contains `SERVER_VERSION = '<coordinated version>'`,
      (b) `packages/server/src/index.ts` logs `version: SERVER_VERSION` in the `'Server started'`
      call, and (c) `scripts/sync-versions.js` registers `packages/server/src/version.ts` in its
      `derivedVersions` list (PF-005). Run `yarn test:structure` and confirm it fails because the
      constant does not exist.
      ✅ (completed: 2026-09-27 20:44)
- [x] T-01.9 **Implement.** Add `packages/server/src/version.ts` with the documented
      `SERVER_VERSION` constant, add the matching `derivedVersions` entry to
      `scripts/sync-versions.js`, and include `version: SERVER_VERSION` in the startup log call at
      `packages/server/src/index.ts:60`. Run `node scripts/sync-versions.js --check`,
      `yarn test:structure`, and `yarn workspace @portaidentity/server typecheck`; all must pass.
      ✅ (completed: 2026-09-27 20:44)
- [x] T-01.10 **Docs — deployment.** In the Logging section of `docs/guide/deployment.md`, note that
      the `Server started` entry carries the running version field.
      ✅ (completed: 2026-09-27 20:45)

### Phase 3 — Agent cleanup directive

> **Phase baseline tree**: `ffa5eb4b309ba881696147e27b962ace6baa8c9a` · scope: strict · expected
> paths: `AGENTS.md`

- [x] T-01.11 Edit `AGENTS.md` directly after `# Project guidance` and before the
      `<!-- CODEOPS-PROJECT:START -->` marker:
      (a) add the hand-authored prime directive section headed
      `## Prime directive — leave no test infrastructure behind` (PF-006). The section requires:
      teardown of every task-created container, compose project, network, volume, image, and Porta
      installation; use of the repository's owned lifecycle commands (`yarn docker:down`,
      `yarn harness:stop`, the assurance harness cleanup); distinct scratch compose project names
      and `docker run --rm`; dropping scratch test databases; never removing or globally pruning
      resources the agent did not create; and a final `docker ps -a` / `docker network ls` /
      `docker volume ls` check with a reported recovery command when cleanup cannot complete.
      (b) surgically scope only the product-version clause of the security invariant so it reads as
      a prohibition on public or unauthenticated responses and headers; leave every other item in
      that sentence unchanged (PF-001). Keep the `## Security invariants` heading intact
      (`repo-tests/monorepo/workspace-layout.spec.test.mjs:280`).
      ✅ (completed: 2026-09-27 20:49)

### Phase 4 — Integrated verification and delivery

- [ ] T-01.12 Run `yarn docker:up`, then `yarn verify`, then `yarn docs:build`; all must pass with
      services available. Then boot the server once against a scratch `porta_probe` installation (as
      in T-01.7) and confirm the `Server started` log entry contains the `version` field (PF-002);
      drop the scratch database afterwards.
- [ ] T-01.13 Run `yarn assurance:harness --project protocol --profile production-security` and
      record the outcome, including its exit taxonomy.
- [ ] T-01.14 Cleanup and evidence: remove the dev stack the task started (including volumes when
      the task created them) and the scratch database; confirm `docker ps -a`, `docker network ls`,
      and `docker volume ls` show nothing task-created. Never remove pre-existing developer
      resources.
- [ ] T-01.15 Deliver with the git-commit skill in push mode: three commits —
      `fix(init): register the Porta Console callback URI on the admin native client`,
      `feat(server): report the running version in the startup log`,
      `docs(agents): add the cleanup prime directive and scope the version-fingerprint invariant` —
      then open the pull request to `develop` with `Closes #141`. The first commit body carries the
      existing-installation upgrade note (the one-time `porta client update` command with the five
      URIs, client ID from `GET /api/admin/metadata`, and the replace-list warning), because the
      release workflow generates `RELEASE_NOTES.md` from commit history
      (`.github/workflows/release.yml:96-115`).

**Verify**: `yarn docker:up && yarn verify && yarn docs:build`; then
`yarn assurance:harness --project protocol --profile production-security`; then the cleanup
evidence check from T-01.14.

## References

- Issue: <https://github.com/blendsdk/porta-identity/issues/141>
- `packages/server/src/cli/commands/init.ts:337-352` — admin client registration.
- `packages/server/src/server.ts:232-244` — metadata client selection.
- `packages/server/src/clients/validators.ts:145-154,92` — loopback `http` allowed in production; max
  10 URIs.
- `node_modules/oidc-provider/lib/models/client.js:444-466` — native loopback matching (port
  ignored, path exact).
- `packages/server/src/middleware/health.ts:39-43` — public health response (unchanged).
- `scripts/sync-versions.js` — derived version constants; `repo-tests/monorepo/release.spec.test.mjs:70-79`
  — coordinated-version pin.
- `.github/workflows/release.yml:96-115` — release notes are generated from commits.
- `codeops/features/_maintenance/plans/console-callback-version-cleanup/00-preflight-report.md` —
  preflight findings PF-001…PF-006 and their resolutions.
