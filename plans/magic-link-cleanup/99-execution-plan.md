# Execution Plan: Cross-Browser Magic Link Pre-Auth Cleanup

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-12 13:40
> **Progress**: 0/10 tasks (0%)

## Overview

Remove the broken cross-browser magic link pre-auth flow from Porta. This flow is incompatible with OIDC + PKCE and should never have shipped. The same-browser `_ml_session` flow (which works correctly) is preserved.

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title                       | Sessions | Est. Time |
| ----- | --------------------------- | -------- | --------- |
| 1     | Source Code Cleanup         | 1        | 30 min    |
| 2     | UX Improvement              | 1        | 10 min    |
| 3     | Test Updates                | 1        | 20 min    |
| 4     | Verification                | 1        | 10 min    |

**Total: 1 session, ~70 min**

---

## Phase 1: Source Code Cleanup

### Session 1.1: Remove Pre-Auth Code

**Reference**: [Cleanup Spec](03-cleanup-spec.md)
**Objective**: Remove all pre-auth cross-browser code from source files

**Tasks**:

| #     | Task                                                              | File                              |
| ----- | ----------------------------------------------------------------- | --------------------------------- |
| 1.1.1 | Remove pre-auth section (lines 207-563) from magic-link-session   | `src/auth/magic-link-session.ts`  |
| 1.1.2 | Update module JSDoc (remove pre-auth refs, drop "legacy" label)   | `src/auth/magic-link-session.ts`  |
| 1.1.3 | Remove pre-auth imports, detection block, and auth context store  | `src/routes/interactions.ts`      |
| 1.1.4 | Remove pre-auth imports and path, simplify to session-only flow   | `src/routes/magic-link.ts`        |
| 1.1.5 | Update JSDoc comments (remove pre-auth refs)                      | `src/routes/magic-link.ts`        |

**Deliverables**:
- [ ] Pre-auth code completely removed from all 3 source files
- [ ] No dangling imports or unused references
- [ ] JSDoc comments updated

---

## Phase 2: UX Improvement

### Session 2.1: Improve Success Page Messages

**Reference**: [Cleanup Spec — Section 4-5](03-cleanup-spec.md)
**Objective**: Make the "different browser" success page more helpful

**Tasks**:

| #     | Task                                                              | File                                              |
| ----- | ----------------------------------------------------------------- | ------------------------------------------------- |
| 2.1.1 | Update i18n messages with better cross-browser guidance           | `locales/default/en/magic-link.json`              |
| 2.1.2 | Update template comment and add close-tab hint                    | `templates/default/pages/magic-link-success.hbs`  |

**Deliverables**:
- [ ] Success page shows clear "return to original browser" messaging
- [ ] Template comment accurately describes when this page is shown

---

## Phase 3: Test Updates

### Session 3.1: Update Test Files

**Reference**: [Testing Strategy](07-testing-strategy.md)
**Objective**: Remove cross-browser tests, keep same-browser tests intact

**Tasks**:

| #     | Task                                                              | File                                                      |
| ----- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| 3.1.1 | Delete cross-browser UI test file                                 | `tests/ui/flows/magic-link-cross-browser.spec.ts`         |
| 3.1.2 | Remove pre-auth test cases from magic-link route tests            | `tests/unit/routes/magic-link.test.ts`                    |
| 3.1.3 | Remove pre-auth test cases from interaction route tests           | `tests/unit/routes/interactions.test.ts`                  |

**Deliverables**:
- [ ] Cross-browser UI test deleted
- [ ] Unit tests updated — only same-browser test cases remain
- [ ] No test file references pre-auth functions

---

## Phase 4: Verification

### Session 4.1: Final Verification

**Objective**: Confirm everything works

**Tasks**:

| #     | Task                                                              | File/Command               |
| ----- | ----------------------------------------------------------------- | -------------------------- |
| 4.1.1 | Run `yarn verify` — build + lint + unit tests must pass           | `yarn verify`              |

**Deliverables**:
- [ ] `yarn verify` passes with zero failures

**Verify**: `clear && sleep 3 && yarn verify`

---

## Task Checklist (All Phases)

### Phase 1: Source Code Cleanup
- [ ] 1.1.1 Remove pre-auth section from magic-link-session.ts
- [ ] 1.1.2 Update module JSDoc in magic-link-session.ts
- [ ] 1.1.3 Remove pre-auth code from interactions.ts
- [ ] 1.1.4 Remove pre-auth code from magic-link.ts
- [ ] 1.1.5 Update JSDoc in magic-link.ts

### Phase 2: UX Improvement
- [ ] 2.1.1 Update i18n messages
- [ ] 2.1.2 Update success page template

### Phase 3: Test Updates
- [ ] 3.1.1 Delete cross-browser UI test
- [ ] 3.1.2 Update magic-link route tests
- [ ] 3.1.3 Update interaction route tests

### Phase 4: Verification
- [ ] 4.1.1 Run yarn verify — all passing

---

## Dependencies

```
Phase 1 (Source Cleanup)
    ↓
Phase 2 (UX Improvement)
    ↓
Phase 3 (Test Updates)
    ↓
Phase 4 (Verification)
```

---

## Success Criteria

**Feature is complete when:**

1. ✅ All phases completed
2. ✅ `yarn verify` passing with zero failures
3. ✅ No pre-auth code remains in source files
4. ✅ Same-browser magic link flow preserved
5. ✅ Success page has clear "return to original browser" messaging
6. ✅ **Post-completion:** Ask user to re-analyze project and update `.clinerules/project.md`
