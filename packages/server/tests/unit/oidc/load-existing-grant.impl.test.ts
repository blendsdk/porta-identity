/**
 * Implementation tests for `loadExistingGrant` — edge cases and internals.
 *
 * These complement the specification tests (load-existing-grant.spec.test.ts)
 * by covering malformed inputs and defensive paths. Source: plan
 * plans/auth-session-token-fixes/07-testing-strategy.md (impl tests).
 */

import { describe, it, expect, vi } from 'vitest';
import { loadExistingGrant } from '../../../src/oidc/configuration.js';

describe('loadExistingGrant (impl edge cases)', () => {
  it('uses the consent result grantId when present (takes precedence over session)', async () => {
    const find = vi.fn(async (id: string) => ({
      _id: id,
      getOIDCScope: () => 'openid offline_access',
      addOIDCScope: vi.fn(),
      save: vi.fn(),
    }));
    const ctx = {
      oidc: {
        params: { scope: 'openid offline_access' },
        client: { clientId: 'c', grantTypeAllowed: () => true },
        result: { consent: { grantId: 'from-consent' } },
        session: { grantIdFor: () => 'from-session' },
        provider: { Grant: { find } },
      },
    };

    await loadExistingGrant(ctx as never);
    expect(find).toHaveBeenCalledWith('from-consent');
  });

  it('handles an undefined scope param without throwing (no upgrade)', async () => {
    const addOIDCScope = vi.fn();
    const save = vi.fn();
    const ctx = {
      oidc: {
        params: {}, // no scope
        client: { clientId: 'c', grantTypeAllowed: () => true },
        result: undefined,
        session: { grantIdFor: () => 'g' },
        provider: {
          Grant: {
            find: async () => ({ getOIDCScope: () => 'openid', addOIDCScope, save }),
          },
        },
      },
    };

    const result = await loadExistingGrant(ctx as never);
    expect(result).toBeTruthy();
    expect(addOIDCScope).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('handles a client without grantTypeAllowed function (treated as not allowed)', async () => {
    const addOIDCScope = vi.fn();
    const save = vi.fn();
    const ctx = {
      oidc: {
        params: { scope: 'openid offline_access' },
        client: { clientId: 'c' }, // no grantTypeAllowed
        result: undefined,
        session: { grantIdFor: () => 'g' },
        provider: {
          Grant: {
            find: async () => ({ getOIDCScope: () => 'openid', addOIDCScope, save }),
          },
        },
      },
    };

    const result = await loadExistingGrant(ctx as never);
    expect(result).toBeTruthy();
    expect(addOIDCScope).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('handles a grant whose getOIDCScope returns an empty string (adds offline_access)', async () => {
    const addOIDCScope = vi.fn();
    const save = vi.fn();
    const ctx = {
      oidc: {
        params: { scope: 'openid offline_access' },
        client: { clientId: 'c', grantTypeAllowed: () => true },
        result: undefined,
        session: { grantIdFor: () => 'g' },
        provider: {
          Grant: {
            find: async () => ({ getOIDCScope: () => '', addOIDCScope, save }),
          },
        },
      },
    };

    const result = await loadExistingGrant(ctx as never);
    expect(result).toBeTruthy();
    expect(addOIDCScope).toHaveBeenCalledWith('offline_access');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('tolerates extra whitespace in the requested scope', async () => {
    const addOIDCScope = vi.fn();
    const save = vi.fn();
    const ctx = {
      oidc: {
        params: { scope: '  openid   offline_access  ' },
        client: { clientId: 'c', grantTypeAllowed: () => true },
        result: undefined,
        session: { grantIdFor: () => 'g' },
        provider: {
          Grant: {
            find: async () => ({ getOIDCScope: () => 'openid', addOIDCScope, save }),
          },
        },
      },
    };

    const result = await loadExistingGrant(ctx as never);
    expect(result).toBeTruthy();
    expect(addOIDCScope).toHaveBeenCalledWith('offline_access');
  });
});
