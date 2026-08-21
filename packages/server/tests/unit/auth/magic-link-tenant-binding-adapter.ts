import {
  MAGIC_LINK_TENANT_BINDING_CAPABILITY_MISSING,
  type MagicLinkTenantBindingCapability,
} from './magic-link-tenant-binding-contract.js';

/**
 * Returns a fail-closed test boundary until a real public-action driver and owned observers exist.
 *
 * The specification can remain part of ordinary verification without treating a test-only
 * simulation as product evidence. Required-mode execution deliberately turns this unavailable
 * state into a clear failure until the production-backed driver is added.
 */
export function getMagicLinkTenantBindingCapability(): MagicLinkTenantBindingCapability {
  return Object.freeze({
    available: false,
    reason: MAGIC_LINK_TENANT_BINDING_CAPABILITY_MISSING,
  });
}
