/**
 * BFF Playground — Client-Side JavaScript
 *
 * Minimal JS for the dashboard:
 *   - AJAX calls to /api/* endpoints (UserInfo, Refresh, Introspect)
 *   - M2M demo buttons (/m2m/token, /m2m/introspect, /m2m/revoke)
 *   - Event log with timestamped entries
 *   - Theme toggle (dark/light)
 *   - Clear event log
 */

// ===========================================================================
// Event Log
// ===========================================================================

function logEvent(message, type = 'info') {
  const log = document.getElementById('event-log');
  if (!log) return;
  const entry = document.createElement('div');
  entry.className = `event-entry ${type}`;
  const time = new Date().toLocaleTimeString();
  entry.textContent = `[${time}] ${message}`;
  log.prepend(entry);
}

// ===========================================================================
// AJAX Helper
// ===========================================================================

async function apiCall(url, resultElementId) {
  logEvent(`POST ${url}`, 'info');
  try {
    const resp = await fetch(url, { method: 'POST', credentials: 'same-origin' });
    const data = await resp.json();

    const el = document.getElementById(resultElementId);
    if (el) {
      if (data.success) {
        el.innerHTML = `<pre class="json-display">${escapeHtml(JSON.stringify(data.data, null, 2))}</pre>`;
        logEvent(`${url} — success`, 'success');
      } else {
        el.innerHTML = `<p class="event-entry error">${escapeHtml(data.error || 'Unknown error')}</p>`;
        logEvent(`${url} — error: ${data.error}`, 'error');
      }
    }
    return data;
  } catch (err) {
    logEvent(`${url} — network error: ${err.message}`, 'error');
    const el = document.getElementById(resultElementId);
    if (el) {
      el.innerHTML = `<p class="event-entry error">Network error: ${escapeHtml(err.message)}</p>`;
    }
    return null;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

// ===========================================================================
// Dashboard Buttons
// ===========================================================================

function bindButton(id, handler) {
  const btn = document.getElementById(id);
  if (btn) btn.addEventListener('click', handler);
}

// UserInfo
bindButton('btn-userinfo', () => apiCall('/api/me', 'userinfo-result'));

// Refresh Tokens
bindButton('btn-refresh', async () => {
  const result = await apiCall('/api/refresh', 'userinfo-result');
  if (result?.success) {
    logEvent('Tokens refreshed — reload the page to see updated tokens', 'success');
  }
});

// Introspect
bindButton('btn-introspect', () => apiCall('/api/introspect', 'introspect-result'));

// ===========================================================================
// M2M Buttons
// ===========================================================================

// Request M2M Token
bindButton('btn-m2m-token', () => apiCall('/m2m/token', 'm2m-token-result'));

// Introspect M2M Token
bindButton('btn-m2m-introspect', () => apiCall('/m2m/introspect', 'm2m-action-result'));

// Revoke M2M Token
bindButton('btn-m2m-revoke', () => apiCall('/m2m/revoke', 'm2m-action-result'));

// ===========================================================================
// Clear Event Log
// ===========================================================================

bindButton('btn-clear-log', () => {
  const log = document.getElementById('event-log');
  if (log) log.innerHTML = '<div class="event-entry info">Log cleared</div>';
});

// ===========================================================================
// Theme Toggle
// ===========================================================================

bindButton('theme-toggle', () => {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('bff-theme', next);
  logEvent(`Theme switched to ${next}`, 'info');
});

// Restore saved theme on load
(function restoreTheme() {
  const saved = localStorage.getItem('bff-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  }
})();
