# Roadmap: Device Authorization

> **Feature-Set**: Device Authorization
> **Status**: Done
> **Created**: 2026-11-24
> **Last Updated**: 2026-11-25 17:50
> **Progress**: 5 / 5 (100%)
> **CodeOps Artifact Schema**: 1

## Legend

⬜ Backlog · ✏️ RD Drafted · 🔎 RD Preflighted · 📋 Plan Created · 🔬 Plan Preflighted · 🔄 Executing · ✅ Done · ⛔ Blocked · ⏸️ Deferred

## Tracker

| ID    | Title                          | RD                                                        | Plan | Stage      | Status | Last Updated | Depends-on / Blocker |
| ----- | ------------------------------ | --------------------------------------------------------- | ---- | ---------- | ------ | ------------ | -------------------- |
| RD-01 | Provider capability and protocol | [RD-01](requirements/RD-01-provider-capability.md)       | [plan](plans/device-authorization/00-index.md) | Done | ✅ | 2026-11-25 | —                    |
| RD-02 | Tenant-safe verification       | [RD-02](requirements/RD-02-tenant-safe-verification.md)  | [plan](plans/device-authorization/00-index.md) | Done | ✅ | 2026-11-25 | depends on RD-01     |
| RD-03 | Client contracts               | [RD-03](requirements/RD-03-client-contracts.md)          | [plan](plans/device-authorization/00-index.md) | Done | ✅ | 2026-11-25 | depends on RD-01     |
| RD-04 | CLI device login               | [RD-04](requirements/RD-04-cli-device-login.md)          | [plan](plans/device-authorization/00-index.md) | Done | ✅ | 2026-11-25 | depends on RD-01, RD-03 |
| RD-05 | Security operations            | [RD-05](requirements/RD-05-security-operations.md)       | [plan](plans/device-authorization/00-index.md) | Done | ✅ | 2026-11-25 | depends on RD-01–RD-04 |
