/**
 * OIDC authentication module.
 * Wraps oidc-client-ts UserManager for login, logout, callback, and refresh.
 */
import { UserManager, WebStorageStateStore } from '/vendor/oidc-client-ts.min.js';
import { logEvent } from '/js/ui.js';

let userManager = null;
let currentUser = null;

/**
 * Initialize (or re-initialize) the OIDC UserManager with new settings.
 * Called when the user selects a different scenario/org.
 * @param {{ authority: string, clientId: string }} settings
 */
export function initAuth(settings) {
  const config = {
    authority: settings.authority,
    client_id: settings.clientId,
    redirect_uri: 'http://localhost:4000/callback.html',
    post_logout_redirect_uri: 'http://localhost:4000/',
    response_type: 'code',
    scope: 'openid profile email',
    // Use localStorage for both user and state storage so that cross-tab flows
    // (e.g., magic link opened from MailHog in a new tab) can complete the
    // OIDC callback with access to the original PKCE state and authority.
    userStore: new WebStorageStateStore({ store: window.localStorage }),
    stateStore: new WebStorageStateStore({ store: window.localStorage }),
    // Disable automatic silent renew to keep playground simple
    automaticSilentRenew: false,
    // Revoke access/refresh tokens server-side during signout.
    // Porta uses opaque tokens stored in Redis/PostgreSQL — without this,
    // tokens remain valid on the server even after the OIDC session is destroyed.
    revokeTokensOnSignout: true,
  };

  userManager = new UserManager(config);

  // Wire up events for logging
  userManager.events.addUserLoaded((user) => {
    currentUser = user;
    logEvent('success', `User loaded: ${user.profile?.email || user.profile?.sub}`);
  });

  userManager.events.addUserUnloaded(() => {
    currentUser = null;
    logEvent('info', 'User unloaded (logged out)');
  });

  userManager.events.addAccessTokenExpired(() => {
    logEvent('warn', 'Access token expired');
  });

  userManager.events.addSilentRenewError((err) => {
    logEvent('error', `Silent renew error: ${err.message}`);
  });

  logEvent('info', `Auth initialized: ${settings.authority}`);
}

/** Get the current OIDC user (or null). */
export function getUser() { return currentUser; }

/** Get the UserManager instance. */
export function getUserManager() { return userManager; }

/**
 * Start the OIDC login redirect flow.
 */
export async function login() {
  if (!userManager) {
    logEvent('error', 'Auth not initialized — select a scenario first');
    return;
  }
  try {
    logEvent('info', 'Starting OIDC login redirect...');
    // Store current auth settings so callback.html can reconstruct the UserManager.
    // Uses localStorage (not sessionStorage) so the settings survive cross-tab
    // navigation — e.g., when a magic link opens in a new tab from MailHog.
    localStorage.setItem('playground_authority', userManager.settings.authority);
    localStorage.setItem('playground_client_id', userManager.settings.client_id);
    await userManager.signinRedirect();
  } catch (err) {
    logEvent('error', `Login failed: ${err.message}`);
  }
}

/**
 * Handle the OIDC callback (called on callback.html).
 * Exchanges the authorization code for tokens and redirects to index.
 */
export async function handleCallback() {
  try {
    // Restore the authority and client_id that were used for the login redirect.
    // Reads from localStorage (shared across tabs) so magic link flows work
    // even when the callback opens in a different tab than the original login.
    const authority = localStorage.getItem('playground_authority') || 'http://localhost:3000';
    const clientId = localStorage.getItem('playground_client_id') || 'placeholder';

    const tempManager = new UserManager({
      authority,
      client_id: clientId,
      redirect_uri: 'http://localhost:4000/callback.html',
      response_type: 'code',
      scope: 'openid profile email',
      // Must match the storage used during signinRedirect (localStorage)
      userStore: new WebStorageStateStore({ store: window.localStorage }),
      stateStore: new WebStorageStateStore({ store: window.localStorage }),
    });

    const user = await tempManager.signinRedirectCallback();
    if (user) {
      const msg = document.getElementById('callback-message');
      if (msg) msg.textContent = 'Login successful! Redirecting...';
      // Redirect back to main page
      window.location.href = '/';
    }
  } catch (err) {
    const msg = document.getElementById('callback-message');
    if (msg) msg.textContent = `Login failed: ${err.message}`;
    console.error('Callback error:', err);
  }
}

