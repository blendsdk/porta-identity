/**
 * Focused role checklist for the terminal user-invitation dialog.
 *
 * The checklist is a local selection surface: it never assigns roles itself.
 * It reads the existing application catalog and each application's roles, then
 * returns the checked options so the invitation can carry the exact pairs.
 */

import {
  Button,
  CheckGroup,
  col,
  Commands,
  cover,
  Dialog,
  fixed,
  grow,
  Scroller,
  signal,
  Text,
} from '@jsvision/ui';

import type {
  AdminApplication,
  AdminApplicationReadResult,
} from './application-state.js';
import type { AdminRbacReadResult, AdminRole } from './rbac-state.js';
import { actionRow, dialogSize, runDialog } from './user-dialog-support.js';
import type { AdminUserDialogHost } from './user-dialog-support.js';

/** One role option with the labels needed by the terminal checklist. */
export interface AdminInviteRoleOption {
  /** Internal application UUID. */
  readonly applicationId: string;
  /** Application display name used only for presentation. */
  readonly applicationName: string;
  /** Internal role UUID. */
  readonly roleId: string;
  /** Role display name. */
  readonly roleName: string;
  /** Immutable role slug. */
  readonly roleSlug: string;
}

/** Existing reads required to build the invitation role checklist. */
export interface AdminInviteRoleSource {
  /** Loads the complete readable application catalog. */
  listApplications(): Promise<AdminApplicationReadResult<readonly AdminApplication[]>>;
  /** Loads the roles owned by one application. */
  listRoles(
    applicationId: string,
    signal?: AbortSignal,
  ): Promise<AdminRbacReadResult<readonly AdminRole[]>>;
}

/** Result of the focused role checklist. */
export type InviteRoleDialogResult =
  | { readonly kind: 'done'; readonly roles: readonly AdminInviteRoleOption[] }
  | { readonly kind: 'cancel' };

/** Internal render state; the previous selection is kept separately. */
type RoleDialogState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly options: readonly AdminInviteRoleOption[] }
  | { readonly kind: 'failure' };

/** Builds one flat option list from the readable application and role catalog. */
function flattenCatalog(
  applications: readonly AdminApplication[],
  rolesByApplication: ReadonlyMap<string, readonly AdminRole[]>,
): readonly AdminInviteRoleOption[] {
  const options: AdminInviteRoleOption[] = [];
  for (const application of applications) {
    for (const role of rolesByApplication.get(application.id) ?? []) {
      options.push({
        applicationId: application.id,
        applicationName: application.name,
        roleId: role.id,
        roleName: role.name,
        roleSlug: role.slug,
      });
    }
  }
  return options;
}

/** Returns whether an option is already in the selected set. */
function isSelected(
  option: AdminInviteRoleOption,
  selected: readonly AdminInviteRoleOption[],
): boolean {
  return selected.some(
    (entry) =>
      entry.applicationId === option.applicationId && entry.roleId === option.roleId,
  );
}

/**
 * Show the invitation role checklist and return the checked options.
 *
 * The dialog opens immediately with a bounded loading state. A failed catalog
 * read leaves the previous selection untouched and does not block the caller
 * from sending an invitation without roles.
 *
 * @param host - Existing shell-owned modal host.
 * @param operationSignal - Aborts the dialog with the parent invitation form.
 * @param source - Existing application and role reads.
 * @param selected - Current invitation selection to restore.
 * @returns Checked options on Done, or cancellation.
 * @example const result = await showInviteRoleDialog(host, signal, source, []);
 */
