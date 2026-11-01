/** Server-advertised locale choices load, render and save without an English-only client catalog. */
import { ComboBox, createApplication, Dialog, Group, TabView, View } from '@jsvision/ui';
import type { ConfigKey } from '@portaidentity/sdk';
import { describe, expect, it, vi } from 'vitest';
import { createAdminSystemConfigController } from '../../src/admin/system-config-controller.js';
import {
  createAdminSystemConfigOperations,
  validateAdminConfigEntries,
} from '../../src/admin/system-config-service.js';
import { SYSTEM_CONFIG_MINIMUM_SIZE } from '../../src/admin/system-config-workspace.js';

/** Independent public configuration keys keep the regression oracle separate from the validator. */
const integerKeys: readonly ConfigKey[] = [
  'access_token_ttl',
  'id_token_ttl',
  'refresh_token_ttl',
  'authorization_code_ttl',
  'session_ttl',
  'magic_link_ttl',
  'password_reset_ttl',
  'invitation_ttl',
  'rate_limit_login_max',
  'rate_limit_login_window',
  'rate_limit_magic_link_max',
  'rate_limit_magic_link_window',
  'rate_limit_password_reset_max',
  'rate_limit_password_reset_window',
  'max_failed_logins',
  'lockout_duration_seconds',
  'audit_retention_days',
];

/** Builds independent authoritative metadata, including an untrusted locale entry for rejection cases. */
function catalog(locale: Readonly<Record<string, unknown>> = {}): unknown[] {
  return [
    ...integerKeys.map((key) => ({
      key,
      label: 'Operational setting',
      description: 'Native operational configuration.',
      group: 'general',
      applicationMode: 'runtime',
      updatedAt: '2026-11-01T00:00:00.000Z',
      valueType: 'integer',
      unit: 'seconds',
      value: 900,
      defaultValue: 900,
      minimum: 1,
      maximum: 3600,
    })),
    {
      key: 'default_locale',
      label: 'Default locale',
      description: 'Authentication display language.',
      group: 'general',
      applicationMode: 'runtime',
      updatedAt: '2026-11-01T00:00:00.000Z',
      valueType: 'string',
      unit: 'locale',
      allowedValues: ['en', 'nl'],
      value: 'en',
      defaultValue: 'en',
      ...locale,
    },
  ];
}

/** Finds real terminal controls without depending on the editor's private layout. */
function descendants(root: View): View[] {
  return [root, ...(root instanceof Group ? root.children.flatMap(descendants) : [])];
}

/** Settles direct service promises and the terminal's coalesced signal updates. */
async function settle(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

describe('server-owned configuration locale metadata', () => {
  // Both legacy English-only servers and multilingual servers provide authoritative choices.
  it.each([
    { allowedValues: ['en'], value: 'en', defaultValue: 'en' },
    { allowedValues: ['en', 'nl'], value: 'en', defaultValue: 'en' },
    { allowedValues: ['en', 'nl'], value: 'nl', defaultValue: 'en' },
    { allowedValues: ['en', 'nl'], value: 'en', defaultValue: 'nl' },
    { allowedValues: ['en', 'nl'], value: 'nl', defaultValue: 'nl' },
  ])('should load the complete catalog when locale metadata is %j', async (locale) => {
    const response = catalog(locale);
    const list = vi.fn().mockResolvedValue(response);
    const result = await createAdminSystemConfigOperations(() => ({
      list,
      setMany: vi.fn(),
    })).listConfig();
    expect(result).toEqual({ kind: 'success', value: response });
    expect(list).toHaveBeenCalledOnce();
  });

  // Invalid choices must never become trusted text or saveable values in the terminal.
  it.each([
    ['missing choices', { allowedValues: undefined }],
    ['empty choices', { allowedValues: [] }],
    ['null choices', { allowedValues: null }],
    ['non-array choices', { allowedValues: 'en,nl' }],
    ['non-string choice', { allowedValues: ['en', 42] }],
    ['empty choice', { allowedValues: ['en', ''] }],
    ['duplicate choices', { allowedValues: ['en', 'nl', 'nl'] }],
    ['terminal escape', { allowedValues: ['en', '\u001b[31m'] }],
    ['line break', { allowedValues: ['en', 'nl\n'] }],
    ['oversized choice', { allowedValues: ['en', 'x'.repeat(33)] }],
    ['unadvertised current locale', { value: 'fr' }],
    ['unadvertised default locale', { defaultValue: 'fr' }],
    ['non-string current locale', { value: 1 }],
    ['non-string default locale', { defaultValue: 1 }],
  ])('should reject the entire response when it contains %s', async (_reason, locale) => {
    const response = catalog(locale);
    expect(validateAdminConfigEntries(response)).toBeUndefined();
    const operations = createAdminSystemConfigOperations(() => ({
      list: vi.fn().mockResolvedValue(response),
      setMany: vi.fn(),
    }));
    expect(await operations.listConfig()).toEqual({ kind: 'failure', failure: 'invalid-response' });
  });

  // The real service, controller and ComboBox must carry Dutch through a single save and readback.
  it('should display both choices and save Dutch once before reloading the authoritative catalog', async () => {
    let response = catalog();
    const list = vi.fn(async () => response);
    const setMany = vi.fn(async (values: Readonly<Partial<Record<ConfigKey, number | string>>>) => {
      response = catalog({ value: values.default_locale });
      return { data: response.slice(-1), restartRequired: false };
    });
    const operations = createAdminSystemConfigOperations(() => ({ list, setMany }));
    const host = createApplication({ viewport: SYSTEM_CONFIG_MINIMUM_SIZE });
    const state = {
      kind: 'authenticated' as const,
      server: new URL('https://porta.example.test'),
      identity: { sub: 'administrator' },
      capabilities: { canReadConfig: true, canUpdateConfig: true },
    };
    let mounted: View | null = null;
    const controller = createAdminSystemConfigController({
      host,
      readState: () => state,
      readOperations: () => operations,
      mountWorkspace(content) {
        if (mounted) host.desktop.remove(mounted);
        mounted = content;
        if (content) host.desktop.add(content);
      },
    });
    try {
      controller.syncContext(state, 1);
      expect(controller.handleCommand('system-config')).toBe(true);
      await settle();
      const window = host.desktop.children.find((view) => view instanceof Dialog);
      if (!(window instanceof Dialog)) throw new Error('Configuration window missing.');
      const tabs = descendants(window).find((view) => view instanceof TabView);
      if (!(tabs instanceof TabView)) throw new Error('Configuration did not finish loading.');
      tabs.select(3);
      await settle();
      const combo = descendants(window).find((view) => view instanceof ComboBox);
      if (!(combo instanceof ComboBox)) throw new Error('Locale choices missing.');
      expect(combo.items.peek()).toEqual(['en', 'nl']);
      combo.value.set('nl');
      await settle();
      controller.handleIntent({ kind: 'save' });
      await settle();
      expect(setMany).toHaveBeenCalledExactlyOnceWith({ default_locale: 'nl' });
      expect(list).toHaveBeenCalledTimes(2);
      const locale = validateAdminConfigEntries(response)?.find(
        (entry) => entry.key === 'default_locale',
      );
      expect(locale).toMatchObject({ value: 'nl', allowedValues: ['en', 'nl'] });
      const reloaded = descendants(window).find((view) => view instanceof ComboBox);
      if (!(reloaded instanceof ComboBox)) throw new Error('Reloaded locale control missing.');
      expect(reloaded.value.peek()).toBe('nl');
    } finally {
      controller.dispose();
      host.loop.dispose();
    }
  });
});
