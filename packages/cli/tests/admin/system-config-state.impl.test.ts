/** Boundary and failure-path coverage for native configuration response and draft handling. */
import {
  PortaAuthenticationError,
  PortaForbiddenError,
  PortaValidationError,
} from '@portaidentity/sdk';
import type { ConfigEntry } from '@portaidentity/sdk';
import { createApplication } from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';
import {
  ADMIN_CONFIG_KEYS,
  createAdminSystemConfigOperations,
  validateAdminConfigEntries,
} from '../../src/admin/system-config-service.js';
import {
  formatAdminConfigDuration,
  parseAdminConfigDraft,
  projectAdminConfigDrafts,
  setAdminConfigDraft,
} from '../../src/admin/system-config-state.js';
import type { AdminSystemConfigReadyState } from '../../src/admin/system-config-state.js';
import {
  createAdminSystemConfigWorkspace,
  SYSTEM_CONFIG_MINIMUM_SIZE,
} from '../../src/admin/system-config-workspace.js';

describe('fitting configuration help geometry', () => {
  it.each([
    ['31535999', '31535999 seconds'],
    ['', 'Invalid value'],
  ])(
    'should display complete startup guidance for draft %j at the fitting minimum',
    async (draft, explanation) => {
      const host = createApplication({ viewport: SYSTEM_CONFIG_MINIMUM_SIZE });
      const refresh: ConfigEntry = {
        key: 'refresh_token_ttl',
        label: 'Refresh token lifetime',
        description: 'New token lifetime.',
        group: 'lifetimes',
        value: 2592000,
        defaultValue: 2592000,
        valueType: 'integer',
        unit: 'seconds',
        minimum: 300,
        maximum: 31536000,
        applicationMode: 'restart-required',
        updatedAt: '2026-09-17T00:00:00Z',
      };
      const workspace = createAdminSystemConfigWorkspace({
        capabilities: { canReadConfig: true, canUpdateConfig: true },
        onIntent: () => undefined,
      });
      workspace.setState({
        kind: 'ready',
        entries: [refresh],
        drafts: { refresh_token_ttl: draft },
      });
      host.desktop.add(workspace.content);
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
      const text = host.loop.renderRoot
        .buffer()
        .rows()
        .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
        .join('\n');
      expect(text).toContain(`seconds · 300–31536000 · ${explanation} · Restart required`);
      workspace.clear();
      host.loop.dispose();
    },
  );
});

/** Constructs valid metadata without duplicating the server's per-key policy catalog. */
function catalog(): ConfigEntry[] {
  return ADMIN_CONFIG_KEYS.map((key): ConfigEntry =>
    key === 'default_locale'
      ? {
          key,
          label: 'Locale',
          description: 'Language selection.',
          group: 'general',
          value: 'en',
          defaultValue: 'en',
          valueType: 'string',
          unit: 'locale',
          allowedValues: ['en'],
          applicationMode: 'runtime',
          updatedAt: '2026-09-17T00:00:00Z',
        }
      : {
          key,
          label: 'Operational policy',
          description: 'Native integer policy.',
          group: 'lifetimes',
          value: 900,
          defaultValue: 900,
          valueType: 'integer',
          unit: 'seconds',
          minimum: 60,
          maximum: 3600,
          applicationMode: 'runtime',
          updatedAt: '2026-09-17T00:00:00Z',
        },
  );
}

