/**
 * Main app module — orchestrates the playground.
 * Initializes config, renders scenarios, wires buttons, handles login state.
 */
import {
  loadConfig,
  getConfig,
  getOrgSettings,
  SCENARIOS,
  getLoginMethodProfiles,
  findLoginMethodProfile,
  getProfileSettings,
  resolveLoginMethods,
} from '/js/config.js';
import {
  initAuth,
  login,
  logout,
  refreshToken,
  loadExistingUser,
  getUser,
  loginWithProfile,
  clearOidcStorage,
} from '/js/auth.js';

import { logEvent, checkServiceStatus, updateAuthStatus, showLoggedInView, showLoggedOutView, initThemeToggle } from '/js/ui.js';
import { renderTokenPanels, clearTokenPanels } from '/js/tokens.js';
import { fetchUserInfo, renderUserInfo } from '/js/userinfo.js';

/** Currently selected scenario (org key). */
let currentOrgKey = null;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

async function init() {
  logEvent('info', 'Playground starting...');

  // Theme toggle
  initThemeToggle();

  // Check service health
  await checkServiceStatus();
  // Re-check every 30 seconds
  setInterval(checkServiceStatus, 30000);

  // Load configuration
  const config = await loadConfig();
  if (!config) {
    logEvent('error', 'Config not loaded — run: yarn tsx scripts/playground-seed.ts');
    return;
  }
  logEvent('success', 'Config loaded');

  // Render scenarios
  renderScenarios();

  // Populate org selector
  populateOrgSelector(config);

  // Populate login-method demo dropdown (no-op when config has no profiles)
  populateLoginMethodDemo(config);

  // Wire button handlers
  wireButtons();

  // Restore the org that was active during login (or default to 'no2fa').
  // This ensures the UserManager is initialized with the same authority/client_id
  // that was used during login, so loadExistingUser() looks up the correct
  // localStorage key. Without this, org mismatches cause phantom sessions.
  const savedOrg = localStorage.getItem('playground_selected_org') || 'no2fa';
  selectOrg(savedOrg);

  // Detect post-logout redirect: if all oidc.user:* entries are gone
  // (cleared by our defensive logout cleanup), ensure the UI is logged-out.
  // Also clean up any stale oidc state entries left by signoutRedirect().
  const hasOidcUser = Object.keys(localStorage).some((k) => k.startsWith('oidc.user:'));
  if (!hasOidcUser) {
    // No user entries — clear any leftover oidc state/nonce entries
    const staleKeys = Object.keys(localStorage).filter((k) => k.startsWith('oidc.'));
    for (const key of staleKeys) {
      localStorage.removeItem(key);
    }
  }

  const user = await loadExistingUser();
  if (user) {
    onLogin(user);
  } else {
    updateAuthStatus(false);
  }
}

// ---------------------------------------------------------------------------
// Scenario Rendering
// ---------------------------------------------------------------------------

function renderScenarios() {
  const container = document.getElementById('scenarios');
  const config = getConfig();

  for (const scenario of SCENARIOS) {
    const btn = document.createElement('button');
    btn.className = 'scenario-btn';
    btn.dataset.scenarioId = scenario.id;
    btn.dataset.orgKey = scenario.orgKey;
    btn.innerHTML = `
      <span class="scenario-name">${scenario.name}</span>
      <span class="scenario-desc">${scenario.description}</span>
    `;

    btn.addEventListener('click', () => {
      selectScenario(scenario);
    });

    container.appendChild(btn);
  }
}

