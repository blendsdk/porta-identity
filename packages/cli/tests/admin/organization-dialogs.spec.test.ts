/**
 * Observable specifications for organization-related administration dialogs.
 */

import { at, Button, createApplication, Window } from '@jsvision/ui';
import { describe, expect, it } from 'vitest';

const server = new URL('https://PORTA.example.test:443/');
const capabilities = {
  canReadOrganizations: true,
  canCreateOrganizations: true,
};
const organizations = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Crème 東京',
    slug: 'creme-tokyo',
    status: 'active' as const,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Suspended Tenant',
    slug: 'suspended-tenant',
    status: 'suspended' as const,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Archived Tenant',
    slug: 'archived-tenant',
    status: 'archived' as const,
  },
];

/** Reads visible characters from a real JSVision frame buffer. */
function frameText(application: ReturnType<typeof createApplication>): string {
  return application.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Allows a modal continuation and its coalesced repaint to complete. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Sends one decoded keyboard event through the real JSVision event loop. */
function press(
  application: ReturnType<typeof createApplication>,
  key: string,
  modifiers: { alt?: boolean; shift?: boolean } = {},
): void {
  application.loop.dispatch({
    type: 'key',
    key,
    ctrl: false,
    alt: modifiers.alt ?? false,
    shift: modifiers.shift ?? false,
    ...(key.length === 1 ? { codepoint: key.codePointAt(0) } : {}),
  });
}

/** Types plain text into the currently focused JSVision input. */
function typeText(application: ReturnType<typeof createApplication>, value: string): void {
  for (const character of value) press(application, character);
}

describe('Who am I dialog', () => {
  it.each([
    ['enter', false],
    ['escape', true],
  ])('should show trusted identity and restore focus after %s', async (closingKey, insecure) => {
    // The read-only identity dialog shows only trusted session data, closes from OK or Escape, and restores prior focus.
    const { showWhoAmIDialog } = await import('../../src/admin/organization-dialogs.js');
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    const previousWindow = new Window('Previous');
    const previousFocus = new Button('Previous action');
    previousWindow.setLayout({ rect: { x: 1, y: 1, width: 24, height: 6 } });
    previousWindow.add(at(previousFocus, 1, 1, 18, 2));
    application.desktop.addWindow(previousWindow);
    application.loop.focusView(previousFocus);

    const dialog = showWhoAmIDialog(
      application,
      {
        kind: 'authenticated',
        server,
        identity: { sub: 'subject-1', name: 'Verified Admin', email: 'admin@example.test' },
        capabilities,
      },
      insecure,
    );
    await settle();
    const frame = frameText(application);

    expect(frame).toContain('https://porta.example.test');
    expect(frame).toContain('Authenticated');
    expect(frame).toContain('Verified Admin');
    expect(frame).toContain('admin@example.test');
    expect(frame.toLowerCase().includes('insecure tls')).toBe(insecure);

    press(application, closingKey);
    await dialog;
    expect(application.loop.getFocused()).toBe(previousFocus);
  });

  it('should replace untrusted identity values with fixed bounded fallbacks', async () => {
    // Identity controls or values beyond the trust bound never render their raw content or tail.
    const { showWhoAmIDialog } = await import('../../src/admin/organization-dialogs.js');
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    const hostileTail = 'RAW-TAIL-MUST-NOT-RENDER';
    const dialog = showWhoAmIDialog(
      application,
      {
        kind: 'authenticated',
        server,
        identity: {
          sub: 'subject-1',
          name: `Unsafe\u001b[2J${hostileTail}`,
          email: `${'x'.repeat(257)}${hostileTail}`,
        },
        capabilities,
      },
      false,
    );
    await settle();
    const frame = frameText(application);

    expect(frame).toContain('Verified administrator');
    expect(frame).toContain('Not provided');
    expect(frame).not.toContain(hostileTail);
    expect(frame).not.toContain('\u001b');
    expect(frame.length).toBeLessThanOrEqual(80 * 24 + 23);

    press(application, 'escape');
    await dialog;
  });
});

describe('organization chooser', () => {
  it('should show unavailable listing while keeping independently allowed actions reachable', async () => {
    // Without read capability no listing promise is supplied, while Cancel, Reauthenticate, and permitted Create remain usable.
    const { showOrganizationChooser } = await import('../../src/admin/organization-dialogs.js');
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    const chooser = showOrganizationChooser(application, {
      capabilities: { canReadOrganizations: false, canCreateOrganizations: true },
    });
    await settle();
    const frame = frameText(application);

    expect(frame).toContain('Organization listing unavailable');
    expect(frame).toContain('Cancel');
    expect(frame).toContain('Reauthenticate');
    expect(frame).toContain('Create');

    press(application, 'r', { alt: true });
    await expect(chooser).resolves.toEqual({ kind: 'reauthenticate' });
  });

  it('should show an empty list while keeping permitted creation reachable', async () => {
    // A successful empty response has a fixed empty-state message and still permits organization creation.
    const { showOrganizationChooser } = await import('../../src/admin/organization-dialogs.js');
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    const chooser = showOrganizationChooser(application, {
      capabilities,
      organizations: Promise.resolve({ kind: 'success', value: [] }),
    });
    await settle();

    expect(frameText(application)).toContain('No organizations available');
    expect(frameText(application)).toContain('Create');

    press(application, 'c', { alt: true });
    await expect(chooser).resolves.toEqual({ kind: 'create' });
  });

  it.each(['enter', ' '])('should return only the selected validated row after %s', async (key) => {
    // Every valid status is selectable in input order, and keyboard activation returns only the chosen projection.
    const { showOrganizationChooser } = await import('../../src/admin/organization-dialogs.js');
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    let resolved = false;
    const chooser = showOrganizationChooser(application, {
      capabilities,
      organizations: Promise.resolve({ kind: 'success', value: organizations }),
    }).then((result) => {
      resolved = true;
      return result;
    });
    await settle();
    const frame = frameText(application);

    const active = frame.indexOf('Crème 東京 (creme-tokyo) [active]');
    const suspended = frame.indexOf('Suspended Tenant (suspended-tenant) [suspended]');
    const archived = frame.indexOf('Archived Tenant (archived-tenant) [archived]');
    expect(active).toBeGreaterThanOrEqual(0);
    expect(suspended).toBeGreaterThan(active);
    expect(archived).toBeGreaterThan(suspended);

    press(application, 's', { alt: true });
    await settle();
    expect(resolved).toBe(false);

    press(application, 'down');
    press(application, key);
    await expect(chooser).resolves.toEqual({ kind: 'switch', organization: organizations[1] });
  });

  it('should retain Unicode while clipping long rows to the frame width', async () => {
    // Organization rows keep valid Unicode, remove controls, and clip by terminal display width without exposing a raw tail.
    const { showOrganizationChooser } = await import('../../src/admin/organization-dialogs.js');
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    const tail = 'RAW-ROW-TAIL-MUST-NOT-RENDER';
    const chooser = showOrganizationChooser(application, {
      capabilities,
      organizations: Promise.resolve({
        kind: 'success',
        value: [
          {
            ...organizations[0],
            name: `Crème 東京 ${'界'.repeat(100)}\u0000${tail}`,
          },
        ],
      }),
    });
    await settle();
    const frame = frameText(application);

    expect(frame).toContain('Crème 東京');
    expect(frame).not.toContain('\u0000');
    expect(frame).not.toContain(tail);
    expect(frame.length).toBeLessThanOrEqual(80 * 24 + 23);

    press(application, 'escape');
    await expect(chooser).resolves.toEqual({ kind: 'cancel' });
  });

  it('should keep disabled actions visible with fixed reasons and ignore activation', async () => {
    // Missing capabilities leave Create and Switch visible with fixed explanations but unable to activate.
    const { showOrganizationChooser } = await import('../../src/admin/organization-dialogs.js');
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    let resolved = false;
    const chooser = showOrganizationChooser(application, {
      capabilities: { canReadOrganizations: false, canCreateOrganizations: false },
    }).then((result) => {
      resolved = true;
      return result;
    });
    await settle();
    const frame = frameText(application);

    expect(frame).toMatch(/Create organization(?:…|\.\.\.) \(requires organization create\)/);
    expect(frame).toMatch(/Switch organization(?:…|\.\.\.) \(requires organization read\)/);
    press(application, 'c', { alt: true });
    press(application, 's', { alt: true });
    await settle();
    expect(resolved).toBe(false);

    press(application, 'escape');
    await expect(chooser).resolves.toEqual({ kind: 'cancel' });
  });
});

describe('create organization dialog', () => {
  it.each([
    ['an empty name', '', '', ''],
    ['a two-character slug', 'New Organization', 'ab', ''],
    ['a one-character locale', 'New Organization', '', 'n'],
  ])('should keep invalid input open for %s', async (_label, name, slug, locale) => {
    // Required and optional field bounds block submission while preserving the open form for correction.
    const { showCreateOrganizationDialog } =
      await import('../../src/admin/organization-dialogs.js');
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    let resolved = false;
    const dialog = showCreateOrganizationDialog(application).then((result) => {
      resolved = true;
      return result;
    });
    await settle();

    expect(frameText(application)).toContain('Name');
    expect(frameText(application)).toContain('Slug');
    expect(frameText(application)).toContain('Default locale');
    press(application, 'n', { alt: true });
    typeText(application, name);
    press(application, 's', { alt: true });
    typeText(application, slug);
    press(application, 'd', { alt: true });
    typeText(application, locale);
    press(application, 'c', { alt: true });
    await settle();
    expect(resolved).toBe(false);

    press(application, 'escape');
    await expect(dialog).resolves.toEqual({ kind: 'cancel' });
  });

  it.each([
    ['New Organization', '', '', { name: 'New Organization' }],
    [
      'New Organization',
      'new-organization',
      'nl',
      { name: 'New Organization', slug: 'new-organization', defaultLocale: 'nl' },
    ],
    [
      'N'.repeat(255),
      's'.repeat(100),
      'l'.repeat(10),
      { name: 'N'.repeat(255), slug: 's'.repeat(100), defaultLocale: 'l'.repeat(10) },
    ],
  ])('should return one bounded typed create input', async (name, slug, locale, expectedInput) => {
    // Valid fields produce one typed request, and empty optional values are omitted rather than forwarded.
    const { showCreateOrganizationDialog } =
      await import('../../src/admin/organization-dialogs.js');
    const application = createApplication({ viewport: { width: 80, height: 24 } });
    const dialog = showCreateOrganizationDialog(application);
    await settle();

    press(application, 'n', { alt: true });
    typeText(application, name);
    press(application, 's', { alt: true });
    typeText(application, slug);
    press(application, 'd', { alt: true });
    typeText(application, locale);
    press(application, 'c', { alt: true });

    await expect(dialog).resolves.toEqual({ kind: 'create', input: expectedInput });
  });
});
