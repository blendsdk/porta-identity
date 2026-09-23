/** Observable authorization and lifecycle specifications for global configuration administration. */

import type { ConfigEntry, ConfigKey } from '@portaidentity/sdk';
import { Button, createApplication, Dialog, Group, View } from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import { runAdminApplication } from '../../src/admin/application.js';
import { ADMIN_COMMANDS } from '../../src/admin/presentation.js';
import { validateAdminCapabilities } from '../../src/admin/session-service.js';

const server = new URL('https://porta.example.test');

/** Human labels belong to the API contract rather than terminal-specific key formatting. */
const labels: Readonly<Record<ConfigKey, string>> = {
  access_token_ttl: 'Access token lifetime',
  id_token_ttl: 'ID token lifetime',
  refresh_token_ttl: 'Refresh token lifetime',
  authorization_code_ttl: 'Authorization code lifetime',
  session_ttl: 'Session lifetime',
  magic_link_ttl: 'Magic-link lifetime',
  password_reset_ttl: 'Password-reset lifetime',
  invitation_ttl: 'Invitation lifetime',
  rate_limit_login_max: 'Login attempt limit',
  rate_limit_login_window: 'Login window',
  rate_limit_magic_link_max: 'Magic-link request limit',
  rate_limit_magic_link_window: 'Magic-link request window',
  rate_limit_password_reset_max: 'Password-reset request limit',
  rate_limit_password_reset_window: 'Password-reset request window',
  max_failed_logins: 'Failed login limit',
  lockout_duration_seconds: 'Lockout duration',
  audit_retention_days: 'Audit retention',
  default_locale: 'Default locale',
};

/** Independent native catalog data returned by the external configuration operation. */
const integerRows: readonly [ConfigKey, ConfigEntry['group'], number, number, number][] = [
  ['access_token_ttl', 'lifetimes', 3600, 60, 86400],
  ['id_token_ttl', 'lifetimes', 3600, 60, 86400],
  ['refresh_token_ttl', 'lifetimes', 2592000, 300, 31536000],
  ['authorization_code_ttl', 'lifetimes', 600, 30, 3600],
  ['session_ttl', 'lifetimes', 86400, 300, 2592000],
  ['magic_link_ttl', 'lifetimes', 900, 60, 3600],
  ['password_reset_ttl', 'lifetimes', 3600, 300, 86400],
  ['invitation_ttl', 'lifetimes', 604800, 300, 2592000],
  ['rate_limit_login_max', 'rate-limits', 10, 1, 100],
  ['rate_limit_login_window', 'rate-limits', 900, 60, 86400],
  ['rate_limit_magic_link_max', 'rate-limits', 5, 1, 100],
  ['rate_limit_magic_link_window', 'rate-limits', 900, 60, 86400],
  ['rate_limit_password_reset_max', 'rate-limits', 5, 1, 100],
  ['rate_limit_password_reset_window', 'rate-limits', 900, 60, 86400],
  ['max_failed_logins', 'lockout', 5, 1, 100],
  ['lockout_duration_seconds', 'lockout', 900, 60, 604800],
  ['audit_retention_days', 'general', 90, 1, 3650],
];
const entries: readonly ConfigEntry[] = [
  ...integerRows.map(([key, group, value, minimum, maximum], index): ConfigEntry => ({
    key,
    group,
    value,
    minimum,
    maximum,
    label: labels[key],
    description: 'Operational configuration value.',
    defaultValue: value,
    valueType: 'integer',
    unit:
      key === 'audit_retention_days'
        ? 'days'
        : key.endsWith('_max') || key === 'max_failed_logins'
          ? 'attempts'
          : 'seconds',
    applicationMode: index < 5 ? 'restart-required' : 'runtime',
    updatedAt: '2026-09-16T00:00:00Z',
  })),
  {
    key: 'default_locale',
    group: 'general',
    label: 'Default locale',
    description: 'Default display language.',
    value: 'en',
    defaultValue: 'en',
    valueType: 'string',
    unit: 'locale',
    allowedValues: ['en'],
    applicationMode: 'runtime',
    updatedAt: '2026-09-16T00:00:00Z',
  },
];

/** Direct controller intents deliberately exclude implementation-owned state types. */
type Intent = { kind: 'set-draft'; key: ConfigKey; text: string } | { kind: 'save' | 'close' };

