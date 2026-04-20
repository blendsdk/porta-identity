# Execution Plan: Production Hardening

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-19 23:45
> **Progress**: 0/26 tasks (0%)

## Overview

Four independent phases. Each ships green on `yarn verify` and can be stopped after. No phase depends on RD-11 or RD-13.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
|---|---|---|---|
| A | Config fail-fast (zod superRefine) | 1 | 2 h |
| B | Runtime hardening (`/ready`, proxy, shutdown, cookies) | 2 | 4 h |
| C | Metrics seam (`prom-client`) | 1 | 1.5 h |
| D | GitHub Actions CI | 1 | 1 h |

**Total: 5 sessions, ~8.5 h**

---

## Phase A: Config fail-fast

### Session A.1: Add `superRefine` + new fields

**Reference**: [Config Fail-Fast](03-config-fail-fast.md)

**Tasks**:

| # | Task | File |
|---|---|---|
| A.1.1 | Add `trustProxy`, `metricsEnabled` fields | `src/config/schema.ts` |
| A.1.2 | Implement `superRefine` with R1–R9 rules | `src/config/schema.ts` |
| A.1.3 | Honour `PORTA_SKIP_PROD_SAFETY=true` escape hatch | `src/config/schema.ts`, `src/config/index.ts` |
| A.1.4 | Expand config loader error rendering (per-line issues) | `src/config/index.ts` |
| A.1.5 | Update `.env.example` with `TRUST_PROXY`, `METRICS_ENABLED`, prod notes | `.env.example` |
| A.1.6 | Write unit tests A1–A13 | `tests/unit/config/schema.production.test.ts` |
| A.1.7 | `yarn verify` green | — |
| A.1.8 | Commit `feat(config): production safety refinement + skip hatch` | — |

**Deliverables**:
- [ ] All 13 unit tests pass
- [ ] `yarn verify` green

---

## Phase B: Runtime hardening

### Session B.1: `/ready`, `app.proxy`, shutdown

**Reference**: [Runtime Hardening](04-runtime-hardening.md)

| # | Task | File |
|---|---|---|
| B.1.1 | Read current `src/index.ts` to confirm shutdown shape | — |
| B.1.2 | Promisify `server.close()`, await in `shutdown()` | `src/index.ts` |
| B.1.3 | Set `app.proxy = config.trustProxy` in server factory | `src/server.ts` |
| B.1.4 | Create `src/middleware/ready.ts` with timeouts | `src/middleware/ready.ts` |
| B.1.5 | Mount `GET /ready` in `src/server.ts` | `src/server.ts` |
| B.1.6 | Write integration tests for `/ready` (happy + DB-down + Redis-down + timeout) | `tests/integration/ready.test.ts` |
| B.1.7 | `yarn verify` green |

### Session B.2: Error-handler + cookie audit

| # | Task | File |
|---|---|---|
| B.2.1 | Read `src/middleware/error-handler.ts`; confirm no `stack` in prod body | — |
| B.2.2 | Patch if needed + add prod-no-stack unit test | `src/middleware/error-handler.ts`, `tests/unit/middleware/error-handler.test.ts` |
| B.2.3 | Read `src/oidc/configuration.ts` cookie section | — |
| B.2.4 | Derive `secure` from `issuerBaseUrl`; ensure `httpOnly:true`, `sameSite:'lax'` | `src/oidc/configuration.ts` |
| B.2.5 | Unit tests: HTTPS→secure=true, HTTP→secure=false | `tests/unit/oidc/configuration.test.ts` |
| B.2.6 | `yarn verify` green |
| B.2.7 | Commit `feat(server): readiness probe, proxy trust, graceful shutdown, cookie audit` |

**Deliverables (Phase B)**:
- [ ] `/ready` returns 200/503 correctly
- [ ] `app.proxy` honours `TRUST_PROXY=true`
- [ ] Shutdown awaits `server.close()`
- [ ] Error handler no-stack-in-prod confirmed
- [ ] OIDC cookies safe on HTTPS

---

## Phase C: Metrics seam

### Session C.1

**Reference**: [Metrics Seam](05-metrics-seam.md)

