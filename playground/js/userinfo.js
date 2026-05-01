/**
 * UserInfo module — fetches and displays the OIDC UserInfo endpoint response.
 */
import { logEvent } from '/js/ui.js';

/**
 * Fetch the UserInfo endpoint using the current access token.
 * @param {string} authority - OIDC issuer URL (e.g., https://porta.local:3443/playground-no2fa)
 * @param {string} accessToken - Bearer access token
 * @returns {Promise<object|null>} UserInfo claims or null on error
 */
export async function fetchUserInfo(authority, accessToken) {
  if (!accessToken) {
    logEvent('error', 'No access token available for UserInfo');
    return null;
  }

  try {
    // Discover the userinfo_endpoint from OIDC discovery
    const discoveryUrl = `${authority}/.well-known/openid-configuration`;
    logEvent('info', `Fetching discovery: ${discoveryUrl}`);
    const discoveryRes = await fetch(discoveryUrl);
    const discovery = await discoveryRes.json();
    const userinfoUrl = discovery.userinfo_endpoint;

    if (!userinfoUrl) {
      logEvent('error', 'No userinfo_endpoint in discovery');
      return null;
    }

    // Fetch UserInfo with Bearer token
    logEvent('info', `Fetching UserInfo: ${userinfoUrl}`);
    const res = await fetch(userinfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      logEvent('error', `UserInfo failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    logEvent('success', `UserInfo received: ${Object.keys(data).length} claims`);
    return data;
  } catch (err) {
    logEvent('error', `UserInfo error: ${err.message}`);
    return null;
  }
}

/**
 * Display the UserInfo response in the panel.
 * @param {object|null} data - UserInfo claims to display
 */
export function renderUserInfo(data) {
  const panel = document.getElementById('userinfo-panel');
  const pre = document.getElementById('userinfo-json');

  if (!data) {
    panel.hidden = true;
    return;
  }

  pre.textContent = JSON.stringify(data, null, 2);
  panel.hidden = false;
}
