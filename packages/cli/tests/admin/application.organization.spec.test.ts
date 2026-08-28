/**
 * Organization workflow specifications for the embedded terminal administration application.
 */

import { createApplication } from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

import { runAdminApplication } from '../../src/admin/application.js';
import { ADMIN_COMMANDS } from '../../src/admin/presentation.js';
import type { AdminConnectionState } from '../../src/admin/state.js';

const server = new URL('https://PORTA.example.test:443/');
const verifiedIdentity = {
  sub: 'subject-1',
  email: 'admin@example.test',
  name: 'Verified Admin',
};
const noOrganizationCapabilities = {
  canReadOrganizations: false,
  canCreateOrganizations: false,
};
const allOrganizationCapabilities = {
  canReadOrganizations: true,
  canCreateOrganizations: true,
};
const selectedOrganization = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Selected Organization',
  slug: 'selected-organization',
  status: 'active' as const,
};

/** Reads visible characters from a real JSVision frame buffer. */
function frameText(application: ReturnType<typeof createApplication>): string {
  return application.loop.renderRoot
    .buffer()
    .rows()
    .map((row) => row.map((cell) => (cell.width === 0 ? '' : cell.char)).join(''))
    .join('\n');
}

/** Flushes a short chain of application and modal promise continuations. */
async function settleWorkflow(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

/** Sends one decoded keyboard event through the real JSVision loop. */
function press(
  application: ReturnType<typeof createApplication>,
  key: string,
  modifiers: { alt?: boolean } = {},
): void {
  application.loop.dispatch({
    type: 'key',
    key,
    ctrl: false,
    alt: modifiers.alt ?? false,
    shift: false,
    ...(key.length === 1 ? { codepoint: key.codePointAt(0) } : {}),
  });
}

/** Types plain text into the focused JSVision input. */
function typeText(application: ReturnType<typeof createApplication>, value: string): void {
  for (const character of value) press(application, character);
}

/** Creates an authenticated application state for one organization-workflow case. */
function authenticatedState(
  identity = verifiedIdentity,
  organization?: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly status: 'active' | 'suspended' | 'archived';
  },
  capabilities = noOrganizationCapabilities,
): AdminConnectionState {
  return {
    kind: 'authenticated',
    server,
    identity,
    capabilities,
    ...(organization ? { organization } : {}),
  };
}