/**
 * Perform a token refresh using the refresh token.
 * @returns {Promise<object|null>} Updated user or null
 */
export async function refreshToken() {
  if (!userManager) {
    logEvent('error', 'Auth not initialized');
    return null;
  }
  try {
    logEvent('info', 'Refreshing token...');
    const user = await userManager.signinSilent();
    currentUser = user;
    logEvent('success', 'Token refreshed');
    return user;
  } catch (err) {
    logEvent('error', `Token refresh failed: ${err.message}`);
    return null;
  }
}

/**
 * Logout the current user (redirect to Porta end_session).
 *
 * Saves the id_token BEFORE clearing storage so it can be passed as
 * id_token_hint to Porta's end_session endpoint. Without the hint,
 * the logout falls back to a generic session without client context.
 *
 * After saving the token, defensively clears ALL oidc-client-ts entries
 * from localStorage to prevent stale data when the authority/client_id
 * has changed (e.g., user switched org selector after login).
 */
export async function logout() {
  if (!userManager) {
    logEvent('error', 'Auth not initialized');
    return;
  }
  try {
    logEvent('info', 'Logging out...');

    // Step 1: Save id_token BEFORE clearing storage.
    // The id_token_hint tells Porta which session to destroy and enables
    // the post_logout_redirect_uri without requiring user confirmation.
    const user = await userManager.getUser();
    const idTokenHint = user?.id_token;

    // Step 2: Clear stale OIDC state and all localStorage entries.
    // Must happen AFTER extracting the id_token but BEFORE signoutRedirect,
    // so the redirect doesn't pick up stale state from a different authority.
    await userManager.clearStaleState();
    clearOidcStorage();

    // Step 3: Redirect to Porta's end_session with the saved id_token_hint.
    await userManager.signoutRedirect({
      id_token_hint: idTokenHint,
    });
  } catch (err) {
    logEvent('error', `Logout failed: ${err.message}`);
  }
}

/**
 * Remove all oidc-client-ts user and state entries from localStorage.
 * Called during logout to ensure no stale tokens survive across
 * authority/client_id mismatches.
 */
export function clearOidcStorage() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('oidc.')) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
  // Also clear the playground's own auth settings
  localStorage.removeItem('playground_authority');
  localStorage.removeItem('playground_client_id');
  localStorage.removeItem('playground_selected_org');
  currentUser = null;
}

/**
 * Start an OIDC login flow with a dedicated login-method demo client.
 *
 * Unlike `login()` — which reuses whatever `UserManager` was set up for the
 * currently-selected organisation — this helper re-initialises the manager
 * with the profile's authority + client_id so the authorization code flow
 * hits the Porta tenant that exposes the desired login-method override.
 *
 * The profile is the shape returned by `getProfileSettings()` in config.js.
 * @param {{ authority: string, clientId: string }} profileSettings
 */
export async function loginWithProfile(profileSettings) {
  initAuth(profileSettings);
  logEvent(
    'info',
    `Login-method demo → authority=${profileSettings.authority}, client=${profileSettings.clientId}`,
  );
  await login();
}

/**
 * Try to load an existing user from session storage.

 * Called on page load to restore previous login state.
 * @returns {Promise<object|null>} Existing user or null
 */
export async function loadExistingUser() {
  if (!userManager) return null;
  try {
    const user = await userManager.getUser();
    if (user && !user.expired) {
      currentUser = user;
      logEvent('info', `Restored session: ${user.profile?.email || user.profile?.sub}`);
      return user;
    }
    return null;
  } catch {
    return null;
  }
}
