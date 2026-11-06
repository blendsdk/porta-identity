# Execution Evidence: Admin Terminal Invite Role Pre-Assignment

> **Plan**: `admin-terminal/plans/invite-role-preassignment`
> **PR**: #221
> **Last Updated**: 2026-11-06

## Delivered behavior

- The terminal invite dialog exposes a role checklist only when the verified session has
  `canAssignRoles`, `canReadApplications` and `canReadRoles`.
- The checklist loads the readable application catalog and per-application roles, omits the
  canonical `porta-invite-service` machine role, sanitizes bidi/zero-width/accelerator characters,
  reveals the selected row in large catalogs and restores the previous selection on cancel or a
  failed catalog read.
- Selected `{applicationId, roleId}` pairs are validated, deduplicated and forwarded to
  `users.invite`. The email preview stays email-only.
- Human role-bearing invitations require `admin:role:assign`; canonical Admin roles are limited by
  the same delegation ceiling as direct role assignment. The bound machine lane keeps its approved
  binding-policy authority and the same ceiling.

## Verification

| Gate | Result |
| ---- | ------ |
| CLI full suite | 1,861 passed |
| Focused CLI admin suite | 953 passed |
| Server unit suite | 4,427 passed |
| Server integration suite | 1,164 passed |
| Server penetration suite | 334 passed |
| Server E2E suite | 134 passed |
| Structure contracts | 158 passed |
| CLI lint / typecheck / build | Passed |
| Server lint / typecheck / build | Passed |
| Public docs build | Passed |
| PR CI | All six jobs passed on PR #221 at 34afe6db |
| Production-security assurance | Exit 0: 7 human-auth, 4 second-factor, 17 tenant/admin and 5 validation/security cases; 11 exposure passes, 0 product/incomplete/execution failures; artifact `test-harness/.assurance-results/8629c4b0-fa98-436e-bc5d-bec6c5810df8/production-exposure/production-security/observation.json` |

## Review closure

| Reviewer | Findings | Disposition |
| -------- | -------- | ----------- |
| Correctness reviewer | F1–F8, N1, N2, R1–R3 | All closed; no remaining Critical/Major |
| Security auditor | SA-1–SA-6 | All closed; no new Critical/Major; machine-lane decision accepted |

The detailed ledger is `05-findings.md`. The server correction applies an invariant already
enforced by the direct user-role route; it is not a new product capability.

## Evidence notes

- The full server and CLI gates were run locally against owned scratch PostgreSQL, Redis and
  MailHog containers. Those containers were removed after the runs.
- The assurance run uses a clean detached worktree at the commit under review. A later docs-only
  commit does not change executable source.
- No merge to `main`, release, issue-state change for unrelated issues, or unrelated runtime
  cleanup was performed.