describe('organization workflow ownership', () => {
  it('should avoid listing without read capability and release the chooser before reauthentication', async () => {
    // An unreadable organization list makes no request, while chooser reauthentication closes the modal before login starts.
    const listAll = vi.fn();
    let frameWhenReauthenticationStarts = '';
    let application: ReturnType<typeof createApplication> | undefined;

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: { kind: 'unauthenticated', server },
      session: {
        authenticate: vi.fn().mockResolvedValue(
          authenticatedState(verifiedIdentity, undefined, {
            canReadOrganizations: false,
            canCreateOrganizations: true,
          }),
        ),
        reauthenticate: vi.fn(async () => {
          if (application) frameWhenReauthenticationStarts = frameText(application);
          return undefined;
        }),
        organizations: { listAll, create: vi.fn(), reconcile: vi.fn() },
      },
      applicationFactory: createApplication,
      applicationRunner: async (runningApplication) => {
        application = runningApplication;
        runningApplication.loop.emitCommand(ADMIN_COMMANDS.authenticate);
        await settleWorkflow();

        expect(listAll).not.toHaveBeenCalled();
        expect(frameText(runningApplication)).toContain('Organization listing unavailable');
        press(runningApplication, 'r', { alt: true });
        await settleWorkflow();
        expect(frameWhenReauthenticationStarts).not.toContain('Organization listing unavailable');
        return 0;
      },
    });
  });

  it('should open initial choice only after authentication and leave one row unselected on cancel', async () => {
    // Successful authentication releases its owner before choice, and even one valid row is never selected automatically.
    const onlyOrganization = { ...selectedOrganization, name: 'Only Organization' };
    const listAll = vi.fn().mockResolvedValue({ kind: 'success', value: [onlyOrganization] });

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: { kind: 'unauthenticated', server },
      session: {
        authenticate: vi
          .fn()
          .mockResolvedValue(
            authenticatedState(verifiedIdentity, undefined, allOrganizationCapabilities),
          ),
        organizations: { listAll, create: vi.fn(), reconcile: vi.fn() },
      },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        application.loop.emitCommand(ADMIN_COMMANDS.authenticate);
        await settleWorkflow();

        expect(listAll).toHaveBeenCalledOnce();
        expect(frameText(application)).toContain('Only Organization');
        press(application, 'escape');
        await settleWorkflow();
        expect(frameText(application)).toContain('Choose or create an organization.');
        expect(frameText(application)).not.toContain('Only Organization');
        return 0;
      },
    });
  });

  it.each(['active', 'suspended', 'archived'] as const)(
    'should switch explicitly to a validated %s organization in memory',
    async (status) => {
      // Explicit keyboard selection accepts every valid lifecycle status and changes only the in-memory context.
      const replacement = {
        ...selectedOrganization,
        id: '22222222-2222-4222-8222-222222222222',
        name: `${status} Organization`,
        slug: `${status}-organization`,
        status,
      };
      const listAll = vi.fn().mockResolvedValue({ kind: 'success', value: [replacement] });

      await runAdminApplication({
        server,
        insecure: false,
        viewport: { width: 80, height: 24 },
        initialState: authenticatedState(
          verifiedIdentity,
          selectedOrganization,
          allOrganizationCapabilities,
        ),
        session: {
          organizations: { listAll, create: vi.fn(), reconcile: vi.fn() },
        },
        applicationFactory: createApplication,
        applicationRunner: async (application) => {
          application.loop.emitCommand(ADMIN_COMMANDS.switchOrganization);
          await settleWorkflow();
          press(application, 'enter');
          await settleWorkflow();

          const frame = frameText(application);
          expect(frame).toContain(`${status} Organization`);
          expect(frame).toContain(`${status}-organization`);
          expect(frame).toContain(status);
          expect(frame).toContain('https://porta.example.test');
          expect(listAll).toHaveBeenCalledOnce();
          return 0;
        },
      });
    },
  );

  it.each([
    ['cancel', { kind: 'success', value: [{ ...selectedOrganization, name: 'Other' }] }, ''],
    ['unavailable', { kind: 'failure', failure: 'unavailable' }, 'Service unavailable'],
    [
      'invalid response',
      { kind: 'failure', failure: 'invalid-response' },
      'Invalid server response',
    ],
  ])('should preserve selection after switch %s', async (_label, listResult, fixedMessage) => {
    // Cancellation and fixed list failures preserve the prior selection and expose no remote detail.
    const listAll = vi.fn().mockResolvedValue(listResult);

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticatedState(
        verifiedIdentity,
        selectedOrganization,
        allOrganizationCapabilities,
      ),
      session: { organizations: { listAll, create: vi.fn(), reconcile: vi.fn() } },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        application.loop.emitCommand(ADMIN_COMMANDS.switchOrganization);
        await settleWorkflow();
        if (fixedMessage) expect(frameText(application)).toContain(fixedMessage);
        press(application, 'escape');
        await settleWorkflow();

        expect(frameText(application)).toContain('Selected Organization');
        expect(listAll).toHaveBeenCalledOnce();
        return 0;
      },
    });
  });

  it('should dispatch one create while pending and auto-select its successful result', async () => {
    // One UI activation remains one service call even when the SDK internally handles a 401 replay, and success selects the result.
    let finishCreate: ((result: unknown) => void) | undefined;
    const created = {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Created Organization',
      slug: 'created-organization',
      status: 'active' as const,
    };
    const create = vi.fn(
      () =>
        new Promise((resolve) => {
          finishCreate = resolve;
        }),
    );

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticatedState(
        verifiedIdentity,
        selectedOrganization,
        allOrganizationCapabilities,
      ),
      session: {
        organizations: { listAll: vi.fn(), create, reconcile: vi.fn() },
      },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        application.loop.emitCommand(ADMIN_COMMANDS.createOrganization);
        await settleWorkflow();
        press(application, 'n', { alt: true });
        typeText(application, 'Created Organization');
        press(application, 'c', { alt: true });
        press(application, 'c', { alt: true });
        press(application, 'enter');
        await settleWorkflow();

        expect(create).toHaveBeenCalledOnce();
        expect(application.loop.isCommandEnabled(ADMIN_COMMANDS.createOrganization)).toBe(false);
        expect(application.loop.isCommandEnabled(ADMIN_COMMANDS.switchOrganization)).toBe(false);
        finishCreate?.({ kind: 'success', value: created });
        await settleWorkflow();
        expect(frameText(application)).toContain('Created Organization');
        expect(frameText(application)).toContain('created-organization');
        return 0;
      },
    });
  });

  it('should block an indeterminate create until a successful complete list reload', async () => {
    // An unavailable create is never retried automatically and must be unlocked by a successful list reload.
    const create = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'failure', failure: 'unavailable' })
      .mockResolvedValueOnce({
        kind: 'success',
        value: { ...selectedOrganization, name: 'Recovered Create' },
      });
    const listAll = vi.fn().mockResolvedValue({ kind: 'success', value: [selectedOrganization] });

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticatedState(
        verifiedIdentity,
        selectedOrganization,
        allOrganizationCapabilities,
      ),
      session: { organizations: { listAll, create, reconcile: vi.fn() } },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        const submit = async (): Promise<void> => {
          application.loop.emitCommand(ADMIN_COMMANDS.createOrganization);
          await settleWorkflow();
          press(application, 'n', { alt: true });
          typeText(application, 'Recovered Create');
          press(application, 'c', { alt: true });
          await settleWorkflow();
        };

        await submit();
        expect(create).toHaveBeenCalledOnce();
        application.loop.emitCommand(ADMIN_COMMANDS.createOrganization);
        await settleWorkflow();
        expect(create).toHaveBeenCalledOnce();

        application.loop.emitCommand(ADMIN_COMMANDS.switchOrganization);
        await settleWorkflow();
        press(application, 'escape');
        await settleWorkflow();
        await submit();
        expect(create).toHaveBeenCalledTimes(2);
        expect(frameText(application)).toContain('Recovered Create');
        return 0;
      },
    });
  });

  it('should preserve selection and block create after cancelling a dispatched request', async () => {
    // Cancelling after create dispatch invalidates that generation, preserves selection, and blocks another create until reload.
    let finishCreate: ((result: unknown) => void) | undefined;
    const create = vi.fn(
      () =>
        new Promise((resolve) => {
          finishCreate = resolve;
        }),
    );

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticatedState(
        verifiedIdentity,
        selectedOrganization,
        allOrganizationCapabilities,
      ),
      session: {
        organizations: { listAll: vi.fn(), create, reconcile: vi.fn() },
      },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        application.loop.emitCommand(ADMIN_COMMANDS.createOrganization);
        await settleWorkflow();
        press(application, 'n', { alt: true });
        typeText(application, 'Cancelled Create');
        press(application, 'c', { alt: true });
        await settleWorkflow();
        expect(create).toHaveBeenCalledOnce();

        press(application, 'escape');
        finishCreate?.({
          kind: 'success',
          value: { ...selectedOrganization, name: 'Late Created Organization' },
        });
        await settleWorkflow();

        expect(frameText(application)).toContain('Selected Organization');
        expect(frameText(application)).not.toContain('Late Created Organization');
        expect(application.loop.isCommandEnabled(ADMIN_COMMANDS.createOrganization)).toBe(false);
        return 0;
      },
    });
  });

  it.each([
    [
      'matching row',
      { kind: 'match', organization: { ...selectedOrganization, name: 'Refreshed Organization' } },
      'Refreshed Organization',
      false,
    ],
    ['absent row', { kind: 'absent' }, 'No organizations available', true],
    ['malformed matching row', { kind: 'matching-invalid' }, 'No organizations available', true],
    [
      'authoritative denial',
      { kind: 'failure', failure: 'unauthorized' },
      'No organizations available',
      true,
    ],
    [
      'transient failure',
      { kind: 'failure', failure: 'unavailable' },
      'Service unavailable',
      false,
    ],
    [
      'invalid unrelated response',
      { kind: 'failure', failure: 'invalid-response' },
      'Invalid server response',
      false,
    ],
  ])(
    'should reconcile a selected organization after reauthentication: %s',
    async (_label, reconciliation, expectedText, opensChoice) => {
      // Successful reauthentication refreshes, clears, or preserves selection according to the authoritative fixed outcome.
      const reconcile = vi.fn().mockResolvedValue(reconciliation);
      const listAll = vi.fn().mockResolvedValue({ kind: 'success', value: [] });
      const reauthenticate = vi
        .fn()
        .mockResolvedValue(
          authenticatedState(
            { sub: 'subject-2', name: 'Replacement Admin', email: 'new@example.test' },
            undefined,
            allOrganizationCapabilities,
          ),
        );

      await runAdminApplication({
        server,
        insecure: false,
        viewport: { width: 80, height: 24 },
        initialState: authenticatedState(
          verifiedIdentity,
          selectedOrganization,
          allOrganizationCapabilities,
        ),
        session: {
          reauthenticate,
          organizations: { listAll, create: vi.fn(), reconcile },
        },
        applicationFactory: createApplication,
        applicationRunner: async (application) => {
          application.loop.emitCommand(ADMIN_COMMANDS.reauthenticate);
          await settleWorkflow();

          expect(reconcile).toHaveBeenCalledWith(selectedOrganization.id);
          expect(frameText(application)).toContain(expectedText);
          if (opensChoice) expect(listAll).toHaveBeenCalledOnce();
          else if (reconciliation.kind !== 'match') {
            expect(frameText(application)).toContain('Selected Organization');
          }
          return 0;
        },
      });
    },
  );

  it.each([
    ['cancelled', undefined],
    ['failed', new Error('login unavailable')],
  ])(
    'should preserve identity and selection when reauthentication is %s',
    async (_label, outcome) => {
      // Cancelled or failed replacement login leaves the verified identity, capabilities, and selection unchanged.
      const reconcile = vi.fn();
      const reauthenticate =
        outcome instanceof Error
          ? vi.fn().mockRejectedValue(outcome)
          : vi.fn().mockResolvedValue(outcome);

      await runAdminApplication({
        server,
        insecure: false,
        viewport: { width: 80, height: 24 },
        initialState: authenticatedState(
          verifiedIdentity,
          selectedOrganization,
          allOrganizationCapabilities,
        ),
        session: {
          reauthenticate,
          organizations: { listAll: vi.fn(), create: vi.fn(), reconcile },
        },
        applicationFactory: createApplication,
        applicationRunner: async (application) => {
          application.loop.emitCommand(ADMIN_COMMANDS.reauthenticate);
          await settleWorkflow();

          expect(reconcile).not.toHaveBeenCalled();
          expect(frameText(application)).toContain('Selected Organization');
          return 0;
        },
      });
    },
  );

  it('should clear definite create recovery on final 401 and permit create after reauthentication', async () => {
    // A final organization 401 closes its modal, enters normal unauthenticated handling, and does not retain an indeterminate-create block.
    const created = { ...selectedOrganization, name: 'Created After Reauthentication' };
    const create = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'session-invalid' })
      .mockResolvedValueOnce({ kind: 'success', value: created });

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticatedState(verifiedIdentity, selectedOrganization, {
        canReadOrganizations: false,
        canCreateOrganizations: true,
      }),
      session: {
        authenticate: vi.fn().mockResolvedValue(
          authenticatedState(verifiedIdentity, undefined, {
            canReadOrganizations: false,
            canCreateOrganizations: true,
          }),
        ),
        organizations: { listAll: vi.fn(), create, reconcile: vi.fn() },
      },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        const submit = async (name: string): Promise<void> => {
          press(application, 'n', { alt: true });
          typeText(application, name);
          press(application, 'c', { alt: true });
          await settleWorkflow();
        };

        application.loop.emitCommand(ADMIN_COMMANDS.createOrganization);
        await settleWorkflow();
        await submit('First Attempt');
        expect(frameText(application)).toContain('Authenticate');

        application.loop.emitCommand(ADMIN_COMMANDS.authenticate);
        await settleWorkflow();
        expect(frameText(application)).toContain('Organization listing unavailable');
        press(application, 'c', { alt: true });
        await settleWorkflow();
        await submit('Created After Reauthentication');

        expect(create).toHaveBeenCalledTimes(2);
        expect(frameText(application)).toContain('Created After Reauthentication');
        return 0;
      },
    });
  });

  it('should close organization work on compact resize and quarantine its late result', async () => {
    // Crossing below the recoverable geometry closes the modal before resize guidance and rejects late list publication.
    let finishList: ((result: unknown) => void) | undefined;
    const listAll = vi.fn(
      () =>
        new Promise((resolve) => {
          finishList = resolve;
        }),
    );

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticatedState(
        verifiedIdentity,
        selectedOrganization,
        allOrganizationCapabilities,
      ),
      session: { organizations: { listAll, create: vi.fn(), reconcile: vi.fn() } },
      applicationFactory: createApplication,
      applicationRunner: async (application) => {
        application.loop.emitCommand(ADMIN_COMMANDS.switchOrganization);
        await settleWorkflow();
        expect(application.loop.isCommandEnabled(ADMIN_COMMANDS.createOrganization)).toBe(false);
        expect(application.loop.isCommandEnabled(ADMIN_COMMANDS.switchOrganization)).toBe(false);
        application.loop.resize({ width: 24, height: 6 });
        expect(frameText(application)).toMatch(/resize|larger terminal/i);

        finishList?.({
          kind: 'success',
          value: [{ ...selectedOrganization, name: 'Late Organization' }],
        });
        await settleWorkflow();
        expect(frameText(application)).not.toContain('Late Organization');
        expect(frameText(application)).toMatch(/resize|larger terminal/i);
        return 0;
      },
    });
  });

  it('should reject late organization mutation after quit and finalize once', async () => {
    // Quit invalidates pending organization work so its continuation cannot redraw after one final teardown.
    let finishList: ((result: unknown) => void) | undefined;
    const listAll = vi.fn(
      () =>
        new Promise((resolve) => {
          finishList = resolve;
        }),
    );
    const finalizer = vi.fn((application: ReturnType<typeof createApplication>) => {
      application.loop.dispose();
    });
    let disposedApplication: ReturnType<typeof createApplication> | undefined;

    await runAdminApplication({
      server,
      insecure: false,
      viewport: { width: 80, height: 24 },
      initialState: authenticatedState(
        verifiedIdentity,
        selectedOrganization,
        allOrganizationCapabilities,
      ),
      session: { organizations: { listAll, create: vi.fn(), reconcile: vi.fn() } },
      applicationFactory: createApplication,
      applicationFinalizer: finalizer,
      applicationRunner: async (application) => {
        disposedApplication = application;
        application.loop.emitCommand(ADMIN_COMMANDS.switchOrganization);
        await settleWorkflow();
        expect(listAll).toHaveBeenCalledOnce();
        application.loop.emitCommand('quit');
        return 0;
      },
    });

    finishList?.({
      kind: 'success',
      value: [{ ...selectedOrganization, name: 'Late Organization' }],
    });
    await settleWorkflow();
    expect(finalizer).toHaveBeenCalledOnce();
    expect(disposedApplication && frameText(disposedApplication)).not.toContain(
      'Late Organization',
    );
  });
});