function selectScenario(scenario) {
  // Highlight active scenario button
  document.querySelectorAll('.scenario-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.scenarioId === scenario.id);
  });

  // Switch org
  selectOrg(scenario.orgKey);

  // Show credentials hint in event log
  const config = getConfig();
  const scenarioConfig = config?.scenarios?.[scenario.id];
  if (scenarioConfig) {
    const userEmail = scenarioConfig.userEmail;
    const userConfig = config.users?.[userEmail];
    logEvent('info', `Scenario: ${scenario.name}`);
    logEvent('info', `  Hint: ${scenario.hint}`);
    if (userConfig) {
      logEvent('info', `  Credentials: ${userEmail} / ${userConfig.password}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Org Selector
// ---------------------------------------------------------------------------

function populateOrgSelector(config) {
  const select = document.getElementById('config-org');
  select.innerHTML = '';

  for (const [key, org] of Object.entries(config.organizations)) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = `${org.name} (${org.slug})`;
    select.appendChild(option);
  }

  select.addEventListener('change', (e) => {
    selectOrg(e.target.value);
  });
}

function selectOrg(orgKey) {
  currentOrgKey = orgKey;

  // Persist the selected org so page reloads (after login callback or
  // post-logout redirect) re-initialize the UserManager with the same
  // authority/client_id. This prevents localStorage key mismatches where
  // signoutRedirect() clears the wrong key or loadExistingUser() looks
  // under a different key than the one used during login.
  localStorage.setItem('playground_selected_org', orgKey);

  // Update org selector dropdown
  const select = document.getElementById('config-org');
  if (select.value !== orgKey) select.value = orgKey;

  // Initialize auth with this org
  const settings = getOrgSettings(orgKey);
  initAuth(settings);

  // Update config details panel
  updateConfigDetails(settings);
}

function updateConfigDetails(settings) {
  const panel = document.getElementById('config-details');
  panel.innerHTML = `
    <div class="config-row">
      <span class="config-label">Authority</span>
      <span class="config-value">${settings.authority}</span>
    </div>
    <div class="config-row">
      <span class="config-label">Client ID</span>
      <span class="config-value">${settings.clientId}</span>
    </div>
    <div class="config-row">
      <span class="config-label">Redirect URI</span>
      <span class="config-value">http://localhost:4000/callback.html</span>
    </div>
    <div class="config-row">
      <span class="config-label">Scope</span>
      <span class="config-value">openid profile email</span>
    </div>
    <div class="config-row">
      <span class="config-label">2FA Policy</span>
      <span class="config-value">${settings.twoFactorPolicy}</span>
    </div>
    <div class="config-row">
      <span class="config-label">Discovery</span>
      <span class="config-value">${settings.authority}/.well-known/openid-configuration</span>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Login-method demo card
// ---------------------------------------------------------------------------

/**
 * Populate the `<select id="login-method-profile">` dropdown with the demo
 * profiles shipped in `loginMethodClients`. If the config predates Phase 10
 * (older seed), the whole card is hidden so existing setups keep working.
 * Re-renders the detail panel when the selection changes.
 */
function populateLoginMethodDemo(config) {
  const card = document.getElementById('login-method-demo');
  if (!card) return;

  const profiles = getLoginMethodProfiles();
  if (profiles.length === 0) {
    // Older seed — hide the card entirely so users don't see a broken widget.
    card.hidden = true;
    return;
  }

  const select = document.getElementById('login-method-profile');
  select.innerHTML = '';
  for (const profile of profiles) {
    const option = document.createElement('option');
    option.value = profile.key;
    option.textContent = profile.label;
    select.appendChild(option);
  }

  // Render once on load and whenever the selection changes.
  renderLoginMethodDetails(select.value);
  select.addEventListener('change', (e) => {
    renderLoginMethodDetails(e.target.value);
  });
}

/**
 * Render the confirmation panel for a given profile, showing which client
 * the flow will use and what buttons to expect on the login page.
 */
function renderLoginMethodDetails(profileKey) {
  const panel = document.getElementById('login-method-details');
  if (!panel) return;

  const profile = findLoginMethodProfile(profileKey);
  if (!profile) {
    panel.innerHTML = '<em>Select a profile to see details.</em>';
    return;
  }

  const { methods, source } = resolveLoginMethods(profile);
  const overrideLabel = profile.loginMethods
    ? `Set on client: [${profile.loginMethods.join(', ')}]`
    : 'Not set — inherits org default';
  const expectedButtons = [];
  if (methods.includes('password')) expectedButtons.push('Password form');
  if (methods.includes('magic_link')) expectedButtons.push('"Email me a login link"');
  const expectedSummary = expectedButtons.length > 0
    ? expectedButtons.join(' + ')
    : 'None (login page blocked)';

  panel.innerHTML = `
    <div class="detail-row"><span class="detail-label">Client ID</span>${profile.clientId}</div>
    <div class="detail-row"><span class="detail-label">Org slug</span>${profile.orgSlug}</div>
    <div class="detail-row"><span class="detail-label">Client override</span>${overrideLabel}</div>
    <div class="detail-row">
      <span class="detail-label">Effective</span>
      [${methods.join(', ')}]
      <span class="source-badge source-${source}">via ${source}</span>
    </div>
    <div class="expected-ui"><strong>Expected UI:</strong> ${expectedSummary}</div>
  `;
}

// ---------------------------------------------------------------------------
// Button Handlers
// ---------------------------------------------------------------------------

function wireButtons() {
  document.getElementById('btn-login').addEventListener('click', async () => {
    await login();
  });

  // Login-method demo — bind only when the card is present (config-aware).
  const demoButton = document.getElementById('btn-login-method');
  if (demoButton) {
    demoButton.addEventListener('click', async () => {
      const select = document.getElementById('login-method-profile');
      const profile = findLoginMethodProfile(select?.value);
      if (!profile) {
        logEvent('error', 'No login-method profile selected');
        return;
      }
      const settings = getProfileSettings(profile);
      await loginWithProfile(settings);
    });
  }


  document.getElementById('btn-logout').addEventListener('click', async () => {
    clearTokenPanels();
    renderUserInfo(null);
    showLoggedOutView();
    updateAuthStatus(false);
    await logout();
  });

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    const user = await refreshToken();
    if (user) {
      renderTokenPanels(user);
    }
  });

  document.getElementById('btn-userinfo').addEventListener('click', async () => {
    const user = getUser();
    if (!user?.access_token) {
      logEvent('error', 'No access token — login first');
      return;
    }
    const settings = getOrgSettings(currentOrgKey);
    const data = await fetchUserInfo(settings.authority, user.access_token);
    renderUserInfo(data);
  });

  document.getElementById('btn-relogin').addEventListener('click', async () => {
    clearTokenPanels();
    renderUserInfo(null);
    await login();
  });
}

// ---------------------------------------------------------------------------
// Login State
// ---------------------------------------------------------------------------

function onLogin(user) {
  showLoggedInView();
  updateAuthStatus(true);
  renderTokenPanels(user);
  logEvent('success', 'Logged in successfully');
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

init().catch((err) => {
  console.error('App init failed:', err);
  logEvent('error', `App init failed: ${err.message}`);
});
