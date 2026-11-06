# Roadmap: Admin Terminal

> **Feature-Set**: Admin Terminal
> **Status**: Complete
> **Created**: 2026-11-06
> **Last Updated**: 2026-11-06
> **Progress**: 10 / 10 tasks (100%)
> **CodeOps Artifact Schema**: 1

## Legend

⬜ Backlog · 🔄 Executing · ✅ Done · ⛔ Blocked · ⏸️ Deferred · 📦 Archived

## Tracker

| ID   | Title                             | RD  | Plan                                                          | Stage     | Status | Last Updated | Depends-on / Blocker |
| ---- | --------------------------------- | --- | ------------------------------------------------------------- | --------- | ------ | ------------ | -------------------- |
| T-01 | Invite role pre-assignment (#182) | —   | [Standalone task plan](plans/invite-role-preassignment/99-execution-plan.md) | Done      | ✅     | 2026-11-06   | 10/10; reviews, full gates, PR CI and production-security assurance green; PR #221 is the final integration action |

## Notes

- The supported `porta admin` application is the embedded terminal UI in `packages/cli/src/admin`.
  The retired web GUI is archived under `codeops/features/admin-ui`.
- This task closes the remaining role pre-assignment parity gap: the terminal invite dialog now
  accepts application roles like the conventional CLI.
- Scope is roles only, matching GitHub #182. Claim pre-assignment from the terminal dialog remains
  out of scope until separately requested.
