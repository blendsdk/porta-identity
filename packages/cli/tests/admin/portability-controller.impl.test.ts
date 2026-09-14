/** Focused implementation tests for terminal portability controller edges. */

import { createApplication, Group } from '@jsvision/ui';
import { PortaAuthenticationError } from '@portaidentity/sdk';
import type { PortabilityManifest, PortabilityPreviewResult } from '@portaidentity/sdk';
import { describe, expect, it, vi } from 'vitest';

import {
  createAdminPortabilityController,
  PORTABILITY_COMMAND,
} from '../../src/admin/portability-controller.js';
import type { AdminPortabilityOperations } from '../../src/admin/portability-service.js';
import type { AdminPortabilityIntent } from '../../src/admin/portability-state.js';
import type { AdminPortabilityWorkspaceOptions } from '../../src/admin/portability-workspace.js';
import { validateAdminCapabilities } from '../../src/admin/session-service.js';
import type { AdminConnectionState } from '../../src/admin/state.js';

const server = new URL('https://porta.example.test');
const organization = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Example Organization',
  slug: 'example-organization',
  status: 'active' as const,
};
const manifest = {
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
} as const satisfies PortabilityManifest;
const emptyCounts = { created: 0, updated: 0, skipped: 0, rejected: 0 } as const;
const preview = {
  mode: 'dry-run',
  summary: {
    organizations: emptyCounts,
    applications: emptyCounts,
    application_modules: emptyCounts,
    roles: emptyCounts,
    permissions: emptyCounts,
    claim_definitions: emptyCounts,
    role_permission_mappings: emptyCounts,
    users: emptyCounts,
    user_role_assignments: emptyCounts,
    user_claim_values: emptyCounts,
    clients: emptyCounts,
  },
  items: [],
  errors: [],
} as const satisfies PortabilityPreviewResult;

/** Produces one authenticated state from the same validated claims used in production. */
function authenticated(permissions: readonly string[]): AdminConnectionState {
  return {
    kind: 'authenticated',
    server,
    identity: { sub: 'administrator' },
    organization,
    capabilities: validateAdminCapabilities(['porta-super-admin'], permissions),
  };
}

/** Allows async controller continuations to settle without adding timer behavior. */
async function settle(rounds = 12): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

/** Creates a direct controller harness with observable external boundaries. */
function harness(
  options: {
    readonly state?: AdminConnectionState;
    readonly operations?: AdminPortabilityOperations;
    readonly chooseManifest?: () => Promise<string | null | undefined>;
    readonly confirmApply?: () => Promise<boolean>;
    readonly readApplications?: () => Promise<
      | {
          readonly kind: 'success';
          readonly value: readonly {
            readonly id: string;
            readonly name: string;
            readonly slug: string;
            readonly description: string | null;
            readonly status: 'active';
            readonly createdAt: string;
            readonly updatedAt: string;
          }[];
        }
      | { readonly kind: 'failure'; readonly failure: 'unavailable' }
    >;
  } = {},
) {
  let currentState =
    options.state ?? authenticated(['admin:export:read', 'admin:import:write', 'admin:app:read']);
  let intent: ((value: AdminPortabilityIntent) => void) | undefined;
  let workspaceOptions: AdminPortabilityWorkspaceOptions | undefined;
  const states: unknown[] = [];
  const mounted: unknown[] = [];
  const requestAuthentication = vi.fn();
  const operations: AdminPortabilityOperations = options.operations ?? {
    exportManifest: vi.fn().mockResolvedValue({ manifest, filename: 'porta-manifest.json' }),
    preview: vi.fn().mockResolvedValue(preview),
    apply: vi.fn(),
  };
  const readApplications = options.readApplications;
  const application = createApplication({ viewport: { width: 80, height: 24 } });
  const controller = createAdminPortabilityController({
    host: application,
    readState: () => currentState,
    readOperations: () => operations,
    ...(readApplications
      ? { readApplicationOperations: () => ({ listAll: readApplications }) }
      : {}),
    mountWorkspace: (content) => mounted.push(content),
    workspaceFactory: (workspace) => {
      workspaceOptions = workspace;
      intent = workspace.onIntent;
      return {
        content: new Group(),
        setState: (state) => states.push(state),
        focusCurrent: vi.fn(),
      };
    },
    requestAuthentication,
    dialogs: {
      chooseManifest: options.chooseManifest ?? vi.fn().mockResolvedValue(undefined),
      saveManifest: vi.fn().mockResolvedValue(undefined),
      confirmApply: options.confirmApply ?? vi.fn().mockResolvedValue(true),
      showOneTimeClientSecret: vi.fn().mockResolvedValue(undefined),
    },
    files: {
      readUtf8: vi.fn().mockResolvedValue(JSON.stringify(manifest)),
      writeUtf8: vi.fn(),
    },
  });
  controller.syncContext(currentState, 1);
  return {
    controller,
    getIntent: () => intent,
    getWorkspaceOptions: () => workspaceOptions,
    mounted,
    operations,
    requestAuthentication,
    setState: (state: AdminConnectionState) => {
      currentState = state;
    },
    states,
  };
}

