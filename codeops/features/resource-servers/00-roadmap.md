# Roadmap: Resource Servers

> **Feature-Set**: Resource Servers
> **Status**: In Progress
> **Created**: 2026-11-07
> **Last Updated**: 2026-11-09 00:14
> **Progress**: 0 / 1 (0%)
> **CodeOps Artifact Schema**: 1

## Legend

⬜ Backlog · 🔄 Executing · ✅ Done · ⛔ Blocked · ⏸️ Deferred · 📦 Archived

## Tracker

| ID   | Title                                      | RD  | Plan                                                    | Stage     | Status | Last Updated | Depends-on / Blocker |
| ---- | ------------------------------------------ | --- | ------------------------------------------------------- | --------- | ------ | ------------ | -------------------- |
| T-01 | Per-application resource-server scopes and audience (#156) | —   | [Standalone task plan](plans/resource-server-scopes/99-execution-plan.md) | Done      | ✅     | 2026-11-07   | 7/7; reviews, full gates, PR CI and production-security assurance green |
| RD-01 | Resource-server admin management (API, SDK, CLI, docs) | [RD-01](requirements/RD-01-resource-server-admin.md) | — | RD Drafted | ✏️ | 2026-11-09 00:14 | AR-1–AR-10 resolved |

## Notes

- The model is per application: a resource server belongs to one application; only clients of that
  application may request it.
- The resource identifier is an absolute URI. The configured audience is returned as the token
  `aud`; it defaults to the identifier when the operator does not need a distinct value.
- No `resource` parameter preserves the existing unrestricted token behavior. The model adds
  audience restriction only when a client explicitly requests a registered resource.
- Scope registry is explicit per resource server. Standard OIDC scopes remain available so a
  resource-bound OIDC flow can still issue an ID token. Userinfo needs a separate no-resource
  authorization because audience-bearing tokens are for their resource server.
- The admin management surface is not part of #156; this task owns the server model, resolution and
  verification. RD-01 owns the later admin surface and reuses the repository/service.
