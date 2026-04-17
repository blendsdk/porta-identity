# BFF Dashboard: Authorization Panel

> **Document**: 04-bff-dashboard.md
> **Parent**: [Index](00-index.md)

## Overview

Add a new "Authorization" panel to the BFF playground dashboard that prominently displays the user's RBAC roles, permissions, and custom profile attributes extracted from the ID token. This makes the ERP claims immediately visible after login.

## Architecture

### Data Flow

```
ID Token (decoded server-side)
    → dashboard.ts extracts roles/permissions/custom claims
    → Passes as template variables to dashboard.hbs
    → Rendered as styled panel with badges, tags, and table
```

### Current Architecture

`dashboard.ts` currently:
1. Reads `ctx.session.tokens`
2. Decodes ID/Access tokens via `decodeJwt()`
3. Extracts `userName` from ID token payload
4. Passes to `dashboard.hbs` template

### Proposed Changes

`dashboard.ts` additionally:
1. Extracts `roles` array from ID token payload
2. Extracts `permissions` array from ID token payload
3. Extracts custom claims: `department`, `employee_id`, `cost_center`, `job_title`
4. Passes all as named template variables

## Implementation Details

### dashboard.ts — Extract Claims

```typescript
// Extract RBAC and custom claims from ID token
const roles = (idToken?.payload?.roles as string[]) ?? [];
const permissions = (idToken?.payload?.permissions as string[]) ?? [];
const customClaims = {
  department: idToken?.payload?.department as string | undefined,
  employee_id: idToken?.payload?.employee_id as string | undefined,
  cost_center: idToken?.payload?.cost_center as string | undefined,
  job_title: idToken?.payload?.job_title as string | undefined,
};
const hasAuthzData = roles.length > 0 || permissions.length > 0 
  || Object.values(customClaims).some(Boolean);
```

Add to the `render()` call:
```typescript
roles,
permissions,
customClaims,
hasAuthzData,
```

### dashboard.hbs — Authorization Panel

Insert after the `action-bar` div and before `panels-grid`:

```handlebars
{{#if hasAuthzData}}
  <div class="panel auth-panel">
    <div class="panel-header">
      <h4>🔐 Authorization</h4>
    </div>
    <div class="panel-body auth-body">
      {{#if roles.length}}
        <div class="auth-section">
          <label>Roles</label>
          <div class="auth-badges">
            {{#each roles}}
              <span class="badge badge-role">{{this}}</span>
            {{/each}}
          </div>
        </div>
      {{/if}}

      {{#if permissions.length}}
        <div class="auth-section">
          <label>Permissions</label>
          <div class="auth-tags">
            {{#each permissions}}
              <span class="tag tag-permission">{{this}}</span>
            {{/each}}
          </div>
        </div>
      {{/if}}

      <div class="auth-section">
        <label>Profile Attributes</label>
        <table class="auth-table">
          {{#if customClaims.department}}
            <tr><td class="attr-key">Department</td><td>{{customClaims.department}}</td></tr>
          {{/if}}
          {{#if customClaims.employee_id}}
            <tr><td class="attr-key">Employee ID</td><td>{{customClaims.employee_id}}</td></tr>
          {{/if}}
          {{#if customClaims.cost_center}}
            <tr><td class="attr-key">Cost Center</td><td>{{customClaims.cost_center}}</td></tr>
          {{/if}}
          {{#if customClaims.job_title}}
            <tr><td class="attr-key">Job Title</td><td>{{customClaims.job_title}}</td></tr>
          {{/if}}
        </table>
      </div>
    </div>
  </div>
{{/if}}
```

### style.css — Authorization Panel Styles

```css
/* Authorization panel */
.auth-panel {
  margin-bottom: 1.5rem;
  border-left: 4px solid #6366f1;
}

.auth-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.auth-section label {
  display: block;
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  margin-bottom: 0.5rem;
}

.auth-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.badge-role {
  background: #6366f1;
  color: #fff;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 500;
}

.auth-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.tag-permission {
  background: #f1f5f9;
  color: #334155;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-family: 'SF Mono', 'Fira Code', monospace;
  border: 1px solid #e2e8f0;
}

.auth-table {
  width: 100%;
  border-collapse: collapse;
}

.auth-table td {
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.9rem;
}

.auth-table .attr-key {
  font-weight: 600;
  color: #64748b;
  width: 140px;
}
```

## Visual Layout

After login, the dashboard order is:

1. Auth status bar (Authenticated as ... via ...)
2. Action buttons (UserInfo, Refresh, Introspect, Logout)
3. **🔐 Authorization panel** ← NEW
4. Token panels (ID, Access, Refresh)
5. Result panels (UserInfo, Introspection)
6. Event log
