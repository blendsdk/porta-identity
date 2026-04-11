/**
 * Main app module — orchestrates the playground.
 * Initializes config, renders scenarios, wires buttons, handles login state.
 */
import { loadConfig, getConfig, getOrgSettings, SCENARIOS } from '/js/config.js';
import { initAuth, login, logout, refreshToken, loadExistingUser, getUser } from '/js/auth.js';
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

  // Wire button handlers
  wireButtons();

  // Check for existing session (after callback redirect)
  const defaultOrg = 'no2fa';
  selectOrg(defaultOrg);

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
// Button Handlers
// ---------------------------------------------------------------------------

function wireButtons() {
  document.getElementById('btn-login').addEventListener('click', async () => {
    await login();
  });

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
