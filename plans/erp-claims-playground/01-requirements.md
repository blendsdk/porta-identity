# Requirements: ERP RBAC & Custom Claims in Playgrounds

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)

## Feature Overview

Enrich the Porta playground ecosystem with a realistic ERP (Enterprise Resource Planning) application scenario. The seed script creates ERP-style roles, permissions, and custom user attributes, and both the BFF and SPA playground dashboards display these claims prominently after login.

This demonstrates Porta's RBAC and custom claims capabilities in a tangible, real-world context — showing how a SaaS ERP application would use OIDC tokens to convey authorization data.

## Functional Requirements

### Must Have

- [ ] ERP-style RBAC definitions: 5 roles with meaningful names and 10 permissions
- [ ] 4 custom claim definitions: department, employee_id, cost_center, job_title
- [ ] All 5 active test users have role assignments and custom claim values
- [ ] Each user has a different role/department combination for visual variety
- [ ] BFF dashboard shows a new "Authorization" panel with roles, permissions, and profile attributes
- [ ] SPA playground displays roles/permissions/claims from token payloads
- [ ] Data visible in ID token, UserInfo response, and introspection response
- [ ] Remove debug log line from interactions.ts

### Should Have

- [ ] Role badges styled with color coding
- [ ] Permission tags in monospace for readability
- [ ] Profile attributes in a clean key-value table

### Won't Have (Out of Scope)

- Custom OIDC scopes (not needed — industry standard is always-include)
- Changes to Porta provider core (account-finder, configuration, interactions logic)
- Database migration changes
- New unit/integration tests for Porta core
- Permission-based UI gating (just display, no conditional rendering based on permissions)

## Technical Requirements

### Compatibility

- Seed script must remain idempotent (find-or-create pattern)
- BFF dashboard changes must work with existing session/token structure
- SPA playground changes must work with existing OIDC flow
- No breaking changes to existing playground functionality

### Security

- No secrets or sensitive data in the authorization panel (roles/claims are non-sensitive)
- Custom claims are already filtered by token type (id_token, access_token, userinfo) via account-finder.ts

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Custom scopes | Add `porta:roles`/`porta:claims` vs always-include | Always-include | Industry standard (Auth0, Okta, Azure AD). Claims are app-config-driven, not scope-driven |
| ERP theme | Generic RBAC vs ERP-specific | ERP-specific | More realistic, demonstrates real-world use case |
| User assignments | Assign to 2 users vs all 5 | All 5 active users | Shows variety when switching between org/user logins |
| Display location | Separate page vs dashboard panel | Dashboard panel | Less navigation, immediately visible after login |

## Acceptance Criteria

1. [ ] After login as `user@no2fa.local`, BFF dashboard shows `erp-admin` role badge and Engineering department
2. [ ] After login as `user@email2fa.local`, BFF dashboard shows `finance-manager` role and Finance department
3. [ ] UserInfo response contains roles, permissions, department, employee_id, cost_center, job_title
4. [ ] ID token payload contains the same claims
5. [ ] SPA playground shows claims in token display
6. [ ] Different users show different roles/permissions/departments
7. [ ] `yarn build` succeeds
8. [ ] Existing tests pass (`yarn verify`)
9. [ ] Debug log line removed from interactions.ts
