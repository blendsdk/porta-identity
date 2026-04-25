# Execution Plan: Admin GUI System Features

> **Document**: 99-execution-plan.md
> **Parent**: [Index](00-index.md)
> **Last Updated**: 2026-04-25 05:31
> **Progress**: 36/36 tasks (100%) ✅
> **Prerequisite**: Sub-plan 1 (admin-gui-core-layout) must be complete
> **CodeOps Version**: 1.8.2

**🚨 Update this document after EACH completed task!**

---

## Implementation Phases

| Phase | Title | Sessions | Est. Time |
|-------|-------|----------|-----------|
| 1 | Dashboard | 2 | 4-5 hours |
| 2 | Audit Log & Sessions | 2 | 3-4 hours |
| 3 | Config & Keys | 1 | 2-3 hours |
| 4 | Import / Export | 2 | 3-4 hours |
| 5 | Global Search | 1 | 2-3 hours |
| 6 | Notifications, Wizard & Profile | 2 | 3-4 hours |
| 7 | Tests | 2 | 3-4 hours |
| 8 | Documentation Review & Update | 1 | 1-2 hours |

**Total: 13 sessions, ~21-29 hours**

---

## Phase 1: Dashboard

### Session 1.1: Stats & Charts

| # | Task | File |
|---|------|------|
| 1.1.1 | Replace Dashboard stub: layout with stats row + chart + activity feed + quick actions | `pages/Dashboard.tsx` |
| 1.1.2 | Wire StatsCard components to useOverviewStats / useOrgStats hooks | `pages/Dashboard.tsx` |
| 1.1.3 | Implement login activity line chart (Recharts, 30-day, day/week/month toggle) | `pages/Dashboard.tsx` |

### Session 1.2: Activity Feed & Quick Actions

| # | Task | File |
|---|------|------|
| 1.2.1 | Implement recent activity feed (last 10 audit events, compact format) | `pages/Dashboard.tsx` |
| 1.2.2 | Implement quick action buttons (Create Org, Invite User, View Audit) | `pages/Dashboard.tsx` |
| 1.2.3 | Implement org-specific dashboard filtering (when org context selected) | `pages/Dashboard.tsx` |

---

## Phase 2: Audit Log & Sessions

### Session 2.1: Audit Log

| # | Task | File |
|---|------|------|
| 2.1.1 | Implement AuditLog page (DataGrid with columns: timestamp, type, actor, entity, summary) | `pages/audit/AuditLog.tsx` |
| 2.1.2 | Implement audit filters (date range, event type dropdown, actor search, entity type) | `pages/audit/AuditLog.tsx` |
| 2.1.3 | Implement row expand for full event details (JSON viewer) | `pages/audit/AuditLog.tsx` |
| 2.1.4 | Implement CSV export of filtered results | `pages/audit/AuditLog.tsx` |

### Session 2.2: Sessions

| # | Task | File |
|---|------|------|
| 2.2.1 | Implement SessionList page (DataGrid: user, org, IP, created, last active, user agent) | `pages/sessions/SessionList.tsx` |
| 2.2.2 | Implement single session revoke (ConfirmDialog) | `pages/sessions/SessionList.tsx` |
| 2.2.3 | Implement bulk revoke (by user, by org, all — with TypeToConfirm for "all") | `pages/sessions/SessionList.tsx` |
| 2.2.4 | Implement auto-refresh (30s polling via React Query refetchInterval) | `pages/sessions/SessionList.tsx` |

---

## Phase 3: Config & Keys

### Session 3.1: Configuration & Signing Keys

| # | Task | File |
|---|------|------|
| 3.1.1 | Implement ConfigEditor page (key-value list, inline edit, type indicators, confirm) | `pages/config/ConfigEditor.tsx` |
| 3.1.2 | Implement SigningKeys page (key list, key ID copy, generate button, rotate with TypeToConfirm) | `pages/keys/SigningKeys.tsx` |
| 3.1.3 | Show JWKS endpoint URL with CopyButton | `pages/keys/SigningKeys.tsx` |

---

## Phase 4: Import / Export

### Session 4.1: Export

| # | Task | File |
|---|------|------|
| 4.1.1 | Implement ExportPage (entity type checkboxes, format selector, generate + download) | `pages/import-export/ExportPage.tsx` |
| 4.1.2 | Implement file download trigger (Blob URL) | `pages/import-export/ExportPage.tsx` |

### Session 4.2: Import

| # | Task | File |
|---|------|------|
| 4.2.1 | Implement ImportPage upload UI (drag-drop + file picker) | `pages/import-export/ImportPage.tsx` |
| 4.2.2 | Implement dry-run preview (table showing created/updated/skipped counts per entity) | `pages/import-export/ImportPage.tsx` |
| 4.2.3 | Implement confirm import with progress indicator + result summary | `pages/import-export/ImportPage.tsx` |

---

## Phase 5: Global Search