describe('configuration response validation', () => {
  it('should order and freeze complete responses without retaining mutable metadata', () => {
    const input = catalog().reverse();
    const result = validateAdminConfigEntries(input);
    expect(result?.map((entry) => entry.key)).toEqual(ADMIN_CONFIG_KEYS);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result?.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(result?.at(-1)?.allowedValues)).toBe(true);
    input[0]!.label = 'Changed externally';
    expect(result?.at(-1)?.label).toBe('Locale');
  });

  it.each([
    ['missing', catalog().slice(1)],
    ['duplicate', [...catalog().slice(1), catalog()[1]]],
    ['unknown key', catalog().map((entry, index) => (index ? entry : { ...entry, key: 'secret' }))],
    [
      'string integer',
      catalog().map((entry, index) => (index ? entry : { ...entry, value: '900' })),
    ],
    ['fraction', catalog().map((entry, index) => (index ? entry : { ...entry, value: 900.5 }))],
    [
      'unsafe integer',
      catalog().map((entry, index) =>
        index ? entry : { ...entry, maximum: Number.MAX_SAFE_INTEGER + 1 },
      ),
    ],
    ['out of range', catalog().map((entry, index) => (index ? entry : { ...entry, value: 59 }))],
    [
      'invalid default',
      catalog().map((entry, index) => (index ? entry : { ...entry, defaultValue: 3601 })),
    ],
    [
      'reversed bounds',
      catalog().map((entry, index) => (index ? entry : { ...entry, minimum: 4000 })),
    ],
    [
      'terminal controls',
      catalog().map((entry, index) => (index ? entry : { ...entry, label: '\u001b[31m' })),
    ],
    [
      'oversized description',
      catalog().map((entry, index) => (index ? entry : { ...entry, description: 'x'.repeat(513) })),
    ],
    [
      'invalid timestamp',
      catalog().map((entry, index) => (index ? entry : { ...entry, updatedAt: 'invalid' })),
    ],
    [
      'unknown group',
      catalog().map((entry, index) => (index ? entry : { ...entry, group: 'secrets' })),
    ],
    [
      'unknown mode',
      catalog().map((entry, index) => (index ? entry : { ...entry, applicationMode: 'automatic' })),
    ],
    [
      'unsupported locale',
      catalog().map((entry) =>
        entry.key === 'default_locale'
          ? { ...entry, value: 'fr', allowedValues: ['en', 'fr'] }
          : entry,
      ),
    ],
  ])('should reject the entire %s response', (_reason, input) => {
    expect(validateAdminConfigEntries(input)).toBeUndefined();
  });

  it.each([
    [new PortaAuthenticationError({ secret: 'private' }), { kind: 'session-invalid' }],
    [new PortaForbiddenError({ secret: 'private' }), { kind: 'failure', failure: 'unauthorized' }],
    [new Error('private connection details'), { kind: 'failure', failure: 'unavailable' }],
  ])('should map read errors to fixed safe results', async (error, expected) => {
    const list = vi.fn().mockRejectedValue(error);
    const operations = createAdminSystemConfigOperations(() => ({ list, setMany: vi.fn() }));
    expect(await operations.listConfig()).toEqual(expected);
    expect(list).toHaveBeenCalledOnce();
  });

  it('should reject empty and non-native batches before contacting the SDK', async () => {
    const setMany = vi.fn();
    const operations = createAdminSystemConfigOperations(() => ({ list: vi.fn(), setMany }));
    for (const values of [{}, { magic_link_ttl: NaN }, { magic_link_ttl: 1.5 }]) {
      expect(await operations.setConfigMany(values)).toEqual({
        kind: 'failure',
        failure: 'validation',
      });
    }
    expect(setMany).not.toHaveBeenCalled();
  });

  it.each([
    [new PortaAuthenticationError(), { kind: 'session-invalid' }],
    [new PortaForbiddenError(), { kind: 'failure', failure: 'unauthorized' }],
    [new PortaValidationError(), { kind: 'failure', failure: 'validation' }],
    [new Error('private transport details'), { kind: 'outcome-unknown' }],
  ])('should classify mutation errors without retry or remote details', async (error, expected) => {
    const setMany = vi.fn().mockRejectedValue(error);
    const operations = createAdminSystemConfigOperations(() => ({ list: vi.fn(), setMany }));
    expect(await operations.setConfigMany({ magic_link_ttl: 1200 })).toEqual(expected);
    expect(setMany).toHaveBeenCalledOnce();
  });

  it.each([
    null,
    { data: [], restartRequired: false },
    { data: [{ ...catalog()[5], value: 1201 }], restartRequired: false },
    { data: [{ ...catalog()[0], value: 1200 }], restartRequired: false },
    { data: [{ ...catalog()[5], value: 1200 }], restartRequired: 'false' },
  ])('should treat invalid mutation readback as unknown without replaying', async (response) => {
    const setMany = vi.fn().mockResolvedValue(response);
    const operations = createAdminSystemConfigOperations(() => ({ list: vi.fn(), setMany }));
    expect(await operations.setConfigMany({ magic_link_ttl: 1200 })).toEqual({
      kind: 'outcome-unknown',
    });
    expect(setMany).toHaveBeenCalledOnce();
  });

  it('should accept exact native batch readback', async () => {
    const setMany = vi
      .fn()
      .mockResolvedValue({ data: [{ ...catalog()[5], value: 1200 }], restartRequired: false });
    const operations = createAdminSystemConfigOperations(() => ({ list: vi.fn(), setMany }));
    expect(await operations.setConfigMany({ magic_link_ttl: 1200 })).toEqual({
      kind: 'success',
      restartRequired: false,
    });
  });
});

