# Roadmap: Resource Servers

> **Feature-Set**: Resource Servers
> **Status**: Active
> **Created**: 2026-11-07
> **Last Updated**: 2026-11-07
> **Progress**: 6 / 7 tasks (86%)
> **CodeOps Artifact Schema**: 1

## Legend

⬜ Backlog · 🔄 Executing · ✅ Done · ⛔ Blocked · ⏸️ Deferred · 📦 Archived

## Tracker

| ID   | Title                                      | RD  | Plan                                                    | Stage     | Status | Last Updated | Depends-on / Blocker |
| ---- | ------------------------------------------ | --- | ------------------------------------------------------- | --------- | ------ | ------------ | -------------------- |
| T-01 | Per-application resource-server scopes and audience (#156) | —   | [Standalone task plan](plans/resource-server-scopes/99-execution-plan.md) | Review    | 🔄     | 2026-11-07   | Implementation and local gates green; independent review and CI pending |

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
  verification. A later surface can reuse the repository/service.