/** Public lifecycle seam shared by the shell and the configuration workspace. */
interface Controller {
  /** Updates verified session ownership and releases a workspace belonging to an older session. */
  syncContext(state: unknown, epoch: number): void;
  /** Routes the public configuration command when it is available. */
  handleCommand(command: string): boolean;
  /** Accepts direct form editing, saving and closure intents. */
  handleIntent(intent: Intent): void;
  /** Reports whether this controller currently owns a workspace. */
  isOpen(): boolean;
  /** Releases local ownership and prevents late operation results from repainting it. */
  dispose(): void;
}

/** Loads the proposed direct controller without importing its future implementation types. */
async function createController(options: Record<string, unknown>): Promise<Controller> {
  const module = (await import('../../src/admin/system-config-controller.js')) as {
    /** Constructs the single feature controller using established shell boundaries. */
    createAdminSystemConfigController(options: Record<string, unknown>): Controller;
  };
  return module.createAdminSystemConfigController(options);
}

/** Finds the public command while leaving its private string representation unspecified. */
function configCommand(): string {
  const command = (ADMIN_COMMANDS as Partial<Record<'systemConfig', string>>).systemConfig;
  if (!command) throw new Error('System Configuration command missing.');
  return command;
}

/** Creates a verified identity without requiring a selected organization for this global feature. */
function authenticated(canReadConfig = true, canUpdateConfig = true, subject = 'administrator') {
  return {
    kind: 'authenticated' as const,
    server,
    identity: { sub: subject },
    capabilities: { canReadConfig, canUpdateConfig },
  };
}

/** Flushes controller promises and the real host's coalesced focus updates. */
async function settle(): Promise<void> {
  for (let index = 0; index < 16; index += 1) await Promise.resolve();
}

