/**
 * Configuration management for the playground.
 * Loads config from the seed-generated config.generated.js file
 * and provides presets for each scenario.
 */

let playgroundConfig = null;

/**
 * Load the playground configuration from the generated config file.
 * Falls back to null if the file doesn't exist (seed hasn't been run).
 * @returns {Promise<object|null>} The loaded config or null
 */
export async function loadConfig() {
  try {
    const module = await import('/config.generated.js');
    playgroundConfig = module.PLAYGROUND_CONFIG;
    return playgroundConfig;
  } catch (err) {
    console.error('Failed to load config.generated.js:', err);
    return null;
  }
}

/** Get the current loaded config. */
export function getConfig() { return playgroundConfig; }

/**
 * Get OIDC settings for a specific organization key.
 * @param {string} orgKey - Organization key (e.g., 'no2fa', 'email2fa')
 * @returns {{ authority: string, clientId: string, orgSlug: string, orgName: string, twoFactorPolicy: string }}
 */
export function getOrgSettings(orgKey) {
  if (!playgroundConfig) throw new Error('Config not loaded');
  const org = playgroundConfig.organizations[orgKey];
  if (!org) throw new Error(`Unknown org key: ${orgKey}`);
  return {
    authority: `${playgroundConfig.portaUrl}/${org.slug}`,
    clientId: org.clientId,
    orgSlug: org.slug,
    orgName: org.name,
    twoFactorPolicy: org.twoFactorPolicy,
  };
}

/**
 * Scenario definitions with descriptions and hints.
 * Each scenario maps to an org + user + flow description.
 */
export const SCENARIOS = [
  {
    id: 'normalLogin',
    name: 'Normal Login (No 2FA)',
    orgKey: 'no2fa',
    description: 'Standard password login without any 2FA',
    hint: 'Enter email and password on the login page',
  },
  {
    id: 'emailOtp',
    name: 'Email OTP 2FA',
    orgKey: 'email2fa',
    description: 'Password login + 6-digit email OTP verification',
    hint: 'Check MailHog for the OTP code after login',
  },
  {
    id: 'totpAuth',
    name: 'TOTP Authenticator',
    orgKey: 'totp2fa',
    description: 'Password login + authenticator app code',
    hint: 'Use your authenticator app to get the 6-digit code',
  },
  {
    id: 'recoveryCode',
    name: 'Recovery Code',
    orgKey: 'totp2fa',
    description: 'Login with TOTP, then use a recovery code instead',
    hint: 'Click "Use recovery code" on the 2FA page',
  },
  {
    id: 'magicLink',
    name: 'Magic Link',
    orgKey: 'no2fa',
    description: 'Passwordless login via email link',
    hint: 'Click "Login with magic link" on login page, check MailHog',
  },
  {
    id: 'thirdPartyConsent',
    name: 'Third-Party Consent',
    orgKey: 'thirdparty',
    description: 'Login triggers a consent screen for scope approval',
    hint: 'Approve or deny the requested scopes',
  },
  {
    id: 'passwordReset',
    name: 'Password Reset',
    orgKey: 'no2fa',
    description: 'Forgot password → email → reset → login',
    hint: 'Click "Forgot password" on login page, check MailHog',
  },
  {
    id: 'totpSetup',
    name: 'TOTP Setup (Fresh User)',
    orgKey: 'totp2fa',
    description: 'First login for a user in a TOTP-required org triggers setup',
    hint: 'Login as fresh@totp2fa.local to see the TOTP enrollment flow',
  },
];
