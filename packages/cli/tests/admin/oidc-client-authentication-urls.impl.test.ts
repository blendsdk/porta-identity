/** Implementation regressions for the focused OIDC authentication URL workflow. */

import { Button, ComboBox, createApplication, Dialog, Group, Input, Scroller, View } from '@jsvision/ui';
import { describe, expect, it } from 'vitest';

import {
  authenticationUrlRows,
  buildAuthenticationUrlUpdate,
  showAuthenticationUrlDialog,
  showDeleteAuthenticationUrlDialog,
} from '../../src/admin/client-authentication-dialog.js';
import type { AdminClient } from '../../src/admin/client-state.js';

const client: AdminClient = {
  id: '33333333-3333-4333-8333-333333333333',
  organizationId: '11111111-1111-4111-8111-111111111111',
  applicationId: '22222222-2222-4222-8222-222222222222',
  clientId: 'porta-generated-client-id',
  clientName: 'Portal Web Client',
  clientType: 'confidential',
  applicationType: 'web',
  redirectUris: ['https://portal.example.test/one', 'https://portal.example.test/two'],
  postLogoutRedirectUris: ['https://portal.example.test/signed-out'],
  grantTypes: ['authorization_code'],
  responseTypes: ['code'],
  scope: 'openid',
  tokenEndpointAuthMethod: 'client_secret_basic',
  allowedOrigins: ['https://portal.example.test'],
  requirePkce: true,
  loginMethods: null,
  effectiveLoginMethods: ['password'],
  status: 'active',
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-08-02T00:00:00Z',
};

/** Collects mounted and unmounted descendants through stable Group children. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Lets modal ownership and reactive layout settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('authentication URL implementation', () => {
  it('retains order for a same-type edit and rejects stale or over-limit mutations', () => {
    const second = authenticationUrlRows(client)[1]!;
    expect(
      buildAuthenticationUrlUpdate(client, {
        kind: 'edit',
        previous: second,
        next: { kind: 'redirect', value: 'https://portal.example.test/replaced' },
      })?.redirectUris,
    ).toEqual([
      'https://portal.example.test/one',
      'https://portal.example.test/replaced',
    ]);
    expect(
      buildAuthenticationUrlUpdate(client, {
        kind: 'delete',
        previous: { ...second, value: 'https://stale.example.test' },
      }),
    ).toBeUndefined();

    const full = {
      ...client,
      allowedOrigins: Array.from({ length: 10 }, (_, index) => `https://site-${index}.example.test`),
    };
    expect(
      buildAuthenticationUrlUpdate(full, {
        kind: 'add',
        next: { kind: 'origin', value: 'https://additional.example.test' },
      }),
    ).toBeUndefined();
  });

  it('keeps the compact editor direct, naturally sized, and abort-owned', async () => {
    const host = createApplication({ viewport: { width: 48, height: 12 } });
    const controller = new AbortController();
    const pending = showAuthenticationUrlDialog(host, controller.signal, client, null);
    await settle();
    const dialog = host.desktop.activeWindow();
    if (!(dialog instanceof Dialog)) throw new Error('Authentication URL dialog missing.');
    const views = descendants(dialog);
    expect(views.some((view) => view instanceof Scroller)).toBe(false);
    expect(views.filter((view) => view instanceof ComboBox)).toHaveLength(1);
    expect(views.filter((view) => view instanceof Input).at(-1)?.bounds.height).toBe(1);
    for (const action of views.filter((view): view is Button => view instanceof Button)) {
      expect(action.layout.size).toBeUndefined();
      expect(action.bounds.width).toBe(action.measure().width);
    }
    controller.abort();
    await expect(pending).resolves.toEqual({ kind: 'cancel' });
    expect(host.desktop.activeWindow()).toBeNull();
  });

  it('cancels and removes the delete confirmation when its owner aborts', async () => {
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const controller = new AbortController();
    const pending = showDeleteAuthenticationUrlDialog(
      host,
      controller.signal,
      client,
      authenticationUrlRows(client)[2]!,
    );
    await settle();
    controller.abort();
    await expect(pending).resolves.toEqual({ kind: 'cancel' });
    expect(host.desktop.activeWindow()).toBeNull();
  });
});