/** Reads visible text from the real terminal renderer, not a mocked workspace projection. */
function frameText(application: ReturnType<typeof createApplication>): string {
  return application.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Sends a decoded key through the same event loop used by the interactive shell. */
function press(application: ReturnType<typeof createApplication>, key: string): void {
  application.loop.dispatch({ type: 'key', key, ctrl: false, alt: false, shift: false });
}

/** Finds the real persistent Save button without prescribing the workspace's internal tree shape. */
function saveButton(root: View): Button {
  const match = findSaveButton(root);
  if (!match) throw new Error('Save button missing.');
  return match;
}

/** Searches child groups while keeping a missing branch distinct from a missing workspace footer. */
function findSaveButton(root: View): Button | undefined {
  if (root instanceof Button && root.activation.label === 'Save') return root;
  if (root instanceof Group) {
    for (const child of root.children) {
      const match = findSaveButton(child);
      if (match) return match;
    }
  }
  return undefined;
}

/** Finds the mounted editor independently of the persistent menu caption. */
function configurationDialog(root: View): Dialog | undefined {
  if (root instanceof Dialog && root.title() === 'System Configuration') return root;
  if (root instanceof Group) {
    for (const child of root.children) {
      const match = configurationDialog(child);
      if (match) return match;
    }
  }
  return undefined;
}

/** Mocks only the external configuration operations at the shell's established service boundary. */
function operations() {
  return {
    listConfig: vi.fn().mockResolvedValue({ kind: 'success', value: entries }),
    setConfigMany: vi.fn().mockResolvedValue({ kind: 'success', restartRequired: false }),
  };
}

/** Mounts the actual controller workspace on a real host with an observable landing focus target. */
async function harness(pendingRead?: Promise<unknown>, readOnly = false) {
  let state: Record<string, unknown> = authenticated(true, !readOnly);
  const application = createApplication({ viewport: { width: 120, height: 45 } });
  const landing = new Button('Landing');
  application.desktop.add(landing);
  application.loop.focusView(landing);
  const config = operations();
  if (pendingRead) config.listConfig.mockReturnValueOnce(pendingRead);
  const confirmDiscard = vi.fn().mockResolvedValue(false);
  const mounts: Array<View | null> = [];
  let mounted: View | null = null;
  const controller = await createController({
    host: application,
    readState: () => state,
    readOperations: () => config,
    mountWorkspace: (content: View | null) => {
      if (mounted) application.desktop.remove(mounted);
      mounted = content;
      mounts.push(content);
      if (content) application.desktop.add(content);
      else application.loop.focusView(landing);
    },
    dialogs: { confirmDiscard },
  });
  controller.syncContext(state, 1);
  controller.handleCommand(configCommand());
  await settle();
  return {
    application,
    controller,
    config,
    confirmDiscard,
    landing,
    mounts,
    /** Delivers a verified session transition through the same public seam as the shell. */
    replaceState(next: Record<string, unknown>, epoch = 2) {
      state = next;
      controller.syncContext(next, epoch);
    },
  };
}

describe('system configuration live capabilities', () => {
  // Exact live permission claims remain independent; update never implies read.
  it.each([
    [[], [], false, false],
    [[], ['admin:config:read'], true, false],
    [[], ['admin:config:update'], false, true],
    [[], ['admin:config:read', 'admin:config:update'], true, true],
    [[], ['admin:config:read-extra', 'admin:config:*'], false, false],
    [['porta-admin-extra'], [], false, false],
    [['porta-admin'], undefined, true, true],
    [['porta-admin'], { malformed: true }, true, true],
  ])(
    'should derive config authority from roles %j and permissions %j',
    (roles, permissions, read, update) => {
      expect(validateAdminCapabilities(roles, permissions)).toMatchObject({
        canReadConfig: read,
        canUpdateConfig: update,
      });
    },
  );
});

describe('system configuration shell navigation', () => {
  // The global top-level command requires both live read authority and an operation provider.
  it.each(['unauthenticated', 'no read', 'no operations', 'read only'] as const)(
    'should gate the top-level command for %s',
    async (scenario) => {
      const config = operations();
      await runAdminApplication({
        server,
        insecure: false,
        viewport: { width: 120, height: 45 },
        initialState:
          scenario === 'unauthenticated'
            ? { kind: 'unauthenticated', server }
            : authenticated(scenario !== 'no read', false),
        session: scenario === 'no operations' ? {} : { systemConfig: config },
        applicationFactory: createApplication,
        applicationRunner: async (application: ReturnType<typeof createApplication>) => {
          press(application, 'f10');
          await settle();
          expect(frameText(application)).toMatch(/System Configuration(?:…|\.\.\.)/);
          press(application, 'escape');
          application.loop.emitCommand(configCommand());
          await settle();
          if (scenario === 'read only') {
            expect(config.listConfig).toHaveBeenCalledOnce();
            expect(frameText(application)).toContain('System Configuration');
            press(application, 'escape');
          } else {
            expect(config.listConfig).not.toHaveBeenCalled();
          }
          return 0;
        },
      } as never);
    },
  );

  // Clean closure releases the mounted workspace and restores the shell's prior focus.
  it('should mount one workspace and restore focus after clean close', async () => {
    const config = operations();
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 120, height: 45 },
      initialState: authenticated(),
      session: { systemConfig: config },
      applicationFactory: createApplication,
      applicationRunner: async (application: ReturnType<typeof createApplication>) => {
        const landing = application.loop.getFocused();
        application.loop.emitCommand(configCommand());
        await settle();
        expect(configurationDialog(application.desktop)).toBeDefined();
        application.loop.emitCommand(configCommand());
        await settle();
        expect(config.listConfig).toHaveBeenCalledOnce();
        press(application, 'escape');
        await settle();
        expect(configurationDialog(application.desktop)).toBeUndefined();
        expect(application.loop.getFocused()).toBe(landing);
        return 0;
      },
    } as never);
  });

  // Another shell modal owns input until closed; direct command injection must not bypass it.
  it('should not open configuration while an identity modal owns the shell', async () => {
    const config = operations();
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 120, height: 45 },
      initialState: authenticated(),
      session: { systemConfig: config },
      applicationFactory: createApplication,
      applicationRunner: async (application: ReturnType<typeof createApplication>) => {
        application.loop.emitCommand(ADMIN_COMMANDS.whoAmI);
        await settle();
        application.loop.emitCommand(configCommand());
        await settle();
        expect(config.listConfig).not.toHaveBeenCalled();
        press(application, 'escape');
        await settle();
        application.loop.emitCommand(configCommand());
        await settle();
        expect(config.listConfig).toHaveBeenCalledOnce();
        press(application, 'escape');
        return 0;
      },
    } as never);
  });

  // Opening another feature already owns the workspace slot; config cannot replace its drafts.
  it('should not replace another open feature workspace', async () => {
    const config = operations();
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 120, height: 45 },
      initialState: {
        ...authenticated(),
        capabilities: {
          canReadConfig: true,
          canUpdateConfig: true,
          canExportData: true,
          canImportData: true,
          isSuperAdmin: false,
        },
      },
      session: {
        systemConfig: config,
        portability: { exportManifest: vi.fn(), preview: vi.fn(), apply: vi.fn() },
      },
      applicationFactory: createApplication,
      applicationRunner: async (application: ReturnType<typeof createApplication>) => {
        application.loop.emitCommand(ADMIN_COMMANDS.portability);
        await settle();
        expect(frameText(application)).toContain('Import / Export');
        application.loop.emitCommand(configCommand());
        await settle();
        expect(config.listConfig).not.toHaveBeenCalled();
        expect(frameText(application)).toContain('Import / Export');
        press(application, 'escape');
        return 0;
      },
    } as never);
  });
});

