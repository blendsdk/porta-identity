/** Lifecycle specifications for portability work owned by the terminal administration shell. */

import { Button, createApplication, Group, View } from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import { runAdminApplication } from '../../src/admin/application.js';
import { ADMIN_COMMANDS } from '../../src/admin/presentation.js';

const server = new URL('https://porta.example.test');
const organization = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Example Organization',
  slug: 'example-organization',
  status: 'active' as const,
};
const capabilities = {
  canExportData: true,
  canImportData: true,
  isSuperAdmin: false,
};
const authenticated = {
  kind: 'authenticated' as const,
  server,
  identity: { sub: 'administrator' },
  organization,
  capabilities,
};
const manifest = Object.freeze({
  format: 'porta-portability',
  version: 1,
  scope: { kind: 'organization', organization_slug: organization.slug },
  categories: ['organizations'],
  application_selection: { all_applications: true, application_slugs: [] },
  organizations: [],
  applications: [],
  application_modules: [],
  roles: [],
  permissions: [],
  claim_definitions: [],
  role_permission_mappings: [],
  users: [],
  user_role_assignments: [],
  user_claim_values: [],
  clients: [],
});
const exportRequest = Object.freeze({
  scope: { kind: 'organization', organization_slug: organization.slug },
  categories: ['organizations'],
  application_selection: { all_applications: true, application_slugs: [] },
});
const preview = Object.freeze({
  mode: 'dry-run',
  summary: { organizations: { created: 1, updated: 0, skipped: 0, rejected: 0 } },
  items: [],
  errors: [],
});

type PortabilityIntent =
  | { readonly kind: 'export'; readonly request: typeof exportRequest }
  | { readonly kind: 'choose-manifest' }
  | { readonly kind: 'preview' }
  | { readonly kind: 'apply' }
  | { readonly kind: 'close' };

interface PortabilityController {
  syncContext(state: unknown, epoch: number): void;
  handleCommand(command: string): boolean;
  handleIntent(intent: PortabilityIntent): void;
  cancelActiveOperation(): void;
  dispose(): void;
}

interface PortabilityControllerExports {
  createAdminPortabilityController(options: Record<string, unknown>): PortabilityController;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

/** Loads the planned controller seam without importing implementation-owned state types. */
async function controllerExports(): Promise<PortabilityControllerExports> {
  return (await import('../../src/admin/portability-controller.js')) as PortabilityControllerExports;
}

/** Returns the direct portability command without prescribing its internal string. */
function portabilityCommand(): string {
  const command = (ADMIN_COMMANDS as Partial<Record<'portability', string>>).portability;
  if (!command) throw new Error('Import / Export command missing.');
  return command;
}

/** Creates an externally controlled promise for observing late operation completion. */
function deferred<T>(): Deferred<T> {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      if (!complete) throw new Error('Deferred operation was not initialized.');
      complete(value);
    },
  };
}

/** Allows controller continuations and coalesced JSVision focus work to settle. */
async function settle(rounds = 12): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