describe('native draft projections', () => {
  it.each(['', ' ', '900.5', '9e2', '0x384', '900\n', '59', '3601', '9007199254740992'])(
    'should preserve but reject invalid numeric text %j',
    (text) => {
      const state: AdminSystemConfigReadyState = { kind: 'ready', entries: catalog() };
      const changed = setAdminConfigDraft(state, 'magic_link_ttl', text);
      expect(changed.drafts?.magic_link_ttl).toBe(text);
      expect(projectAdminConfigDrafts(changed, true)).toMatchObject({
        valid: false,
        canSave: false,
        values: {},
      });
      expect(state.drafts).toBeUndefined();
    },
  );

  it.each(['900', '+900', '00900'])('should keep equivalent native numbers clean', (text) => {
    const state: AdminSystemConfigReadyState = {
      kind: 'ready',
      entries: catalog(),
      drafts: { magic_link_ttl: text },
    };
    expect(projectAdminConfigDrafts(state, true)).toMatchObject({
      dirtyKeys: [],
      valid: true,
      canSave: false,
    });
  });

  it('should retain other edits and block changes or saves while busy or unauthorized', () => {
    const state: AdminSystemConfigReadyState = { kind: 'ready', entries: catalog() };
    const first = setAdminConfigDraft(state, 'magic_link_ttl', '1200');
    const second = setAdminConfigDraft(first, 'password_reset_ttl', '1800');
    expect(projectAdminConfigDrafts(second, true).values).toEqual({
      magic_link_ttl: 1200,
      password_reset_ttl: 1800,
    });
    expect(projectAdminConfigDrafts(second, false).canSave).toBe(false);
    const busy = { ...second, busy: true };
    expect(setAdminConfigDraft(busy, 'magic_link_ttl', '1500')).toBe(busy);
    expect(projectAdminConfigDrafts(busy, true).canSave).toBe(false);
    expect(Object.isFrozen(second.drafts)).toBe(true);
  });

  it('should require an exact allowed locale', () => {
    const locale = catalog().at(-1)!;
    expect(parseAdminConfigDraft(locale, 'en')).toBe('en');
    expect(parseAdminConfigDraft(locale, ' en ')).toBeUndefined();
    expect(parseAdminConfigDraft(locale, 'EN')).toBeUndefined();
  });

  it.each([
    [1, '1 second'],
    [120, '2 minutes'],
    [7200, '2 hours'],
    [172800, '2 days'],
    [3661, '3661 seconds'],
  ])('should render %i seconds exactly', (value, expected) => {
    expect(formatAdminConfigDuration(value)).toBe(expected);
  });
});
