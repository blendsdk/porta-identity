# Roadmap: SDK–Server Contract Truth

> **Feature-Set**: SDK–Server Contract Truth
> **Status**: Complete — original corrections and history/cursor follow-ups merged into `develop`; issues #159–#161, #163, and #167 closed
> **Created**: 2026-09-29
> **Last Updated**: 2026-10-27
> **Progress**: 2 / 2 done
> **CodeOps Artifact Schema**: 1

## Legend

⬜ Backlog · ✏️ RD Drafted · 🔎 RD Preflighted · 📋 Plan Created · 🔬 Plan Preflighted · 🔄 Executing · ✅ Done · ⛔ Blocked · ⏸️ Deferred

## Tracker

| ID    | Title                                  | RD                                              | Plan                                                     | Stage         | Status | Last Updated     | Depends-on / Blocker |
| ----- | -------------------------------------- | ----------------------------------------------- | -------------------------------------------------------- | ------------- | ------ | ---------------- | -------------------- |
| RD-01 | SDK admin contract alignment           | [RD](requirements/RD-01-sdk-admin-contract-alignment.md) | [plan](plans/sdk-contract-truth/99-execution-plan.md) | ✅ Done | ✅     | 2026-09-30 01:53 | —                    |
| RD-02 | GDPR export schema repair              | [RD](requirements/RD-02-gdpr-export-schema-repair.md)    | [plan](plans/sdk-contract-truth/99-execution-plan.md) | ✅ Done | ✅     | 2026-09-30 01:53 | —                    |

## Issues

| Issue | Title | Covered by |
| ----- | ----- | ---------- |
| #159 | fix(sdk): admin domain drift | RD-01 |
| #160 | fix(sdk): user-domain drift | RD-01 |
| #161 | fix(server): GDPR export queries nonexistent claim tables | RD-02 |
| #163 | fix(server): application and client history answer 500 (completed follow-up) | [_maintenance/T-06](../_maintenance/plans/local-tests-and-open-bugfixes/99-execution-plan.md); [PR #202](https://github.com/blendsdk/porta-identity/pull/202) |
| #167 | fix(sdk): cursor list envelope mismatch (completed follow-up) | [_maintenance/T-06](../_maintenance/plans/local-tests-and-open-bugfixes/99-execution-plan.md); [PR #205](https://github.com/blendsdk/porta-identity/pull/205) |
