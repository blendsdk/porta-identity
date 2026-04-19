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
 * Default login methods for organisations, mirrored from the seed script's
 * `ORG_DEFAULT_LOGIN_METHODS` map. Used for display only — the server is the
 * single source of truth at request time.
 */
const ORG_DEFAULT_LOGIN_METHODS = {
  passwordOnly: ['password'],
};

/** Fallback (matches the DB DEFAULT for organisations). */
const DEFAULT_LOGIN_METHODS = ['password', 'magic_link'];

/** Map org slug → orgKey, so we can look up defaults from a seeded client. */
function orgKeyForSlug(slug) {
  if (!playgroundConfig?.organizations) return null;
  for (const [key, org] of Object.entries(playgroundConfig.organizations)) {
    if (org.slug === slug) return key;
  }
  return null;
}

/**
 * Resolve the effective login methods for a demo profile.
 * Mirrors the server-side resolution rule: client override wins, else org
 * default, else the hard-coded fallback.
 *
 * @param {{ loginMethods: string[]|null, orgSlug: string }} profile
 * @returns {{ methods: string[], source: 'client'|'org'|'fallback' }}
 */
export function resolveLoginMethods(profile) {
  if (Array.isArray(profile.loginMethods) && profile.loginMethods.length > 0) {
    return { methods: [...profile.loginMethods], source: 'client' };
  }
  const orgKey = orgKeyForSlug(profile.orgSlug);
  const orgDefault = orgKey ? ORG_DEFAULT_LOGIN_METHODS[orgKey] : null;
  if (orgDefault && orgDefault.length > 0) {
    return { methods: [...orgDefault], source: 'org' };
  }
  return { methods: [...DEFAULT_LOGIN_METHODS], source: 'fallback' };
}

/**
 * Get the ordered list of login-method demo profiles from the loaded config.
 * Returns an empty list if the config was generated before Phase 10.
 *
 * Each entry is shaped as:
 *   { key, clientId, orgSlug, label, loginMethods }
 *
 * where `key` is the object key from `loginMethodClients` (e.g. "password",
 * "magic", "both", "orgForced"), and `loginMethods` is the per-client
 * override array or `null` when the client inherits from its organization.
 *
 * @returns {Array<{
 *   key: string,
 *   clientId: string,
 *   orgSlug: string,
 *   label: string,
 *   loginMethods: string[]|null,
 * }>}
 */
export function getLoginMethodProfiles() {
  const map = playgroundConfig?.loginMethodClients;
  if (!map) return [];
  return Object.entries(map).map(([key, value]) => ({ key, ...value }));
}

/** Find a single login-method profile by its key, or `null` if unknown. */
export function findLoginMethodProfile(profileKey) {
  const profiles = getLoginMethodProfiles();
  return profiles.find((p) => p.key === profileKey) ?? null;
}

/**
 * Translate a profile into the OIDC settings needed by `initAuth()`.
 * Authority is derived from the profile's org slug so magic-link profiles
 * that point at the password-only org still hit the correct tenant path.
 */
export function getProfileSettings(profile) {
  if (!playgroundConfig) throw new Error('Config not loaded');
  return {
    authority: `${playgroundConfig.portaUrl}/${profile.orgSlug}`,
    clientId: profile.clientId,
    orgSlug: profile.orgSlug,
    orgName: profile.label,
    // 2FA policy is pulled from the owning org when available; profiles that
    // reuse a seed org will see its real policy, profiles referencing a
    // missing org fall back to "optional" so UI doesn't break.
    twoFactorPolicy:
      playgroundConfig.organizations?.[orgKeyForSlug(profile.orgSlug)]?.twoFactorPolicy
        ?? 'optional',
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