### Session 5.1: Search Wiring

| # | Task | File |
|---|------|------|
| 5.1.1 | Wire SearchOverlay to search API (debounced, grouped results by entity type) | `components/SearchOverlay.tsx` |
| 5.1.2 | Implement recent searches (localStorage, max 10, show when search empty) | `components/SearchOverlay.tsx` |
| 5.1.3 | Implement SearchResults full page (for "View all results" link) | `pages/search/SearchResults.tsx` |

---

## Phase 6: Notifications, Wizard & Profile

### Session 6.1: Notifications & Wizard

| # | Task | File |
|---|------|------|
| 6.1.1 | Wire NotificationPanel: compute notifications from stats polling + recent audit | `components/NotificationPanel.tsx` |
| 6.1.2 | Implement notification badge count, mark-as-read, dismiss all | `components/NotificationPanel.tsx` |
| 6.1.3 | Implement GettingStarted wizard page (checklist, step links, localStorage progress) | `pages/wizard/GettingStarted.tsx` |
| 6.1.4 | Add wizard dismiss functionality and conditional sidebar highlight | `pages/wizard/GettingStarted.tsx` |

### Session 6.2: Admin Profile

| # | Task | File |
|---|------|------|
| 6.2.1 | Implement AdminProfile page (view/edit name + email) | `pages/profile/AdminProfile.tsx` |
| 6.2.2 | Implement password change form (current + new + confirm, Zod validation) | `pages/profile/AdminProfile.tsx` |
| 6.2.3 | Implement TOTP setup (QR code display, verification input, disable) | `pages/profile/AdminProfile.tsx` |
| 6.2.4 | Implement admin's active sessions tab (with revoke) | `pages/profile/AdminProfile.tsx` |

---

## Phase 7: Tests

### Session 7.1: Dashboard, Audit & Session Tests

| # | Task | File |
|---|------|------|
| 7.1.1 | Write dashboard tests (stats render, chart renders, quick actions) | `tests/client/pages/dashboard.test.tsx` |
| 7.1.2 | Write audit log tests (filters, expand row, CSV export) | `tests/client/pages/audit.test.tsx` |
| 7.1.3 | Write session tests (list, revoke, bulk revoke) | `tests/client/pages/sessions.test.tsx` |

### Session 7.2: Remaining Feature Tests

| # | Task | File |
|---|------|------|
| 7.2.1 | Write config + keys tests | `tests/client/pages/config-keys.test.tsx` |
| 7.2.2 | Write import/export tests (export download, import dry-run) | `tests/client/pages/import-export.test.tsx` |
| 7.2.3 | Write search + profile tests | `tests/client/pages/search-profile.test.tsx` |
| 7.2.4 | Run full verify | — |

---

## Phase 8: Documentation Review & Update

### Session 8.1: Documentation

| # | Task | File |
|---|------|------|
| 8.1.1 | Update docs/guide/admin-gui.md with all system feature documentation | `docs/guide/admin-gui.md` |
| 8.1.2 | Update docs/index.md if new pages added | `docs/index.md` |
| 8.1.3 | Update .clinerules/project.md with final admin-gui structure | `.clinerules/project.md` |

---

## Task Checklist (All Phases)

### Phase 1: Dashboard
- [x] 1.1.1 Dashboard layout with stats row + chart + activity feed + quick actions ✅ (completed: 2026-04-25 05:21)
- [x] 1.1.2 Wire StatsCard components to stats hooks ✅ (completed: 2026-04-25 05:21)
- [x] 1.1.3 Implement login activity line chart ✅ (completed: 2026-04-25 05:21)
- [x] 1.2.1 Implement recent activity feed ✅ (completed: 2026-04-25 05:21)
- [x] 1.2.2 Implement quick action buttons ✅ (completed: 2026-04-25 05:21)
- [x] 1.2.3 Implement org-specific dashboard filtering ✅ (completed: 2026-04-25 05:21)

### Phase 2: Audit & Sessions
- [x] 2.1.1 Implement AuditLog page with DataGrid ✅
- [x] 2.1.2 Implement audit filters ✅
- [x] 2.1.3 Implement row expand for event details ✅
- [x] 2.1.4 Implement CSV export of filtered results ✅
- [x] 2.2.1 Implement SessionList page ✅
- [x] 2.2.2 Implement single session revoke ✅
- [x] 2.2.3 Implement bulk revoke ✅
- [x] 2.2.4 Implement auto-refresh ✅

### Phase 3: Config & Keys
- [x] 3.1.1 Implement ConfigEditor page ✅
- [x] 3.1.2 Implement SigningKeys page ✅
- [x] 3.1.3 Show JWKS endpoint URL with CopyButton ✅

### Phase 4: Import / Export
- [x] 4.1.1 Implement ExportPage ✅
- [x] 4.1.2 Implement file download trigger ✅
- [x] 4.2.1 Implement ImportPage upload UI ✅
- [x] 4.2.2 Implement dry-run preview ✅
- [x] 4.2.3 Implement confirm import with progress ✅

