// How long a redirect cache will exist
export const MAX_AGE_REDIRECT = 1000 * 30; // seconds

// How log an authentication flow will exist
export const MAX_AGE_AUTH_FLOW = 1000 * 60 * 15; // minutes

// How log a nonce is locked before it can be reused
export const MAX_AGE_NONCE_LIFE_TIME = 1000 * 60 * 60 * 24 * 1; // days
