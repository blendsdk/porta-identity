/** Compact-terminal specifications for focused OIDC client editor visibility. */

import {
  Button,
  ComboBox,
  createApplication,
  Dialog,
  Group,
  Scroller,
  View,
} from '@jsvision/ui';
import { describe, expect, it } from 'vitest';

import type { AdminClient } from '../../src/admin/client-state.js';
import type { AdminOrganizationContext } from '../../src/admin/state.js';

const organization: AdminOrganizationContext = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Example Organization',
  slug: 'example',
  status: 'active',
};

const client: AdminClient = {
  id: '33333333-3333-4333-8333-333333333333',
  organizationId: organization.id,
  applicationId: '22222222-2222-4222-8222-222222222222',
  clientId: 'porta-generated-client-id',
  clientName: 'Portal Web Client',
  clientType: 'confidential',
  applicationType: 'web',
  redirectUris: ['https://portal.example.test/callback'],
  postLogoutRedirectUris: ['https://portal.example.test/signed-out'],
  grantTypes: ['authorization_code', 'refresh_token'],
  responseTypes: ['code'],
  scope: 'openid profile email',
  tokenEndpointAuthMethod: 'client_secret_basic',
  allowedOrigins: ['https://portal.example.test'],
  requirePkce: true,
  loginMethods: null,
  effectiveLoginMethods: ['password', 'magic_link'],
  status: 'active',
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-08-02T00:00:00Z',
};

/** Collects every mounted descendant from one dialog. */
function descendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    result.push(view);
    if (view instanceof Group) for (const child of view.children) visit(child);
  };
  visit(root);
  return result;
}

/** Reads text currently visible in the terminal frame. */
function frameText(host: ReturnType<typeof createApplication>): string {
  return host.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Lets reactive layout and focus-driven scrolling settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Returns the active modal and fails clearly when mounting did not complete. */
function activeDialog(host: ReturnType<typeof createApplication>): Dialog {
  const dialog = host.desktop.activeWindow();
  if (!(dialog instanceof Dialog)) throw new Error('Expected a focused client editor.');
  return dialog;
}

describe('focused OIDC editors at 48×12', () => {
  it('keeps secret creation unscrolled with Add and Cancel visible', async () => {
    const host = createApplication({ viewport: { width: 48, height: 12 } });
    const { showGenerateClientSecretDialog } = await import('../../src/admin/client-dialogs.js');
    const pending = showGenerateClientSecretDialog(host, new AbortController().signal, client);
    await settle();
    const dialog = activeDialog(host);
    const expiry = descendants(dialog).find((view) => view instanceof ComboBox);
    if (!(expiry instanceof ComboBox)) throw new Error('Secret expiry choice missing.');
    expect(descendants(dialog).some((view) => view instanceof Scroller)).toBe(false);
    host.loop.focusView(expiry.input);
    await settle();
    const visible = frameText(host);
    expect(visible).toContain('Add');
    expect(visible).toContain('Cancel');
    expect(
      descendants(dialog)
        .filter((view) => view instanceof Button)
        .every((button) => button.bounds.height > 0),
    ).toBe(true);
    host.loop.endModal('cancel');
    await pending;
  });
});
