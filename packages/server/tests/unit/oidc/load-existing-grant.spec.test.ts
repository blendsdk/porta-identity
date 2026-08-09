/**
 * Specification tests for the custom `loadExistingGrant` OIDC config hook.
 *
 * Source: plans/auth-session-token-fixes/07-testing-strategy.md (ST-1..ST-5),
 * 03-01-cli-refresh-token.md, AR-6, AR-7.
 *
 * These tests define the expected behavior BEFORE implementation. The
 * implementation must satisfy them — not the reverse.
 *
 * Behavior under test: when an authorization request asks for `offline_access`,
 * the client allows the `refresh_token` grant, and the existing Grant does NOT
 * already include `offline_access`, the grant is upgraded (addOIDCScope + save)
 * so the issued authorization code carries `offline_access` and a refresh token
 * is minted. In all other cases the grant is returned unchanged.
 */

import { describe, it, expect, vi } from 'vitest';
import { loadExistingGrant } from '../../../src/oidc/configuration.js';

/**
 * Build a fake provider-style `ctx` for loadExistingGrant.
 */
function makeCtx(options: {
  scope?: string;
  grantTypeAllowed?: (t: string) => boolean;
  grantId?: string | undefined;
  consentGrantId?: string | undefined;
  grant?: {
    scope: string;
  } | null;
}) {
  const grantScopeState = { value: options.grant?.scope ?? '' };
  const saveSpy = vi.fn(async () => undefined);
  const addSpy = vi.fn((scope: string) => {
    const set = new Set(grantScopeState.value.split(' ').filter(Boolean));
    for (const s of scope.split(' ').filter(Boolean)) set.add(s);
    grantScopeState.value = [...set].join(' ');
  });

  const grantObject =
    options.grant === null || options.grant === undefined
      ? null
      : {
          getOIDCScope: () => grantScopeState.value,
          addOIDCScope: addSpy,
          save: saveSpy,
        };

  const ctx = {
    oidc: {
      params: { scope: options.scope },
      client: {
        clientId: 'cli-client',
        grantTypeAllowed:
          options.grantTypeAllowed ?? ((t: string) => t === 'refresh_token'),
      },
      result: options.consentGrantId
        ? { consent: { grantId: options.consentGrantId } }
        : undefined,
      session: {
        grantIdFor: (_clientId: string) => options.grantId,
      },
      provider: {
        Grant: {
          find: vi.fn(async (_id: string) => grantObject),
        },
      },
    },
  };

  return { ctx, saveSpy, addSpy, grantObject, getScope: () => grantScopeState.value };
}

describe('loadExistingGrant (spec)', () => {
  // ST-1
  it('ST-1: upgrades grant to include offline_access when requested, client allows refresh, grant lacks it', async () => {
    const { ctx, saveSpy, addSpy, getScope } = makeCtx({
      scope: 'openid profile email offline_access',
      grantTypeAllowed: (t) => t === 'refresh_token',
      grantId: 'grant-1',
      grant: { scope: 'openid profile email' },
    });

    const result = await loadExistingGrant(ctx as never);

    expect(result).toBeTruthy();
    expect(addSpy).toHaveBeenCalledWith('offline_access');
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(getScope().split(' ')).toContain('offline_access');
  });

  // ST-2
  it('ST-2: leaves grant unchanged when it already includes offline_access', async () => {
    const { ctx, saveSpy, addSpy, getScope } = makeCtx({
      scope: 'openid profile email offline_access',
      grantTypeAllowed: (t) => t === 'refresh_token',
      grantId: 'grant-2',
      grant: { scope: 'openid profile email offline_access' },
    });

    const result = await loadExistingGrant(ctx as never);

    expect(result).toBeTruthy();
    expect(addSpy).not.toHaveBeenCalled();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(getScope().split(' ')).toContain('offline_access');
  });

  // ST-3
  it('ST-3: does not add offline_access when the request does not ask for it', async () => {
    const { ctx, saveSpy, addSpy, getScope } = makeCtx({
      scope: 'openid profile email',
      grantTypeAllowed: (t) => t === 'refresh_token',
      grantId: 'grant-3',
      grant: { scope: 'openid profile email' },
    });

    const result = await loadExistingGrant(ctx as never);

    expect(result).toBeTruthy();
    expect(addSpy).not.toHaveBeenCalled();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(getScope().split(' ')).not.toContain('offline_access');
  });

  // ST-4
  it('ST-4: does not add offline_access when the client does not allow the refresh_token grant', async () => {
    const { ctx, saveSpy, addSpy, getScope } = makeCtx({
      scope: 'openid profile email offline_access',
      grantTypeAllowed: () => false,
      grantId: 'grant-4',
      grant: { scope: 'openid profile email' },
    });

    const result = await loadExistingGrant(ctx as never);

    expect(result).toBeTruthy();
    expect(addSpy).not.toHaveBeenCalled();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(getScope().split(' ')).not.toContain('offline_access');
  });

  // ST-5
  it('ST-5: returns undefined when there is no existing grantId', async () => {
    const { ctx } = makeCtx({
      scope: 'openid profile email offline_access',
      grantTypeAllowed: (t) => t === 'refresh_token',
      grantId: undefined,
      grant: null,
    });

    const result = await loadExistingGrant(ctx as never);
    expect(result).toBeUndefined();
  });

  // ST-5 (variant): grantId present but Grant.find returns null → undefined
  it('ST-5b: returns undefined when the grant record cannot be found', async () => {
    const { ctx } = makeCtx({
      scope: 'openid profile email offline_access',
      grantTypeAllowed: (t) => t === 'refresh_token',
      grantId: 'missing-grant',
      grant: null,
    });

    const result = await loadExistingGrant(ctx as never);
    expect(result).toBeUndefined();
  });
});
