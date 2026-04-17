# Execution Plan: ERP RBAC & Custom Claims in Playgrounds

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-12 18:05
> **Progress**: 0/10 tasks (0%)

## Overview

Enrich playground seed data with realistic ERP roles/permissions/claims and display them prominently in both BFF and SPA playground dashboards.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
|-------|-------|----------|-----------|
| 1 | Seed Data + Cleanup | 1 | 20 min |
| 2 | BFF Dashboard | 1 | 25 min |
| 3 | SPA Playground | 1 | 15 min |
| 4 | Verification | 1 | 10 min |

**Total: 1 session, ~70 minutes**

---

## Phase 1: Seed Data & Cleanup

### Session 1.1: ERP Seed Data and Debug Cleanup

**Reference**: [Seed Data Spec](03-seed-data.md)
**Objective**: Replace generic RBAC/claims with ERP-style definitions, assign to all users, remove debug log

**Tasks**:

| # | Task | File |
|---|------|------|
| 1.1.1 | Replace ROLE_DEFS with 5 ERP roles | `scripts/playground-seed.ts` |
| 1.1.2 | Replace PERMISSION_DEFS with 10 ERP permissions | `scripts/playground-seed.ts` |
| 1.1.3 | Replace CLAIM_DEFS with 4 ERP claims (department, employee_id, cost_center, job_title) | `scripts/playground-seed.ts` |
| 1.1.4 | Update USERS array — add assignRoles and claims to all 5 active users | `scripts/playground-seed.ts` |
| 1.1.5 | Remove debug logger.info line from showConsent | `src/routes/interactions.ts` |

**Deliverables**:
- [ ] ERP seed definitions in place
- [ ] All 5 active users have role + claim assignments
- [ ] Debug log line removed
- [ ] `yarn build` passes

**Verify**: `clear && sleep 3 && yarn build`

---

## Phase 2: BFF Dashboard Authorization Panel

### Session 2.1: BFF Claims Display

**Reference**: [BFF Dashboard Spec](04-bff-dashboard.md)
**Objective**: Add authorization panel to BFF dashboard showing roles, permissions, and profile attributes

**Tasks**:

| # | Task | File |
|---|------|------|
| 2.1.1 | Extract roles, permissions, custom claims from ID token in dashboard route | `playground-bff/src/routes/dashboard.ts` |
| 2.1.2 | Add authorization panel template to dashboard | `playground-bff/views/dashboard.hbs` |
| 2.1.3 | Add authorization panel CSS styles | `playground-bff/public/css/style.css` |

**Deliverables**:
- [ ] Dashboard route passes RBAC/claims data to template
- [ ] Authorization panel renders with roles, permissions, profile attributes
- [ ] Styled with badges, tags, and table
- [ ] BFF builds: `cd playground-bff && yarn build`

**Verify**: `clear && sleep 3 && cd playground-bff && yarn build`

---

## Phase 3: SPA Playground Claims Display

### Session 3.1: SPA Claims Highlighting

**Reference**: [SPA Playground Spec](05-spa-playground.md)
**Objective**: Display RBAC and custom claims in SPA token panels

**Tasks**:

| # | Task | File |
|---|------|------|
| 3.1.1 | Add renderAuthorizationClaims() function to tokens.js | `playground/js/tokens.js` |
| 3.1.2 | Add authorization claims CSS to SPA stylesheet | `playground/css/style.css` |

**Deliverables**:
- [ ] SPA token panels show authorization claims section
- [ ] Roles displayed as badges, permissions as tags, profile as table

**Verify**: Visual inspection (SPA is static HTML/JS, no build step)

---

## Phase 4: Final Verification

### Session 4.1: Build and Test

**Objective**: Verify everything compiles and existing tests pass

**Tasks**:

| # | Task | File |
|---|------|------|
| 4.1.1 | Run full Porta verification | All |

**Deliverables**:
- [ ] `yarn verify` passes (all existing tests)
- [ ] No regressions

**Verify**: `clear && sleep 3 && yarn verify`

---

## Task Checklist (All Phases)

### Phase 1: Seed Data & Cleanup
- [ ] 1.1.1 Replace ROLE_DEFS with 5 ERP roles
- [ ] 1.1.2 Replace PERMISSION_DEFS with 10 ERP permissions
- [ ] 1.1.3 Replace CLAIM_DEFS with 4 ERP claims
- [ ] 1.1.4 Update USERS array — assignRoles and claims for all 5 active users
- [ ] 1.1.5 Remove debug logger.info line from showConsent

### Phase 2: BFF Dashboard
- [ ] 2.1.1 Extract RBAC/claims from ID token in dashboard route
- [ ] 2.1.2 Add authorization panel template to dashboard.hbs
- [ ] 2.1.3 Add authorization panel CSS styles

### Phase 3: SPA Playground
- [ ] 3.1.1 Add renderAuthorizationClaims() to tokens.js
- [ ] 3.1.2 Add authorization claims CSS to SPA stylesheet

### Phase 4: Verification
- [ ] 4.1.1 Run full yarn verify — all tests pass

---

## Session Protocol

### Starting a Session

1. Reference this plan: "Implement Phase X, Session X.X per `plans/erp-claims-playground/99-execution-plan.md`"

### Ending a Session

1. Run the project's verify command: `clear && sleep 3 && yarn verify`
2. Handle commit per the active commit mode
3. Compact the conversation with `/compact`

---

## Dependencies

```
Phase 1 (Seed + Cleanup)
    ↓
Phase 2 (BFF Dashboard) + Phase 3 (SPA Playground)  ← can run in parallel
    ↓
Phase 4 (Verification)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ All verification passing (`yarn verify`)
3. ✅ No warnings/errors
4. ✅ BFF dashboard shows authorization panel with ERP claims
5. ✅ SPA playground shows claims in token display
6. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
