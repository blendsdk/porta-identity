# Testing Strategy: ERP RBAC & Custom Claims in Playgrounds

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

This feature modifies a seed script and playground UI only — no changes to Porta core modules. Testing focuses on:

1. **Build verification** — TypeScript compilation for Porta core and BFF
2. **Existing test suite** — No regressions in the 1,818+ unit/integration tests
3. **Manual verification** — Seed + login + visual inspection of claims in dashboards

### Coverage Goals

- Unit tests: No new unit tests (seed script + playground UI are not unit-tested)
- Integration tests: Existing integration tests must continue passing
- Manual tests: Visual verification of claims in BFF and SPA dashboards

## Test Categories

### Automated Verification

| Test | Description | Priority |
|------|-------------|----------|
| `yarn build` | TypeScript compilation | High |
| `yarn verify` | Full lint + test suite | High |
| BFF build | `cd playground-bff && yarn build` | High |

### Manual Verification — Seed

| Step | Expected Result |
|------|----------------|
| Run `scripts/run-playground-reset.sh` | Seed completes without errors |
| Check console output | 5 roles, 10 permissions, 4 claims created |
| Check console output | All 5 active users have role + claim assignments |

### Manual Verification — BFF Dashboard

| Scenario | Steps | Expected Result |
|----------|-------|----------------|
| Login as ERP Admin | Login via no2fa org | Authorization panel shows: role=erp-admin, permissions=all 10, dept=Engineering, employee_id=EMP-001, cost_center=CC-1000, job_title=Platform Engineer |
| Login as Finance Manager | Login via email2fa org | Role=finance-manager, permissions=invoices:read/write+reports:read, dept=Finance |
| Login as Warehouse Operator | Login via totp2fa org | Role=warehouse-operator, permissions=inventory+orders:read, dept=Logistics |
| Login as Sales Rep | Login via optional2fa org | Role=sales-rep, permissions=orders+invoices:read, dept=Sales |
| Login as HR Specialist | Login via thirdparty org | Role=hr-specialist, permissions=employees, dept=Human Resources |
| UserInfo endpoint | Click UserInfo after login | Response contains roles, permissions, department, employee_id, cost_center, job_title |
| Introspection | Click Introspect | Response shows active token with scope |
| ID Token panel | View decoded ID token | Payload contains roles, permissions, custom claims |

### Manual Verification — SPA Playground

| Scenario | Steps | Expected Result |
|----------|-------|----------------|
| Login via SPA | Login as user@no2fa.local | ID token display shows authorization claims section |
| Token display | Expand ID token | Authorization claims (roles, permissions, profile) highlighted visually |

## Verification Checklist

- [ ] `yarn build` succeeds
- [ ] `yarn verify` passes (all existing tests)
- [ ] BFF build succeeds (`cd playground-bff && yarn build`)
- [ ] Seed script runs successfully
- [ ] BFF dashboard shows authorization panel for each user
- [ ] SPA playground shows claims in token display
- [ ] Debug log line removed from interactions.ts
- [ ] No regressions in existing functionality
