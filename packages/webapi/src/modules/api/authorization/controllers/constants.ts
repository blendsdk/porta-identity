// How long a redirect cache will exist
export const REDIRECT_TTL = 30;

// How log an authentication flow will exist
export const AUTH_FLOW_TTL = 60 * 30;

// How long an OTA will exist. This is always a bit lower than AUTH_FLOW_TTL
export const OTA_TTL = 2.5 * 60;

// How log a nonce is locked before it can be reused
export const NONCE_TTL = 86400 * 1; // 1 day
