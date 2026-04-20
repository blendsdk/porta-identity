# Requirements: Production Hardening

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)

## Feature Overview

Land the safety items that make Porta v5 safe to run outside a developer laptop, without starting the full RD-11 (Deployment) or RD-13 (Admin-Auth v2) work.

## Functional Requirements

### Must Have

- [ ] Config schema (`src/config/schema.ts`) refuses to boot when `NODE_ENV=production` AND any of:
  - `COOKIE_KEYS` still contains a dev placeholder (matches `/change.?me/i` or equals known example value) or any key < 32 chars
  - `TWO_FACTOR_ENCRYPTION_KEY` is missing, equals `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`, or decodes to < 32 bytes
  - `DATABASE_URL` password equals `porta_dev`
  - `ISSUER_BASE_URL` starts with `http://` (non-loopback)
  - `LOG_LEVEL === 'debug'` or `'trace'`
  - `SMTP_HOST` is `localhost` or `127.0.0.1` AND SMTP is used
- [ ] Error messages from the refinement name the offending field clearly (no cryptic zod paths)
- [ ] New `TRUST_PROXY` env var (boolean, default `false`); when true `app.proxy = true`
- [ ] New `GET /ready` endpoint performing DB `SELECT 1` + Redis `PING` with a 2s timeout each; returns 200 with JSON when healthy, 503 when not
- [ ] `/health` remains a liveness probe (process-up-only, no external I/O)
- [ ] Graceful shutdown awaits `server.close()` via promise; 10s kill-switch retained
- [ ] `error-handler.ts` does not serialise `err.stack` or internal details in production responses
- [ ] OIDC provider cookies: `httpOnly: true`, `sameSite: 'lax'`, `secure: true` in production (HTTPS issuer)
- [ ] New optional `GET /metrics` endpoint gated by `METRICS_ENABLED=true`, exposing `prom-client` default process metrics + one request counter
- [ ] GitHub Actions workflow at `.github/workflows/ci.yml` runs `yarn verify` on PRs to `main` with Postgres 16 + Redis 7 services
- [ ] `.env.example` documents `TRUST_PROXY` and `METRICS_ENABLED`
- [ ] All new/changed behavior covered by unit + integration tests
- [ ] `yarn verify` passes after each phase

### Should Have

- [ ] `/ready` wires into OpenAPI/Swagger doc if one exists (currently none — skip)
- [ ] `prom-client` counter labels: `method`, `route`, `status` (low cardinality only)

### Won't Have (Out of Scope)

- Production Dockerfile (RD-11)
- Blue-green deployment scripts (RD-11)
- Admin-API auth rework / OIDC-gated admin routes (RD-13)
- Backup/DR runbook (RD-11)
- OpenTelemetry distributed tracing (RD-11)
- Log aggregation / Sentry integration (RD-11)
- HTTPS termination inside the app (always external)

## Technical Requirements

### Performance

- `/ready` returns within 2.5s worst case (2s DB timeout + 2s Redis timeout, run in parallel).
- `/metrics` scrape should complete within 100ms under normal load.
- Config refinement runs once at startup; no hot-path cost.

### Compatibility

- Must not break existing unit/integration/e2e tests.
- Must not change behavior when `NODE_ENV !== 'production'` (dev & test stay identical).
- `TRUST_PROXY` and `METRICS_ENABLED` default off → no behavior change for existing users.

### Security

- Error responses in production: `{ error: { code, message, request_id } }`, no stacks, no internals.
- `/metrics` MUST NOT include per-user or per-token labels.
- Config refinement errors go to stderr (via logger.fatal) and cause `process.exit(1)`.

## Scope Decisions

| Decision | Options | Chosen | Rationale |
|---|---|---|---|
| How to detect dev placeholders | A. exact-string match. B. regex. C. entropy check. | A+B | Exact match for known values (`porta_dev`, the example 2FA key); regex for `change.?me`. Entropy check is too heuristic. |
| Readiness timeout | 1s / 2s / 5s | 2s each | Balance between false negatives and k8s readiness timeouts. |
| Metrics library | `prom-client` / `openmetrics` / custom | `prom-client` | De-facto Node.js standard, tiny footprint. |
| Metrics default | on / off | off (`METRICS_ENABLED=false`) | Avoid shipping an unauthenticated scrape endpoint by default. |
| Proxy trust default | on / off / auto-detect | off | Auto-detecting is fragile; operators opt in explicitly. |
| CI provider | GitHub Actions / CircleCI / GitLab | GitHub Actions | Repo lives on GitHub. Cheap to add; user can remove if they prefer a different CI. |

## Acceptance Criteria

1. [ ] Booting with `NODE_ENV=production` + `.env.example` values exits non-zero with a clear error listing each unsafe field
2. [ ] Booting with `NODE_ENV=development` and `.env.example` still works exactly as before
3. [ ] `curl http://localhost:3000/ready` returns 200 `{status:"ready",...}` when DB+Redis up; 503 when either is down
4. [ ] `curl http://localhost:3000/health` remains untouched
5. [ ] Graceful shutdown: `kill -TERM $pid` causes clean exit 0 within 10s; in-flight requests allowed to finish
6. [ ] `/metrics` returns 404 by default; returns Prometheus-formatted text when `METRICS_ENABLED=true`
7. [ ] Under `TRUST_PROXY=true`, `ctx.ip` reflects the `X-Forwarded-For` header
8. [ ] Error responses in production contain no `stack` field
9. [ ] `yarn verify` green on every phase
10. [ ] GitHub Actions workflow runs green on a test PR
