/** Implementation regressions for focused OIDC client editor composition. */

import {
  Button,
  ComboBox,
  cover,
  createApplication,
  DatePicker,
  Dialog,
  Group,
  View,
} from '@jsvision/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createClientSecretExpiryFields,
  LONG_SECRET_EXPIRY_WARNING,
  showGenerateClientSecretDialog,
} from '../../src/admin/client-credential-dialogs.js';
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
  postLogoutRedirectUris: [],
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

/** Lets reactive layout and modal transitions settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Returns one mounted action by its visible label. */
function button(root: View, label: string): Button {
  const action = descendants(root)
    .filter((view) => view instanceof Button)
    .find((candidate) => candidate.activation.label === label);
  if (!action) throw new Error(`${label} button missing.`);
  return action;
}

/** Selects a ComboBox item through its public value signal. */
function choose(combo: ComboBox<unknown>, label: string): void {
  const item = combo.items
    .peek()
    .find(
      (candidate): candidate is { readonly label: string } =>
        typeof candidate === 'object' &&
        candidate !== null &&
        'label' in candidate &&
        candidate.label === label,
    );
  if (!item) throw new Error(`${label} choice missing.`);
  combo.value.set(item);
}

/** Reads the complete terminal frame. */
function frameText(host: ReturnType<typeof createApplication>): string {
  return host.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('focused editor implementation', () => {
  it('keeps the stable facade while removing the obsolete shared configuration export', async () => {
    const facade = await import('../../src/admin/client-dialogs.js');

    expect(typeof facade.showAuthenticationUrlDialog).toBe('function');
    expect(typeof facade.showDeleteAuthenticationUrlDialog).toBe('function');
    expect(typeof facade.buildAuthenticationUrlUpdate).toBe('function');
    expect('showClientAuthenticationDialog' in facade).toBe(false);
    expect(facade.showGenerateClientSecretDialog).toBe(showGenerateClientSecretDialog);
    expect('showClientProtocolDialog' in facade).toBe(false);
    expect('showClientConfigurationDialog' in facade).toBe(false);
  });

  it('uses an exact next-day UTC custom expiry and a non-blocking long-term warning', async () => {
    const fields = createClientSecretExpiryFields(new Date('2026-09-07T12:00:00Z'));
    const content = new Group();
    content.add(cover(fields.content));
    const host = createApplication({ content, viewport: { width: 70, height: 10 } });
    const views = descendants(fields.content);
    const choice = views.find((view) => view instanceof ComboBox);
    if (!(choice instanceof ComboBox)) throw new Error('Expiry choice missing.');
    choose(choice, 'Custom');
    await settle();
    const picker = descendants(fields.content).find((view) => view instanceof DatePicker);
    if (!(picker instanceof DatePicker)) throw new Error('Custom date picker missing.');

    picker.value.set({ year: 2028, month: 9, day: 8 });
    await settle();
    expect(fields.expiresAt()).toBe('2028-09-09T00:00:00.000Z');
    expect(frameText(host).replace(/\s+/g, ' ')).toContain(LONG_SECRET_EXPIRY_WARNING);
  });

  it('generates the default six-month expiry through the focused dialog', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T12:00:00Z'));
    const host = createApplication({ viewport: { width: 80, height: 24 } });
    const pending = showGenerateClientSecretDialog(host, new AbortController().signal, client);
    await settle();
    const dialog = host.desktop.activeWindow();
    if (!(dialog instanceof Dialog)) throw new Error('Secret dialog missing.');
    const add = button(dialog, 'Add');
    host.loop.focusView(add);
    host.loop.dispatch({ type: 'key', key: 'space', ctrl: false, alt: false, shift: false });

    await expect(pending).resolves.toEqual({
      kind: 'generate',
      clientId: client.id,
      input: { expiresAt: '2027-03-08T00:00:00.000Z' },
    });
  });

});
