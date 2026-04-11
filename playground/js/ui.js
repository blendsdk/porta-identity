/**
 * UI helpers — DOM utilities, status indicators, event log, theme toggle.
 */

// ---------------------------------------------------------------------------
// Event Log
// ---------------------------------------------------------------------------

const eventsContainer = () => document.getElementById('events');

/**
 * Add an entry to the event log.
 * @param {'info'|'success'|'warn'|'error'} type - Event severity
 * @param {string} message - Event message
 */
export function logEvent(type, message) {
  const container = eventsContainer();
  if (!container) return;

  const entry = document.createElement('div');
  entry.className = 'event-entry';

  const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
  entry.innerHTML = `
    <span class="event-time">${time}</span>
    <span class="event-type ${type}">${type.toUpperCase()}</span>
    <span class="event-message">${escapeHtml(message)}</span>
  `;

  // Prepend so newest is at the top
  container.prepend(entry);

  // Limit to 100 entries
  while (container.children.length > 100) {
    container.removeChild(container.lastChild);
  }
}

// ---------------------------------------------------------------------------
// Status Indicators
// ---------------------------------------------------------------------------

/**
 * Check Porta and MailHog health endpoints, update status dots.
 */
export async function checkServiceStatus() {
  // Check Porta
  const portaDot = document.getElementById('status-porta');
  try {
    const res = await fetch('http://localhost:3000/health', { mode: 'cors' });
    portaDot.className = res.ok ? 'status-dot ok' : 'status-dot err';
    portaDot.title = res.ok ? 'Porta: healthy' : 'Porta: unhealthy';
  } catch {
    portaDot.className = 'status-dot err';
    portaDot.title = 'Porta: unreachable';
  }

  // Check MailHog
  const mailDot = document.getElementById('status-mailhog');
  try {
    const res = await fetch('http://localhost:8025/api/v2/messages?limit=1', { mode: 'cors' });
    mailDot.className = res.ok ? 'status-dot ok' : 'status-dot warn';
    mailDot.title = res.ok ? 'MailHog: running' : 'MailHog: error';
  } catch {
    mailDot.className = 'status-dot warn';
    mailDot.title = 'MailHog: unreachable';
  }
}

/**
 * Update the auth status dot based on login state.
 * @param {boolean} isLoggedIn - Whether a user is currently authenticated
 */
export function updateAuthStatus(isLoggedIn) {
  const dot = document.getElementById('status-auth');
  if (isLoggedIn) {
    dot.className = 'status-dot ok';
    dot.title = 'Auth: logged in';
  } else {
    dot.className = 'status-dot unknown';
    dot.title = 'Auth: not logged in';
  }
}

// ---------------------------------------------------------------------------
// View Switching
// ---------------------------------------------------------------------------

/**
 * Show the logged-in view, hide the logged-out view.
 */
export function showLoggedInView() {
  document.getElementById('logged-out-view').hidden = true;
  document.getElementById('logged-in-view').hidden = false;
}

/**
 * Show the logged-out view, hide the logged-in view.
 */
export function showLoggedOutView() {
  document.getElementById('logged-out-view').hidden = false;
  document.getElementById('logged-in-view').hidden = true;
  document.getElementById('userinfo-panel').hidden = true;
}

// ---------------------------------------------------------------------------
// Theme Toggle
// ---------------------------------------------------------------------------

/**
 * Initialize theme toggle button and load saved preference.
 */
export function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  const saved = localStorage.getItem('playground-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  btn.textContent = saved === 'dark' ? '🌙' : '☀️';

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('playground-theme', next);
    btn.textContent = next === 'dark' ? '🌙' : '☀️';
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape HTML to prevent XSS in event log messages. */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