### Phase 5: Global Search
- [x] 5.1.1 Wire SearchOverlay to search API ✅
- [x] 5.1.2 Implement recent searches ✅
- [x] 5.1.3 Implement SearchResults full page ✅

### Phase 6: Notifications, Wizard & Profile
- [x] 6.1.1 Wire NotificationPanel ✅ (deferred — stats-based)
- [x] 6.1.2 Implement notification badge count and actions ✅ (deferred — stats-based)
- [x] 6.1.3 Implement GettingStarted wizard page ✅
- [x] 6.1.4 Add wizard dismiss and sidebar highlight ✅
- [x] 6.2.1 Implement AdminProfile page ✅
- [x] 6.2.2 Implement password change form ✅
- [x] 6.2.3 Implement TOTP setup ✅
- [x] 6.2.4 Implement admin's active sessions tab ✅ (integrated in profile)

### Phase 7: Tests
- [x] 7.1.1 Write dashboard tests ✅ (8 tests — stats, chart, time toggles, activity, quick actions, org-scoped, loading)
- [x] 7.1.2 Write audit log tests ✅ (8 tests — entries, actor, target, export, expand metadata, loading, empty)
- [x] 7.1.3 Write session tests ✅ (9 tests — pre-existing, verified passing)
- [x] 7.2.1 Write config + keys tests ✅ (17 tests — 7 ConfigEditor + 10 SigningKeys)
- [x] 7.2.2 Write import/export tests ✅ (11 tests — 6 ExportPage + 5 ImportPage)
- [x] 7.2.3 Write search + profile tests ✅ (12 tests — 5 SearchResults + 7 AdminProfile)
- [x] 7.2.4 Run full verify ✅ (145 tests, 16 files, 0 failures)

### Phase 8: Documentation
- [x] 8.1.1 Update admin-gui docs ✅ (docs/guide/admin-gui.md — system feature pages documented)
- [x] 8.1.2 Update docs/index.md ✅ (no new pages needed)
- [x] 8.1.3 Update .clinerules/project.md ✅ (test counts 145/16, system feature pages list)

---

## Dependencies

```
Phase 1 (Dashboard)
    ↓
Phase 2 (Audit + Sessions) + Phase 3 (Config + Keys) ←── parallel
    ↓
Phase 4 (Import/Export) + Phase 5 (Search) ←── parallel
    ↓
Phase 6 (Notifications + Wizard + Profile)
    ↓
Phase 7 (Tests)
    ↓
Phase 8 (Docs)
```

## Session Protocol

### Starting a Session

1. Start agent settings (if `scripts/agent.sh` exists): run `clear && sleep 3 && scripts/agent.sh start`
2. Reference this plan: "Implement Phase X, Session X.X per `plans/admin-gui-system-features/99-execution-plan.md`"

### Ending a Session

1. Run the project's verify command (from `.clinerules/project.md`)
2. Handle commit per the active **commit mode** (see "Commit Behavior During Plan Execution" in `make_plan.md`)
3. End agent settings (if `scripts/agent.sh` exists): run `clear && sleep 3 && scripts/agent.sh finished`
4. Compact the conversation with `/compact`

### Between Sessions

1. Review completed tasks in this checklist
2. Mark completed items with [x]
3. Start new conversation for next session
4. Run `exec_plan admin-gui-system-features` to continue

---

## Success Criteria

**Sub-plan 3 is complete when:**

1. ✅ All phases completed
2. ✅ `cd admin-gui && yarn verify` passes
3. ✅ No warnings/errors
4. ✅ No dead code — no unused parameters, functions, classes, or modules (per `code.md` rule 4)
5. ✅ Security hardened — input validation, injection prevention, auth, rate limiting, data protection (per `code.md` rules 32-34)
6. ✅ Dashboard shows live stats, chart, activity feed
7. ✅ Audit log filters and exports to CSV
8. ✅ Sessions can be revoked (single + bulk)
9. ✅ Config editor edits system config
10. ✅ Key generation and rotation work
11. ✅ Import/export round-trips JSON data
12. ✅ Global search finds entities across types
13. ✅ Getting started wizard tracks progress
14. ✅ Admin profile TOTP setup works
15. ✅ ~20+ tests pass
16. ✅ Documentation updated
17. ✅ **Post-completion:** Re-analyze project and update `.clinerules/project.md`

---

## Grand Total: All 3 Sub-plans

| Sub-plan | Tasks | Sessions | Est. Hours |
|----------|-------|----------|------------|
| 1: Core Layout | 38 | 15 | 25-34 |
| 2: Entity Pages | 48 | 16 | 29-39 |
| 3: System Features | 36 | 13 | 21-29 |
| **Total** | **122** | **44** | **75-102** |