export async function showInviteRoleDialog(
  host: AdminUserDialogHost,
  operationSignal: AbortSignal,
  source: AdminInviteRoleSource,
  selected: readonly AdminInviteRoleOption[],
): Promise<InviteRoleDialogResult> {
  const { width, height } = dialogSize(host, 72, 20);
  const dialog = new Dialog({ title: 'Invite roles', width, height, centered: true });
  let state: RoleDialogState = { kind: 'loading' };
  let choices = signal<boolean[]>([]);
  let generation = 0;
  let closed = false;

  /** Removes every rendered child before rebuilding the modal body. */
  const clear = (): void => {
    for (const child of [...dialog.children]) dialog.remove(child);
  };

  /** Returns the options currently checked by the operator. */
  const checked = (options: readonly AdminInviteRoleOption[]): readonly AdminInviteRoleOption[] => {
    const values = choices();
    return options.filter((_option, index) => values[index] === true);
  };

  /** Reads the complete catalog and publishes one bounded state. */
  const load = async (): Promise<void> => {
    const current = ++generation;
    state = { kind: 'loading' };
    render();
    const applications = await source.listApplications();
    if (closed || operationSignal.aborted || generation !== current) return;
    if (applications.kind !== 'success') {
      state = { kind: 'failure' };
      render();
      return;
    }
    const rolesByApplication = new Map<string, readonly AdminRole[]>();
    const results = await Promise.all(
      applications.value.map(async (application) => ({
        applicationId: application.id,
        result: await source.listRoles(application.id, operationSignal),
      })),
    );
    if (closed || operationSignal.aborted || generation !== current) return;
    for (const entry of results) {
      if (entry.result.kind !== 'success') {
        state = { kind: 'failure' };
        render();
        return;
      }
      rolesByApplication.set(entry.applicationId, entry.result.value);
    }
    const options = flattenCatalog(applications.value, rolesByApplication);
    choices = signal(options.map((option) => isSelected(option, selected)));
    state = { kind: 'ready', options };
    render();
  };

  /** Rebuilds the modal body for the current state. */
  const render = (): void => {
    if (closed) return;
    clear();
    if (state.kind === 'loading') {
      dialog.add(
        cover(
          col(
            { gap: 1, padding: 1 },
            fixed(new Text('Loading roles…'), 1),
            actionRow(new Button('Cancel', { command: Commands.cancel })),
          ),
        ),
      );
      return;
    }
    if (state.kind === 'failure') {
      dialog.add(
        cover(
          col(
            { gap: 1, padding: 1 },
            fixed(new Text('Role options unavailable'), 1),
            fixed(
              new Text('The invitation can still be sent without roles.'),
              1,
            ),
            actionRow(new Button('Reload', { onClick: () => void load() }), new Button('Done', { command: Commands.ok }), new Button('Cancel', { command: Commands.cancel })),
          ),
        ),
      );
      return;
    }
    if (state.options.length === 0) {
      dialog.add(
        cover(
          col(
            { gap: 1, padding: 1 },
            fixed(new Text('No roles available'), 1),
            actionRow(new Button('Done', { command: Commands.ok }), new Button('Cancel', { command: Commands.cancel })),
          ),
        ),
      );
      return;
    }
    const checklist = new CheckGroup({
      labels: state.options.map(
        (option) => `${option.applicationName} — ${option.roleName} (${option.roleSlug})`,
      ),
      value: choices,
    });
    const scroller = new Scroller({
      content: checklist,
      extent: { width: Math.max(1, width - 6), height: Math.max(1, height - 7) },
      scrollbars: 'vertical',
    });
    dialog.add(
      cover(
        col(
          { gap: 1, padding: 1 },
          fixed(new Text('Checked roles are assigned when the invitation is accepted.'), 1),
          grow(scroller),
          actionRow(
            new Button('Done', { command: Commands.ok }),
            new Button('Cancel', { command: Commands.cancel }),
          ),
        ),
      ),
    );
  };

  /** Reads the final state through a closure so TypeScript does not freeze the initial render. */
  const finish = (): InviteRoleDialogResult => {
    if (state.kind !== 'ready') return { kind: 'cancel' };
    return { kind: 'done', roles: checked(state.options) };
  };

  void load();
  try {
    const command = await runDialog(host, dialog, operationSignal);
    return command === Commands.ok ? finish() : { kind: 'cancel' };
  } finally {
    closed = true;
    generation += 1;
  }
}