| # | Task | File |
|---|---|---|
| C.1.1 | `yarn add prom-client@^15` | `package.json`, `yarn.lock` |
| C.1.2 | Create `src/middleware/metrics.ts` | `src/middleware/metrics.ts` |
| C.1.3 | Mount conditionally in `src/server.ts` | `src/server.ts` |
| C.1.4 | Integration tests C1–C4 | `tests/integration/metrics.test.ts` |
| C.1.5 | `yarn verify` green |
| C.1.6 | Commit `feat(observability): optional prom-client /metrics endpoint` |

**Deliverables (Phase C)**:
- [ ] `/metrics` 404 by default, 200 when enabled
- [ ] Counter increments per request

---

## Phase D: CI workflow

### Session D.1

**Reference**: [CI Workflow](06-ci-workflow.md)

| # | Task | File |
|---|---|---|
| D.1.1 | Create `.github/workflows/ci.yml` per spec | `.github/workflows/ci.yml` |
| D.1.2 | Open a throwaway branch + PR, verify workflow green | — |
| D.1.3 | Commit `ci: add GitHub Actions workflow for yarn verify on PR` |

**Deliverables (Phase D)**:
- [ ] Workflow file committed
- [ ] Green run on PR

---

## Task Checklist (All Phases)

### Phase A
- [ ] A.1.1 Add `trustProxy` + `metricsEnabled` fields
- [ ] A.1.2 Implement `superRefine` R1–R9
- [ ] A.1.3 `PORTA_SKIP_PROD_SAFETY` escape hatch
- [ ] A.1.4 Config loader per-issue error rendering
- [ ] A.1.5 `.env.example` updates
- [ ] A.1.6 Unit tests A1–A13
- [ ] A.1.7 `yarn verify`
- [ ] A.1.8 Commit

### Phase B
- [ ] B.1.1 Read shutdown shape
- [ ] B.1.2 Promisify `server.close`
- [ ] B.1.3 `app.proxy` toggle
- [ ] B.1.4 `src/middleware/ready.ts`
- [ ] B.1.5 Mount `/ready`
- [ ] B.1.6 `/ready` integration tests
- [ ] B.1.7 `yarn verify`
- [ ] B.2.1 Audit error-handler
- [ ] B.2.2 Error-handler test
- [ ] B.2.3 Audit OIDC cookies
- [ ] B.2.4 Derive `secure` from issuer
- [ ] B.2.5 Cookie unit tests
- [ ] B.2.6 `yarn verify`
- [ ] B.2.7 Commit

### Phase C
- [ ] C.1.1 `yarn add prom-client`
- [ ] C.1.2 `src/middleware/metrics.ts`
- [ ] C.1.3 Conditional mount
- [ ] C.1.4 Integration tests C1–C4
- [ ] C.1.5 `yarn verify`
- [ ] C.1.6 Commit

### Phase D
- [ ] D.1.1 `.github/workflows/ci.yml`
- [ ] D.1.2 Green PR run
- [ ] D.1.3 Commit

---

## Session Protocol

### Starting a Session

1. Agent start: `clear && sleep 3 && scripts/agent.sh start`
2. Reference: "Implement Phase X, Session X.Y per `plans/production-hardening/99-execution-plan.md`"

### Ending a Session

1. `clear && sleep 3 && yarn verify`
2. Commit per active commit mode (`gitcm` / `gitcmp`)
3. Agent finished: `clear && sleep 3 && scripts/agent.sh finished`
4. `/compact`

---

## Dependencies

```
Phase A ────┐
Phase B ────┼── both independent; any order
Phase C ────┘
Phase D — independent of A/B/C
```

Phases are independent. Recommended order A → B → C → D so CI green on the richer feature set.

---

## Success Criteria

1. ✅ All phase acceptance criteria from `01-requirements.md` met
2. ✅ `yarn verify` green at every commit
3. ✅ No regression in existing 2,189 unit+integration tests
4. ✅ Booting `NODE_ENV=production` with `.env.example` exits non-zero with clear errors
5. ✅ `/ready` returns 200 when healthy, 503 when not
6. ✅ Optional: GitHub Actions green on PR
7. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md` to reflect new env vars and observability seam