/** Reads all visible text from a real JSVision terminal frame. */
function frameText(application: ReturnType<typeof createApplication>): string {
  return application.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Builds a real-focus harness around the planned portability controller. */
async function harness(pendingOperation: 'export' | 'preview' | 'apply') {
  let state: Record<string, unknown> = authenticated;
  let intent: ((value: PortabilityIntent) => void) | undefined;
  let exportSignal: AbortSignal | undefined;
  let previewSignal: AbortSignal | undefined;
  let applySignal: AbortSignal | undefined;
  const pendingExport = deferred<unknown>();
  const pendingPreview = deferred<unknown>();
  const pendingApply = deferred<unknown>();
  const exportManifest = vi.fn((_request: unknown, signal: AbortSignal) => {
    exportSignal = signal;
    return pendingExport.promise;
  });
  const previewManifest = vi.fn((_value: unknown, signal: AbortSignal) => {
    if (pendingOperation !== 'preview') return Promise.resolve(preview);
    previewSignal = signal;
    return pendingPreview.promise;
  });
  const applyManifest = vi.fn((_value: unknown, _mode: unknown, signal: AbortSignal) => {
    applySignal = signal;
    return pendingApply.promise;
  });
  const operations = { exportManifest, preview: previewManifest, apply: applyManifest };
  const states: unknown[] = [];
  const workspace = {
    content: new Group(),
    setState: vi.fn((value: unknown) => states.push(value)),
    focusCurrent: vi.fn(),
  };
  const mounted: Array<View | null> = [];
  const application = createApplication({ viewport: { width: 80, height: 24 } });
  const landing = new Button('Organizations');
  application.desktop.add(landing);
  const controller = (await controllerExports()).createAdminPortabilityController({
    host: application,
    readState: () => state,
    readOperations: () => operations,
    mountWorkspace: (content: View | null) => {
      mounted.push(content);
      if (content === null) application.loop.focusView(landing);
    },
    workspaceFactory: (options: { onIntent(value: PortabilityIntent): void }) => {
      intent = options.onIntent;
      return workspace;
    },
    dialogs: {
      chooseManifest: vi.fn().mockResolvedValue('/imports/manifest.json'),
      saveManifest: vi.fn().mockResolvedValue(undefined),
      confirmApply: vi.fn().mockResolvedValue(true),
      showOneTimeClientSecret: vi.fn().mockResolvedValue(undefined),
    },
    files: {
      readUtf8: vi.fn().mockResolvedValue(JSON.stringify(manifest)),
      writeUtf8: vi.fn().mockResolvedValue(undefined),
    },
  });
  controller.syncContext(state, 1);
  controller.handleCommand(portabilityCommand());
  await settle();
  return {
    application,
    controller,
    getIntent: () => intent,
    landing,
    mounted,
    operations,
    pendingApply,
    pendingExport,
    pendingPreview,
    setState: (next: Record<string, unknown>) => {
      state = next;
    },
    signals: {
      apply: () => applySignal,
      export: () => exportSignal,
      preview: () => previewSignal,
    },
    states,
  };
}

/** Starts one pending operation after establishing any required import ownership. */
async function startPending(
  mounted: Awaited<ReturnType<typeof harness>>,
  operation: 'export' | 'preview' | 'apply',
): Promise<void> {
  if (operation === 'export') {
    mounted.getIntent()?.({ kind: 'export', request: exportRequest });
    await settle();
    return;
  }
  mounted.getIntent()?.({ kind: 'choose-manifest' });
  await settle();
  if (operation === 'preview') {
    mounted.getIntent()?.({ kind: 'preview' });
    await settle();
    return;
  }
  mounted.getIntent()?.({ kind: 'preview' });
  await settle();
  mounted.getIntent()?.({ kind: 'apply' });
  await settle();
}

describe('portability operation ownership', () => {
  it.each([
    ['export', 'workspace close', 'close'],
    ['preview', 'authenticated session change', 'session'],
    ['apply', 'local cancellation', 'cancel'],
  ] as const)(
    'should quarantine a late %s operation after %s',
    async (operation, _case, transition) => {
      // Closing, changing session, or cancelling releases only local ownership; a late server result cannot repaint or retry.
      const mounted = await harness(operation);
      await startPending(mounted, operation);
      const signal = mounted.signals[operation]();
      expect(signal).toBeInstanceOf(AbortSignal);

      if (transition === 'close') {
        mounted.getIntent()?.({ kind: 'close' });
      } else if (transition === 'session') {
        const replacement = {
          ...authenticated,
          identity: { sub: 'replacement-administrator' },
        };
        mounted.setState(replacement);
        mounted.controller.syncContext(replacement, 2);
      } else {
        mounted.controller.cancelActiveOperation();
      }
      await settle();

      expect(signal?.aborted).toBe(true);
      expect(mounted.mounted.at(-1)).toBeNull();
      expect(mounted.application.loop.getFocused()).toBe(mounted.landing);
      const stateAfterRelease = [...mounted.states];

      const lateResult = {
        mode: operation === 'apply' ? 'keep-existing' : 'dry-run',
        summary: { organizations: { created: 99, updated: 0, skipped: 0, rejected: 0 } },
        items: [],
        errors: [],
      };
      if (operation === 'export') {
        mounted.pendingExport.resolve({ manifest, filename: 'late.json' });
      } else if (operation === 'preview') {
        mounted.pendingPreview.resolve(lateResult);
      } else {
        mounted.pendingApply.resolve(lateResult);
      }
      await settle();

      expect(mounted.states).toEqual(stateAfterRelease);
      expect(
        mounted.operations[operation === 'export' ? 'exportManifest' : operation],
      ).toHaveBeenCalledOnce();
      expect(JSON.stringify(mounted.states)).not.toMatch(
        /apply[^}]*cancelled|cancelled[^}]*apply/i,
      );
      expect(frameText(mounted.application)).not.toMatch(/server apply.*cancelled/i);
    },
  );
});

describe('portability controller application integration', () => {
  // The authenticated application routes one command to one workspace and restores focus after ordinary closure.
  it('should mount and close portability work through the application lifecycle', async () => {
    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticated,
      session: {
        portability: {
          exportManifest: vi.fn(),
          preview: vi.fn(),
          apply: vi.fn(),
        },
      },
      applicationFactory: createApplication,
      applicationRunner: async (application: ReturnType<typeof createApplication>) => {
        application.loop.emitCommand(portabilityCommand());
        await settle();

        expect(frameText(application)).toContain('Import / Export');
        application.loop.dispatch({
          type: 'key',
          key: 'escape',
          ctrl: false,
          alt: false,
          shift: false,
        });
        await settle();
        expect(frameText(application)).not.toContain('Import / Export');
        expect(application.loop.getFocused()?.focusable).toBe(true);
        return 0;
      },
    } as never);
  });
});
