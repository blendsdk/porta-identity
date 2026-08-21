import {
  MAGIC_LINK_TENANT_BINDING_CAPABILITY_MISSING,
  type MagicLinkTenantBindingCapability,
} from './magic-link-tenant-binding-contract.js';
import { ProductionMagicLinkTenantBindingDriver } from './magic-link-tenant-binding-production-driver.js';

/**
 * Returns a fail-closed test boundary until a real public-action driver and owned observers exist.
 *
 * The specification can remain part of ordinary verification without treating a test-only
 * simulation as product evidence. Required-mode execution deliberately turns this unavailable
 * state into a clear failure until the production-backed driver is added.
 */
export function getMagicLinkTenantBindingCapability(): MagicLinkTenantBindingCapability {
  if (process.env.PORTA_MAGIC_LINK_AUTHORITY_SPEC_REQUIRED === '1') {
    return Object.freeze({
      available: true,
      evidenceBoundary: 'public-actions-and-owned-observers',
      createDriver: async () => new ProductionMagicLinkTenantBindingDriver(),
    });
  }
  return Object.freeze({
    available: false,
    reason: MAGIC_LINK_TENANT_BINDING_CAPABILITY_MISSING,
  });
}