describe('system configuration workspace ownership', () => {
  // Dirty cancellation uses one ordinary discard decision; keeping changes never closes the workspace.
  it('should close clean directly and require confirmation to discard dirty drafts', async () => {
    const mounted = await harness();
    mounted.controller.handleIntent({ kind: 'close' });
    await settle();
    expect(mounted.confirmDiscard).not.toHaveBeenCalled();
    expect(mounted.controller.isOpen()).toBe(false);
    expect(mounted.application.loop.getFocused()).toBe(mounted.landing);
    mounted.controller.handleCommand(configCommand());
    await settle();
    mounted.controller.handleIntent({ kind: 'set-draft', key: 'magic_link_ttl', text: '1200' });
    mounted.controller.handleIntent({ kind: 'close' });
    await settle();
    expect(mounted.confirmDiscard).toHaveBeenCalledOnce();
    expect(mounted.controller.isOpen()).toBe(true);
    expect(mounted.mounts.at(-1)).not.toBeNull();
    mounted.confirmDiscard.mockResolvedValueOnce(true);
    mounted.controller.handleIntent({ kind: 'close' });
    await settle();
    expect(mounted.confirmDiscard).toHaveBeenCalledTimes(2);
    expect(mounted.controller.isOpen()).toBe(false);
    expect(mounted.mounts.at(-1)).toBeNull();
    mounted.controller.dispose();
  });

  // Read-only users can inspect values but even a forged save intent cannot issue a mutation.
  it('should keep the workspace readable without update authority', async () => {
    const mounted = await harness(undefined, true);
    expect(mounted.controller.isOpen()).toBe(true);
    expect(frameText(mounted.application)).toContain('System Configuration');
    mounted.controller.handleIntent({ kind: 'set-draft', key: 'magic_link_ttl', text: '1200' });
    mounted.controller.handleIntent({ kind: 'save' });
    await settle();
    const workspace = mounted.mounts.at(-1);
    if (!workspace) throw new Error('Readable workspace missing.');
    expect(saveButton(workspace).state.disabled).toBe(true);
    expect(mounted.config.setConfigMany).not.toHaveBeenCalled();
    mounted.controller.dispose();
  });

  // Logout, replacement login and teardown release local ownership; late reads cannot remount it.
  it.each(['logout', 'replacement session', 'dispose'] as const)(
    'should release the workspace without stale remount after %s',
    async (transition) => {
      let complete: ((value: unknown) => void) | undefined;
      const pending = new Promise<unknown>((resolve) => {
        complete = resolve;
      });
      const mounted = await harness(pending);
      if (transition === 'logout') mounted.replaceState({ kind: 'unauthenticated', server });
      else if (transition === 'replacement session')
        mounted.replaceState(authenticated(true, true, 'replacement'));
      else mounted.controller.dispose();
      await settle();
      expect(mounted.controller.isOpen()).toBe(false);
      expect(mounted.mounts.at(-1)).toBeNull();
      expect(mounted.application.loop.getFocused()).toBe(mounted.landing);
      const mountsAfterRelease = [...mounted.mounts];
      if (!complete) throw new Error('Read completion missing.');
      complete({ kind: 'success', value: entries });
      await settle();
      expect(mounted.mounts).toEqual(mountsAfterRelease);
      expect(mounted.controller.isOpen()).toBe(false);
      expect(mounted.config.listConfig).toHaveBeenCalledOnce();
      expect(mounted.config.setConfigMany).not.toHaveBeenCalled();
      mounted.controller.dispose();
    },
  );
});
