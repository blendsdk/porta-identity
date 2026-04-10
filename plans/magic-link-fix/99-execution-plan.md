# Execution Plan: Magic Link Cross-Browser Fix

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-11 00:40
> **Progress**: 0/10 tasks (0%)

## Overview

Fix the magic link authentication flow to work across browsers, devices, and private windows. Implements a unified redirect-through-interaction pattern with a signed `_ml_session` cookie and guarded success page.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                    | Sessions | Est. Time |
|-------|--------------------------|----------|-----------|
| 1     | Session Cookie + Handler | 1        | 60 min    |
| 2     | Login Handler + Template | 1        | 45 min    |
| 3     | Tests                    | 1        | 60 min    |
| 4     | Verification             | 1        | 15 min    |

**Total: 4 sessions, ~3 hours**

---

## Phase 1: Session Cookie + Handler Fix

### Session 1.1: Magic Link Handler Refactor

**Objective**: Refactor magic link handler to set `_ml_session` and redirect instead of calling `interactionFinished()` directly.

**Tasks**:

| #     | Task                                                    | File                              |
|-------|---------------------------------------------------------|-----------------------------------|
| 1.1.1 | Implement `_ml_session` cookie: signed, HttpOnly, 5-min TTL, single-use | `src/routes/magic-link.ts` |
| 1.1.2 | Refactor `verifyMagicLink()`: validate token → set `_ml_session` → redirect to `/interaction/{uid}/login` | `src/routes/magic-link.ts` |
| 1.1.3 | Unit tests for `_ml_session` creation and validation    | `tests/unit/routes/magic-link.test.ts` |

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 2: Login Handler + Success Template

### Session 2.1: Login Handler Integration + Success Page

**Objective**: Add `_ml_session` detection to login handler and create success page template.

**Tasks**:

| #     | Task                                                    | File                              |
|-------|---------------------------------------------------------|-----------------------------------|
| 2.1.1 | Add `_ml_session` detection to login handler: try `interactionFinished()`, fall back to success page | `src/routes/interactions.ts` |
| 2.1.2 | Create success page template with i18n                  | `templates/default/magic-link-success.hbs` + `locales/` |
| 2.1.3 | Security guard: success page ONLY renders with valid `_ml_session` | `src/routes/interactions.ts` |
| 2.1.4 | Unit tests for login handler `_ml_session` path         | `tests/unit/routes/interactions.test.ts` |

**Verify**: `clear && sleep 3 && yarn verify`

---

## Phase 3: UI + Security Tests

### Session 3.1: Playwright + Pentest

**Objective**: Unblock fixme tests, add cross-browser tests, add security tests.

**Tasks**:

| #     | Task                                                    | File                              |
|-------|---------------------------------------------------------|-----------------------------------|
| 3.1.1 | Fix 2 existing fixme magic link tests                   | `tests/ui/flows/magic-link*.spec.ts` |
| 3.1.2 | Add cross-browser magic link test (success page)        | `tests/ui/flows/magic-link-verify.spec.ts` |
| 3.1.3 | Add security test: URL crafting without `_ml_session`   | `tests/ui/security/` or `tests/pentest/` |

**Verify**: `clear && sleep 3 && yarn test:ui`

---

## Task Checklist (All Phases)

### Phase 1: Session Cookie + Handler
- [ ] 1.1.1 Implement `_ml_session` cookie (signed, HttpOnly, 5-min TTL, single-use)
- [ ] 1.1.2 Refactor `verifyMagicLink()` to set session + redirect
- [ ] 1.1.3 Unit tests for session creation/validation

### Phase 2: Login Handler + Template
- [ ] 2.1.1 Add `_ml_session` detection to login handler
- [ ] 2.1.2 Create success page template + i18n
- [ ] 2.1.3 Security guard: success page only with valid `_ml_session`
- [ ] 2.1.4 Unit tests for login handler `_ml_session` path

### Phase 3: Tests
- [ ] 3.1.1 Fix 2 existing fixme magic link tests
- [ ] 3.1.2 Add cross-browser magic link test
- [ ] 3.1.3 Add security test for URL crafting

---

## Dependencies

```
Phase 1 (Session Cookie + Handler)
    ↓
Phase 2 (Login Handler + Template)
    ↓
Phase 3 (Tests)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ Magic link works in same browser (seamless OIDC completion)
2. ✅ Magic link works in different browser (success page)
3. ✅ Success page guarded by `_ml_session` (no URL crafting)
4. ✅ 2 previously-fixme tests pass
5. ✅ New cross-browser + security tests pass
6. ✅ All existing tests pass
7. ✅ `yarn verify` passes
8. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