describe('admin portability controller implementation', () => {
  it('should consume its command without opening when no portability permission exists', async () => {
    const mounted = harness({ state: authenticated([]) });

    expect(mounted.controller.handleCommand('another-command')).toBe(false);
    expect(mounted.controller.handleCommand(PORTABILITY_COMMAND)).toBe(true);
    await settle();
    expect(mounted.mounted).toEqual([]);
  });

  it('should load the optional application catalog before mounting the workspace', async () => {
    const application = {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Orders',
      slug: 'orders',
      description: null,
      status: 'active' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const listAll = vi.fn().mockResolvedValue({ kind: 'success' as const, value: [application] });
    const mounted = harness({ readApplications: listAll });

    mounted.controller.handleCommand(PORTABILITY_COMMAND);
    await settle();

    expect(listAll).toHaveBeenCalledOnce();
    expect(mounted.getWorkspaceOptions()?.applications).toEqual([application]);
    expect(mounted.mounted).toHaveLength(1);
  });

  it('should close and request authentication after a final SDK authentication failure', async () => {
    const exportManifest = vi
      .fn()
      .mockRejectedValue(new PortaAuthenticationError({ secret: 'must-not-enter-view-state' }));
    const mounted = harness({
      operations: {
        exportManifest,
        preview: vi.fn(),
        apply: vi.fn(),
      },
    });
    mounted.controller.handleCommand(PORTABILITY_COMMAND);
    await settle();

    mounted.getIntent()?.({
      kind: 'export',
      request: {
        scope: manifest.scope,
        categories: manifest.categories,
        application_selection: manifest.application_selection,
      },
    });
    await settle();

    expect(exportManifest).toHaveBeenCalledOnce();
    expect(mounted.mounted.at(-1)).toBeNull();
    expect(mounted.requestAuthentication).toHaveBeenCalledOnce();
    expect(JSON.stringify(mounted.states)).not.toContain('must-not-enter-view-state');
  });

  it('should not apply when the operator declines the confirmation', async () => {
    const apply = vi.fn();
    const mounted = harness({
      operations: {
        exportManifest: vi.fn(),
        preview: vi.fn().mockResolvedValue(preview),
        apply,
      },
      chooseManifest: vi.fn().mockResolvedValue('/imports/porta-manifest.json'),
      confirmApply: vi.fn().mockResolvedValue(false),
    });
    mounted.controller.handleCommand(PORTABILITY_COMMAND);
    await settle();
    mounted.getIntent()?.({ kind: 'choose-manifest' });
    await settle();
    mounted.getIntent()?.({ kind: 'preview' });
    await settle();
    mounted.getIntent()?.({ kind: 'apply' });
    await settle();

    expect(apply).not.toHaveBeenCalled();
    expect(mounted.controller.isOpen()).toBe(true);
  });
});
