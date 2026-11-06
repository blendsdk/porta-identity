# Roadmap: Admin Terminal

> **Feature-Set**: Admin Terminal
> **Status**: Active
> **Created**: 2026-11-06
> **Last Updated**: 2026-11-06
> **Progress**: 8 / 9 tasks (89%)
> **CodeOps Artifact Schema**: 1

## Legend

⬜ Backlog · 🔄 Executing · ✅ Done · ⛔ Blocked · ⏸️ Deferred · 📦 Archived

## Tracker

| ID   | Title                             | RD  | Plan                                                          | Stage     | Status | Last Updated | Depends-on / Blocker |
| ---- | --------------------------------- | --- | ------------------------------------------------------------- | --------- | ------ | ------------ | -------------------- |
| T-01 | Invite role pre-assignment (#182) | —   | [Standalone task plan](plans/invite-role-preassignment/99-execution-plan.md) | Review    | 🔄     | 2026-11-06   | Implementation and local gates green; independent review and CI pending |

## Notes

- The supported `porta admin` application is the embedded terminal UI in `packages/cli/src/admin`.
  The retired web GUI is archived under `codeops/features/admin-ui`.
- This task closes the remaining invitation pre-assignment parity gap: the conventional CLI already
  accepts `--role` and `--claim`, while the terminal invite dialog accepts neither.
- Scope is roles only, matching GitHub #182. Claim pre-assignment from the terminal dialog remains
  out of scope until separately requested.
