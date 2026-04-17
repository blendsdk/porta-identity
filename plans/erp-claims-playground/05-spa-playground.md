# SPA Playground: Claims Display

> **Document**: 05-spa-playground.md
> **Parent**: [Index](00-index.md)

## Overview

Update the SPA playground to visually highlight RBAC and custom claims in its token display panels. The SPA already decodes and displays the full JWT payload as JSON — the enhancement is to add a dedicated visual section for roles/permissions/custom claims when they're present.

## Architecture

The SPA playground uses client-side JavaScript (`playground/js/tokens.js`) to decode JWTs and render them. The token payloads already contain roles, permissions, and custom claims — they just need visual highlighting.

### Current Flow
1. User logs in via OIDC
2. `tokens.js` decodes ID/Access tokens
3. Payload rendered as formatted JSON in `<pre>` blocks

### Enhanced Flow
1. Same as above
2. Additionally, `tokens.js` checks for `roles`, `permissions`, and known custom claim keys
3. If present, renders a highlighted "Authorization Claims" section above the raw JSON

## Implementation Details

### tokens.js — Enhanced Token Rendering

The existing `renderTokenPanel()` function renders decoded JWT payloads. We'll add a helper that extracts and renders authorization claims when present:

```javascript
/**
 * Extract and render authorization claims from a token payload.
 * Returns HTML string for the authorization section, or empty string if no claims.
 */
function renderAuthorizationClaims(payload) {
  if (!payload) return '';
  
  const roles = payload.roles;
  const permissions = payload.permissions;
  const customClaimKeys = ['department', 'employee_id', 'cost_center', 'job_title'];
  const customClaims = customClaimKeys
    .filter(key => payload[key] != null)
    .map(key => ({ key, value: payload[key] }));
  
  if (!roles?.length && !permissions?.length && !customClaims.length) return '';
  
  let html = '<div class="authz-claims">';
  html += '<h4>🔐 Authorization Claims</h4>';
  
  if (roles?.length) {
    html += '<div class="claim-row"><span class="claim-label">Roles:</span>';
    html += roles.map(r => `<span class="role-badge">${r}</span>`).join(' ');
    html += '</div>';
  }
  
  if (permissions?.length) {
    html += '<div class="claim-row"><span class="claim-label">Permissions:</span>';
    html += permissions.map(p => `<span class="perm-tag">${p}</span>`).join(' ');
    html += '</div>';
  }
  
  if (customClaims.length) {
    html += '<div class="claim-row"><span class="claim-label">Profile:</span>';
    html += '<table class="claim-table">';
    for (const { key, value } of customClaims) {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      html += `<tr><td>${label}</td><td>${value}</td></tr>`;
    }
    html += '</table></div>';
  }
  
  html += '</div>';
  return html;
}
```

### style.css — SPA Authorization Styles

Add to `playground/css/style.css`:

```css
.authz-claims {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 4px solid #6366f1;
  border-radius: 4px;
  padding: 0.75rem 1rem;
  margin-bottom: 0.75rem;
}

.authz-claims h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.9rem;
}

.claim-row { margin-bottom: 0.5rem; }
.claim-label { font-weight: 600; color: #64748b; margin-right: 0.5rem; }
.role-badge { background: #6366f1; color: #fff; padding: 2px 8px; border-radius: 999px; font-size: 0.8rem; }
.perm-tag { background: #f1f5f9; padding: 2px 6px; border-radius: 3px; font-size: 0.75rem; font-family: monospace; border: 1px solid #e2e8f0; }
.claim-table { margin-top: 0.25rem; }
.claim-table td { padding: 2px 8px; font-size: 0.85rem; }
.claim-table td:first-child { font-weight: 600; color: #64748b; }
```

## Integration Point

The `renderAuthorizationClaims()` function is called in `renderTokenPanel()` before rendering the raw JSON, inserting the authorization section at the top of each token panel that contains claims.
