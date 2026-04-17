# Current State: ERP RBAC & Custom Claims in Playgrounds

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Exists — Claims Infrastructure (Working ✅)

The Porta provider already has a complete claims pipeline:

1. **`src/oidc/account-finder.ts`** — `findAccount()` builds claims by:
   - `buildUserClaims(user, scopes)` → Standard OIDC claims (sub, name, email)
   - `buildRoleClaims(userId)` → Role slug array (cache-first via Redis)
   - `buildPermissionClaims(userId)` → Permission slug array (cache-first)
   - `buildCustomClaims(userId, appId, tokenType)` → Custom per-app claims filtered by token type

2. **RBAC module (`src/rbac/`)** — Full CRUD for roles, permissions, user-role assignments, cache

3. **Custom claims module (`src/custom-claims/`)** — Definitions CRUD, user values, type validation, cache

4. **Claims are always included** — `account-finder.ts` always includes roles/permissions/custom claims regardless of OAuth2 scopes requested. This follows the industry standard (Auth0, Okta, Azure AD pattern).

### What Exists — Seed Data (Minimal)

The current `scripts/playground-seed.ts` creates:

**Roles (2):**
| Slug | Name | Permissions |
|------|------|-------------|
| `admin` | Admin | app:users:manage, app:settings:manage |
| `viewer` | Viewer | app:data:read |

**Permissions (3):**
| Slug | Name |
|------|------|
| `app:users:manage` | Manage Users |
| `app:settings:manage` | Manage Settings |
| `app:data:read` | Read Data |

**Custom Claims (2):**
| Name | Type |
|------|------|
| `department` | string |
| `employee_id` | string |

**User Assignments (only 2 users):**
| User | Role | Claims |
|------|------|--------|
| user@no2fa.local | admin | department=Engineering, employee_id=EMP-001 |
| user@email2fa.local | viewer | (none) |

### What Exists — BFF Playground

- **Dashboard** (`playground-bff/views/dashboard.hbs`): Shows token panels (ID, Access, Refresh), UserInfo result, Introspection result. No dedicated RBAC/claims display.
- **Dashboard route** (`playground-bff/src/routes/dashboard.ts`): Decodes ID/Access tokens, extracts userName, passes to template. Does not extract roles/permissions/custom claims.
- **Auth route** (`playground-bff/src/routes/auth.ts`): Requests `openid profile email offline_access`.
- **API route** (`playground-bff/src/routes/api.ts`): Proxies UserInfo, Refresh, Introspect to Porta.

### What Exists — SPA Playground

- **Token display** (`playground/js/tokens.js`): Renders decoded JWT payloads as JSON. Shows all claims present in the token, but doesn't highlight RBAC/custom claims visually.

## Relevant Files

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `scripts/playground-seed.ts` | Seed data | Replace RBAC/claim definitions, expand user assignments |
| `playground-bff/views/dashboard.hbs` | BFF dashboard UI | Add authorization panel |
| `playground-bff/src/routes/dashboard.ts` | BFF dashboard data | Extract RBAC/claims from ID token |
| `playground-bff/public/css/style.css` | BFF styles | Add authorization panel styles |
| `playground/js/tokens.js` | SPA token display | Highlight RBAC/claims in token view |
| `src/routes/interactions.ts` | OIDC interactions | Remove debug log line |

## Gaps Identified

### Gap 1: Seed Data Too Minimal

**Current Behavior:** Only 2 generic roles, 3 generic permissions, 2 claims. Only 2 of 5 active users have assignments.
**Required Behavior:** Realistic ERP scenario with 5 roles, 10 permissions, 4 claims, all 5 users assigned.
**Fix Required:** Replace ROLE_DEFS, PERMISSION_DEFS, CLAIM_DEFS in seed, update USERS array.

### Gap 2: BFF Dashboard Missing Claims Display

**Current Behavior:** Dashboard shows raw token JSON. Roles/permissions/claims are buried in the token payload.
**Required Behavior:** Prominent "Authorization" panel with roles as badges, permissions as tags, attributes as table.
**Fix Required:** New dashboard panel + route data extraction.

### Gap 3: SPA Playground No Claims Highlighting

**Current Behavior:** Token payload shown as raw JSON. Custom claims not visually distinguished.
**Required Behavior:** Visual distinction for RBAC/custom claims in token display.
**Fix Required:** Update token rendering to highlight custom claim keys.

### Gap 4: Debug Log Line Present

**Current Behavior:** `logger.info({ missingOIDCScope: ..., requestedScope: ... })` in interactions.ts showConsent.
**Required Behavior:** No debug logging in production code.
**Fix Required:** Remove the line.

## Dependencies

### Internal Dependencies

- RBAC module (roles, permissions, user-role assignments) — fully implemented
- Custom claims module (definitions, user values) — fully implemented
- Account finder (claims building) — fully implemented
- BFF playground server — fully implemented
- SPA playground — fully implemented

### External Dependencies

- None — all infrastructure is in place

## Risks and Concerns

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Seed idempotency breaks | Low | Medium | Use find-or-create pattern (already in place) |
| Token size increase | Low | Low | Only a few extra claims — negligible |
| CSS conflicts | Low | Low | Use specific class names with `auth-` prefix |
