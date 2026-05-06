/**
 * @portaidentity/sdk/browser — Browser entrypoint.
 *
 * Exports the browser (fetch-based) transport.
 *
 * @module @portaidentity/sdk/browser
 */

// Browser transport
export { createBrowserTransport } from './transport/browser-transport.js';
export type { BrowserTransportOptions } from './transport/browser-transport.js';

// Auth providers usable in browser
export { createTokenAuth } from './auth/index.js';
export type { AuthProvider } from './auth/index.js';
