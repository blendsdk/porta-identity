# Current State: Production Hardening

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### Config (`src/config/schema.ts`, `src/config/index.ts`)

- Zod schema with `min(16)` on each cookie key.
- `NODE_ENV` field exists but has no conditional refinement — dev and prod are validated identically.
- `.env.example` ships placeholder values: `COOKIE_KEYS=dev-cookie-key-change-me-in-production`, `TWO_FACTOR_ENCRYPTION_KEY=0123456789abcdef…`, `DATABASE_URL=postgresql://porta:porta_dev@…`, `ISSUER_BASE_URL=http://localhost:3000`, `LOG_LEVEL=debug`, `SMTP_HOST=localhost`. All of these parse cleanly today.

### Bootstrap (`src/index.ts`)

- Sequential startup; calls `app.listen`.
- SIGTERM/SIGINT handler calls `server.close()` but does **not** await it — relies on the 10s `setTimeout` to `process.exit(1)` if things stall.
- No `app.proxy` assignment anywhere.

### Server (`src/server.ts`)

- Middleware order: `errorHandler → requestLogger → selective bodyParser → routes → OIDC`.
- `/health` mounted via `src/middleware/health.ts` and does DB + Redis checks. This conflates liveness and readiness — if Redis flaps, k8s will kill the pod.
- No `/ready`, no `/metrics`.

### Error handler (`src/middleware/error-handler.ts`)

- Presently logs with pino and returns `{ error: { code, message } }`.
- Needs a confirmation test that it never attaches `err.stack` in production responses.

### OIDC cookies (`src/oidc/configuration.ts`)

- `cookies.short` and `cookies.long` — need to verify `secure: true` when issuer is HTTPS, and `sameSite: 'lax'` across the board.

### CI

- `.github/workflows/` does **not** exist.

## Relevant Files

| File | Purpose | Changes |
|---|---|---|
| `src/config/schema.ts` | zod schema | Add `trustProxy`, `metricsEnabled` fields + `superRefine` |
| `src/config/index.ts` | config loader | Propagate new fields |
| `src/index.ts` | bootstrap | `await server.close()`; conditional `app.proxy` |
| `src/server.ts` | app factory | Mount `/ready` and `/metrics` (conditional) |
| `src/middleware/health.ts` | Reference for readiness | Leave unchanged (liveness) |
| `src/middleware/ready.ts` | **new** | DB+Redis probe w/ 2s timeouts |
| `src/middleware/metrics.ts` | **new** | `prom-client` registry + handler |
| `src/middleware/error-handler.ts` | audit | Ensure no `stack` leak |
| `src/oidc/configuration.ts` | audit | Cookie flags |
| `.env.example` | docs | Add `TRUST_PROXY`, `METRICS_ENABLED` |
| `package.json` | deps | Add `prom-client` |
| `.github/workflows/ci.yml` | **new** | `yarn verify` on PR |

## Gaps Identified

### Gap 1: No production fail-fast

**Current:** `.env.example` values pass validation with `NODE_ENV=production`.
**Required:** Refuse to boot with a clear multi-line error.
**Fix:** `superRefine` in `src/config/schema.ts`.

### Gap 2: Liveness and readiness conflated

**Current:** `/health` does DB+Redis I/O; k8s will kill the pod on transient Redis hiccups.
**Required:** `/health` = process-up; `/ready` = DB+Redis reachable.
**Fix:** New `src/middleware/ready.ts`; slim down `/health` to remove external I/O (or leave `/health` with DB+Redis and add `/ready` that mirrors — then plan followup to move liveness to pure process up. Simpler: keep `/health` as-is for backwards compat and add `/ready` as the new recommended probe; deprecate nothing).

### Gap 3: No proxy trust knob

**Current:** `ctx.ip` is `socket.remoteAddress` (always the load balancer) and `secure` cookies never flip.
**Required:** Opt-in `TRUST_PROXY=true` flag.
**Fix:** Read from config, set `app.proxy = config.trustProxy`.

### Gap 4: Graceful shutdown doesn't await server

**Current:** `server.close()` fired without `await`; relies on 10s timer.
**Required:** Promisify `server.close()`, await it, then disconnect DB+Redis.
**Fix:** Small refactor in `src/index.ts`.

### Gap 5: No metrics hook

**Current:** No observability endpoint.
**Required:** Optional `/metrics`.
**Fix:** New `src/middleware/metrics.ts`; mounted conditionally.

### Gap 6: No CI

**Current:** No workflow file.
**Required:** `yarn verify` on PRs.
**Fix:** `.github/workflows/ci.yml` with service containers.

## Dependencies

### Internal

- `src/lib/database.ts` — reuse `getPool()` for `/ready`
- `src/lib/redis.ts` — reuse Redis client for `/ready`
- `src/lib/logger.ts` — for config-refinement fatal log

### External

- `prom-client` (new devDep→dep) for Phase C

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `superRefine` is too strict and blocks a legitimate prod config | Low | High | Keep the unsafe-value list small and specific; each rule documented; escape hatch `PORTA_SKIP_PROD_SAFETY=true` for emergencies (logged as ERROR on startup). Include this escape hatch in Phase A spec. |
| `/ready` timeouts mask real failures | Low | Medium | Log failures at `warn` with the specific sub-check that failed. |
| `/metrics` becomes a surprise scrape endpoint | Low | Medium | Default off, require `METRICS_ENABLED=true`, document that it should be bound to an internal port when enabled. |
| GitHub Actions service containers slow the build | Medium | Low | Accept; `yarn verify` is ~78s; services add maybe 20s. |
