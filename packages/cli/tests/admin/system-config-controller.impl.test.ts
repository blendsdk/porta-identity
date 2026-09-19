/** Failure and teardown coverage using the real configuration controller and terminal host. */
import { Button, createApplication } from '@jsvision/ui';
import type { View } from '@jsvision/ui';
import type { ConfigEntry } from '@portaidentity/sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  createAdminSystemConfigController,
  SYSTEM_CONFIG_COMMAND,
} from '../../src/admin/system-config-controller.js';
import { validateAdminCapabilities } from '../../src/admin/session-service.js';
import type { AdminConnectionState } from '../../src/admin/state.js';
import type {
  AdminConfigMutationResult,
  AdminConfigReadResult,
} from '../../src/admin/system-config-service.js';

const entry: ConfigEntry = {
  key: 'magic_link_ttl',
  label: 'Magic-link lifetime',
  description: 'New link lifetime.',
  group: 'lifetimes',
  value: 900,
  defaultValue: 900,
  valueType: 'integer',
  unit: 'seconds',
  minimum: 60,
  maximum: 3600,
  applicationMode: 'runtime',
  updatedAt: '2026-09-17T00:00:00Z',
};

/** Settles promise continuations without introducing timers or retry behavior. */
async function settle(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

/** Exercises real workspace mounting; only remote operations and human confirmation are mocked. */
function harness() {
  const application = createApplication({ viewport: { width: 120, height: 45 } });
  const landing = new Button('Landing');
  application.desktop.add(landing);
  application.loop.focusView(landing);
  const state: AdminConnectionState = {
    kind: 'authenticated',
    server: new URL('https://porta.example.test'),
    identity: { sub: 'admin' },
    capabilities: validateAdminCapabilities([], ['admin:config:read', 'admin:config:update']),
  };
  const listConfig = vi
    .fn<() => Promise<AdminConfigReadResult>>()
    .mockResolvedValue({ kind: 'success', value: [entry] });
  const setConfigMany = vi
    .fn<() => Promise<AdminConfigMutationResult>>()
    .mockResolvedValue({ kind: 'success', restartRequired: false });
  const confirmDiscard = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
  const requestAuthentication = vi.fn();
  let mounted: View | null = null;
  const controller = createAdminSystemConfigController({
    host: application,
    readState: () => state,
    readOperations: () => ({ listConfig, setConfigMany }),
    requestAuthentication,
    dialogs: { confirmDiscard },
    mountWorkspace(content) {
      if (mounted) application.desktop.remove(mounted);
      mounted = content;
      if (content) application.desktop.add(content);
    },
  });
  controller.syncContext(state, 1);
  /** Reads rendered status without prescribing the internal widget tree. */
  const text = (): string =>
    application.loop.renderRoot
      .buffer()
      .rows()
      .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
      .join('\n');
  return {
    controller,
    listConfig,
    setConfigMany,
    confirmDiscard,
    requestAuthentication,
    text,
    /** Opens and settles one authoritative read. */
    async open() {
      controller.handleCommand(SYSTEM_CONFIG_COMMAND);
      await settle();
    },
    /** Prepares one valid native change. */
    edit() {
      controller.handleIntent({ kind: 'set-draft', key: 'magic_link_ttl', text: '1200' });
    },
  };
}

describe('configuration controller failures', () => {
  it('should fail safely on an unexpected load throw', async () => {
    const fixture = harness();
    fixture.listConfig.mockRejectedValueOnce(new Error('private infrastructure details'));
    await fixture.open();
    expect(fixture.text()).not.toContain('private');
    expect(fixture.listConfig).toHaveBeenCalledOnce();
    expect(fixture.controller.isOpen()).toBe(true);
    fixture.controller.close();
    await settle();
    expect(fixture.controller.isOpen()).toBe(false);
  });

  it.each(['failure', 'session-invalid'] as const)(
    'should handle confirmed mutation %s without reload or replay',
    async (kind) => {
      const fixture = harness();
      await fixture.open();
      fixture.edit();
      fixture.setConfigMany.mockResolvedValueOnce(
        kind === 'failure' ? { kind, failure: 'validation' } : { kind },
      );
      fixture.controller.handleIntent({ kind: 'save' });
      await settle();
      expect(fixture.setConfigMany).toHaveBeenCalledOnce();
      expect(fixture.listConfig).toHaveBeenCalledOnce();
      expect(fixture.controller.isOpen()).toBe(kind === 'failure');
      if (kind === 'session-invalid') expect(fixture.requestAuthentication).toHaveBeenCalledOnce();
      else {
        fixture.controller.close();
        await settle();
        expect(fixture.confirmDiscard).toHaveBeenCalledOnce();
      }
      fixture.controller.dispose();
    },
  );

  it.each(['success', 'failure', 'throw'] as const)(
    'should reload once after unknown mutation and retain drafts when reload is %s',
    async (reload) => {
      const fixture = harness();
      await fixture.open();
      fixture.edit();
      fixture.setConfigMany.mockResolvedValueOnce({ kind: 'outcome-unknown' });
      if (reload === 'success')
        fixture.listConfig.mockResolvedValueOnce({ kind: 'success', value: [entry] });
      else if (reload === 'failure')
        fixture.listConfig.mockResolvedValueOnce({ kind: 'failure', failure: 'unavailable' });
      else fixture.listConfig.mockRejectedValueOnce(new Error('private network details'));
      fixture.controller.handleIntent({ kind: 'save' });
      await settle();
      expect(fixture.setConfigMany).toHaveBeenCalledOnce();
      expect(fixture.listConfig).toHaveBeenCalledTimes(2);
      expect(fixture.text()).not.toContain('private');
      fixture.controller.close();
      await settle();
      expect(fixture.confirmDiscard).toHaveBeenCalledOnce();
      expect(fixture.controller.isOpen()).toBe(true);
      fixture.controller.dispose();
    },
  );

  it('should release the workspace when authoritative reload rejects the session', async () => {
    const fixture = harness();
    await fixture.open();
    fixture.edit();
    fixture.listConfig.mockResolvedValueOnce({ kind: 'session-invalid' });
    fixture.controller.handleIntent({ kind: 'save' });
    await settle();
    expect(fixture.controller.isOpen()).toBe(false);
    expect(fixture.requestAuthentication).toHaveBeenCalledOnce();
    expect(fixture.setConfigMany).toHaveBeenCalledOnce();
  });

  it('should ignore a mutation result arriving after local ownership is released', async () => {
    const fixture = harness();
    await fixture.open();
    fixture.edit();
    let resolve: ((result: AdminConfigMutationResult) => void) | undefined;
    fixture.setConfigMany.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    fixture.controller.handleIntent({ kind: 'save' });
    await settle();
    fixture.controller.cancelActiveOperation();
    resolve?.({ kind: 'success', restartRequired: true });
    await settle();
    expect(fixture.controller.isOpen()).toBe(false);
    expect(fixture.listConfig).toHaveBeenCalledOnce();
    expect(fixture.controller.handleCommand('unrelated')).toBe(false);
    fixture.controller.dispose();
    expect(fixture.controller.handleCommand(SYSTEM_CONFIG_COMMAND)).toBe(false);
  });

  it('should preserve dirty edits when confirmation unexpectedly fails', async () => {
    const fixture = harness();
    await fixture.open();
    fixture.edit();
    fixture.confirmDiscard.mockRejectedValueOnce(new Error('private confirmation details'));
    fixture.controller.close();
    await settle();
    expect(fixture.controller.isOpen()).toBe(true);
    expect(fixture.text()).not.toContain('private');
    fixture.controller.handleIntent({ kind: 'save' });
    await settle();
    expect(fixture.setConfigMany).toHaveBeenCalledOnce();
    fixture.controller.dispose();
  });
});
