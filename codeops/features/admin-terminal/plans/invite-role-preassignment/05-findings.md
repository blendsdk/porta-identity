# Findings: Admin Terminal Invite Role Pre-Assignment

> **Plan**: `admin-terminal/plans/invite-role-preassignment`
> **Reviewed change**: #182 terminal invite role pre-assignment plus the necessary server
> authorization correction found during review
> **Last Updated**: 2026-11-06

## Review Findings

| ID    | Severity | Area | Finding | Ruling |
| ----- | -------- | ---- | ------- | ------ |
| F1    | MAJOR    | role checklist | The scroller extent was the viewport height, so roles after the visible rows were never painted but could still receive keyboard toggles. | Fixed: extent now uses the complete label count and width; the selected row is revealed on movement; a 25-role spec covers the last row. |
| F2    | MAJOR    | role checklist | Async re-renders removed the focused loading control and did not focus the new checklist or recovery action. | Fixed: each render focuses its target on mount; specs assert checklist focus and recovery focus behavior. |
| F3    | MINOR    | session lifecycle | Catalog `session-invalid` was shown as a generic role-options failure. | Fixed: the controller maps catalog session loss into the established authentication flow; a controller spec asserts one reauthentication request. |
| F4    | MINOR    | preview race | Role selection stayed enabled while a preview request was in flight. | Fixed: the selector is disabled during preview and the open handler guards the busy state; a deferred-preview spec covers it. |
| F5    | MINOR    | capability tests | Only one missing-capability combination was tested. | Fixed: table-driven cases cover application read, role assign and role read; a missing-operations case is also covered. |
| F6    | MINOR    | roadmap | The portfolio said 0/9 while the feature roadmap said 8/9. | Fixed: both now report the same review checkpoint. |
| F7    | MINOR    | stale spec | An older suite title still said invitations cannot pre-assign authorization data. | Fixed: the title/comment now describe the role-capable, claim-free contract. |
| F8    | MINOR    | labels | Equal application/role display names were indistinguishable. | Fixed: labels include the immutable application slug. |
| SA-1  | CRITICAL | delegation | A human administrator could pre-assign a canonical role, including `porta-super-admin`, that exceeded their own permissions. The direct role route already blocked this. | Fixed server-side: the shared canonical-role delegation ceiling now runs for invitations. Unit specs cover denial, allowed grants, ordinary roles, deduplication and missing canonical application. |
| SA-2  | MAJOR    | invitation authority | A human invitation carrying roles required only `admin:user:invite`. | Fixed for the human path: `admin:role:assign` is now required when `roles` is present; the route helper and docs record the rule. The bound machine lane remains governed by its approved binding policy and the same delegation ceiling. |
| SA-3  | MINOR    | capability gate | The selector did not require `canReadRoles` and offered the reserved `porta-invite-service` role that the server always rejects. | Fixed: the gate includes `canReadRoles`; the checklist omits the canonical reserved machine role. Specs cover both. |
| SA-4  | MINOR    | label spoofing | Role/application names could carry bidi or zero-width formatting into the terminal, and `~` could add an accelerator. | Fixed: labels replace invisible formatting and tildes; a hostile-label spec asserts the raw characters are absent. |
| SA-5  | MINOR    | preview divergence | The email preview received roles even though the server preview schema ignores them, so it could imply a grant was checked. | Fixed: the dialog and service strip roles from the email preview; final invitation validation remains authoritative. |
| SA-6  | MINOR    | recovery copy | Failure text said the invitation would be sent without roles even when a previous selection was preserved. | Fixed: the text now says the current selection is unchanged, and session-invalid is mapped to authentication (F3). |

## Verification

| Gate | Result |
| ---- | ------ |
| Focused CLI admin suite | 951 passed |
| Focused server unit specs | 20 passed (delegation, invitation wiring, human role-assign gate) |
| CLI lint/typecheck/build | Passed |
| Server lint/typecheck | Passed |
| CLI full suite | Pending after final fixes |
| Server integration/pentest | Pending |
| Independent re-review | Pending |
| CI | Pending |

## Notes

- The server correction is a necessary security fix discovered by the independent Phase 4
  security audit. It applies an invariant already enforced by the direct user-role route to the
  invitation path; it is not a new product feature.
- The bound machine invitation lane keeps its approved capability boundary: the client scope and
  the account's single reserved permission authorize the operation, while a machine account can
  never grant a canonical Admin role outside its own permission set.
- No finding was waived.
