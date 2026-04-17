/**
 * Token display module — JWT decoding and token panel rendering.
 * Decodes JWTs using base64url (no external library needed).
 */

/**
 * Decode a base64url-encoded string to a UTF-8 string.
 * @param {string} str - Base64url encoded string
 * @returns {string} Decoded string
 */
function base64urlDecode(str) {
  // Restore base64 padding and replace URL-safe chars
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return atob(base64);
}

/**
 * Decode a JWT into its header and payload objects.
 * Returns null if the token isn't a valid JWT structure.
 * @param {string} token - Raw JWT string
 * @returns {{ header: object, payload: object } | null}
 */
export function decodeJwt(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null; // Not a JWT (opaque token)
  try {
    const header = JSON.parse(base64urlDecode(parts[0]));
    const payload = JSON.parse(base64urlDecode(parts[1]));
    return { header, payload };
  } catch {
    return null; // Malformed JWT
  }
}

/**
 * Render all token panels (ID token, access token, refresh token).
 * @param {object} user - OIDC user object from oidc-client-ts
 */
export function renderTokenPanels(user) {
  renderIdToken(user);
  renderAccessToken(user);
  renderRefreshToken(user);
}

/**
 * Clear all token panels.
 */
export function clearTokenPanels() {
  document.getElementById('id-token-panel').innerHTML = '';
  document.getElementById('access-token-panel').innerHTML = '';
  document.getElementById('refresh-token-panel').innerHTML = '';
}

// ---------------------------------------------------------------------------
// Authorization claims renderer
// ---------------------------------------------------------------------------

/**
 * Extract and render authorization claims (roles, permissions, profile)
 * from a token payload. Returns an HTML string for the authorization section,
 * or an empty string if no authorization claims are present.
 *
 * @param {object} payload - Decoded JWT payload
 * @returns {string} HTML string for the authorization claims section
 */
function renderAuthorizationClaims(payload) {
  if (!payload) return '';

  const roles = payload.roles;
  const permissions = payload.permissions;
  const customClaimKeys = ['department', 'employee_id', 'cost_center', 'job_title'];
  const customClaims = customClaimKeys
    .filter(key => payload[key] != null)
    .map(key => ({ key, value: payload[key] }));

  // No authorization data — return empty
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

// ---------------------------------------------------------------------------
// Individual token renderers
// ---------------------------------------------------------------------------

function renderIdToken(user) {
  const panel = document.getElementById('id-token-panel');
  const token = user?.id_token;
  if (!token) {
    panel.innerHTML = '<h3>🆔 ID Token</h3><p>Not available</p>';
    return;
  }
  const decoded = decodeJwt(token);
  // Show authorization claims summary above the raw JSON
  const authzHtml = renderAuthorizationClaims(decoded?.payload);
  panel.innerHTML = `
    <h3>🆔 ID Token</h3>
    ${authzHtml}
    <div class="token-section">
      <div class="token-section-label">Header</div>
      <pre>${JSON.stringify(decoded?.header, null, 2)}</pre>
    </div>
    <div class="token-section">
      <div class="token-section-label">Payload</div>
      <pre>${JSON.stringify(decoded?.payload, null, 2)}</pre>
    </div>
  `;
}

function renderAccessToken(user) {
  const panel = document.getElementById('access-token-panel');
  const token = user?.access_token;
  if (!token) {
    panel.innerHTML = '<h3>🔑 Access Token</h3><p>Not available</p>';
    return;
  }
  const decoded = decodeJwt(token);
  if (decoded) {
    // JWT access token — show decoded with authorization claims highlight
    const authzHtml = renderAuthorizationClaims(decoded.payload);
    panel.innerHTML = `
      <h3>🔑 Access Token (JWT)</h3>
      ${authzHtml}
      <div class="token-section">
        <div class="token-section-label">Header</div>
        <pre>${JSON.stringify(decoded.header, null, 2)}</pre>
      </div>
      <div class="token-section">
        <div class="token-section-label">Payload</div>
        <pre>${JSON.stringify(decoded.payload, null, 2)}</pre>
      </div>
    `;
  } else {
    // Opaque access token — show raw
    panel.innerHTML = `
      <h3>🔑 Access Token (Opaque)</h3>
      <pre>${token}</pre>
    `;
  }
}

function renderRefreshToken(user) {
  const panel = document.getElementById('refresh-token-panel');
  const token = user?.refresh_token;
  if (!token) {
    panel.innerHTML = '<h3>🔄 Refresh Token</h3><p>Not present (offline_access scope may be needed)</p>';
    return;
  }
  panel.innerHTML = `
    <h3>🔄 Refresh Token</h3>
    <p>Present (${token.length} chars)</p>
    <pre>${token.substring(0, 40)}${token.length > 40 ? '...' : ''}</pre>
  `;
}
