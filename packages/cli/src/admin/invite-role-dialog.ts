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
import type { CheckGroupOptions, Size2D, View } from '@jsvision/ui';

import type {
  AdminApplication,
  AdminApplicationReadResult,
} from './application-state.js';
import type { AdminRbacReadResult, AdminRole } from './rbac-state.js';
import { actionRow, dialogSize, runDialog } from './user-dialog-support.js';
import type { AdminUserDialogHost } from './user-dialog-support.js';

/** Check group that keeps the moved-to row visible inside its scroller. */
class RevealingCheckGroup extends CheckGroup {
  /** Creates a checklist whose selection movement reveals the selected row. */
  public constructor(
    options: CheckGroupOptions,
    private readonly reveal: (index: number) => void,
  ) {
    super(options);
  }

  /** Reveal the newly selected row after the base class updates its marker. */
  protected override movedTo(index: number): void {
    super.movedTo(index);
    this.reveal(index);
  }
}

/** Scroller that can reveal one checklist row without owning layout state elsewhere. */
class RoleChecklistScroller extends Scroller {
  /** Creates a viewport over the complete checklist extent. */
  public constructor(content: CheckGroup, extent: Size2D) {
    super({ content, extent, scrollbars: 'both' });
  }

  /** Scrolls only as far as needed to show one selected row. */
  public revealRow(index: number): void {
    if (this.vpH <= 0) return;
    const offset = this.dy.peek();
    if (index < offset) this.dy.set(index);
    else if (index + 1 > offset + this.vpH) {
      this.dy.set(Math.min(this.maxY, index + 1 - this.vpH));
    }
  }
}

/** One role option with the labels needed by the terminal checklist. */
export interface AdminInviteRoleOption {
  /** Internal application UUID. */
  readonly applicationId: string;
  /** Application display name used only for presentation. */
  readonly applicationName: string;
  /** Immutable application slug used to disambiguate equal display names. */
  readonly applicationSlug: string;
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

/** Replaces invisible formatting and accelerator markers in one untrusted label. */
function safeLabel(value: string): string {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    const invisible =
      code === 0x061c ||
      code === 0xfeff ||
      (code >= 0x200b && code <= 0x200f) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069);
    if (invisible) return '\ufffd';
    return character === '~' ? '\u02dc' : character;
  }).join('');
}

/** Builds one flat option list from the readable application and role catalog. */
function flattenCatalog(
  applications: readonly AdminApplication[],
  rolesByApplication: ReadonlyMap<string, readonly AdminRole[]>,
): readonly AdminInviteRoleOption[] {
  const options: AdminInviteRoleOption[] = [];
  for (const application of applications) {
    for (const role of rolesByApplication.get(application.id) ?? []) {
      if (application.slug === 'porta-admin' && role.slug === 'porta-invite-service') continue;
      options.push({
        applicationId: application.id,
        applicationName: application.name,
        applicationSlug: application.slug,
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

  /** Focuses one target when the current render is mounted. */
  const focusSoon = (view: View): void => {
    view.onMount(() => {
      if (!closed && !operationSignal.aborted) host.loop.focusView(view);
    });
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
    try {
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
    } catch {
      if (closed || operationSignal.aborted || generation !== current) return;
      state = { kind: 'failure' };
      render();
    }
  };

  /** Rebuilds the modal body for the current state. */
  const render = (): void => {
    if (closed) return;
    clear();
    if (state.kind === 'loading') {
      const cancel = new Button('Cancel', { command: Commands.cancel });
      dialog.add(
        cover(
          col(
            { gap: 1, padding: 1 },
            fixed(new Text('Loading roles…'), 1),
            actionRow(cancel),
          ),
        ),
      );
      focusSoon(cancel);
      return;
    }
    if (state.kind === 'failure') {
      const reload = new Button('Reload', { onClick: () => void load() });
      dialog.add(
        cover(
          col(
            { gap: 1, padding: 1 },
            fixed(new Text('Role options unavailable'), 1),
            fixed(new Text('Your current role selection is unchanged.'), 1),
            actionRow(
              reload,
              new Button('Done', { command: Commands.ok }),
              new Button('Cancel', { command: Commands.cancel }),
            ),
          ),
        ),
      );
      focusSoon(reload);
      return;
    }
    if (state.options.length === 0) {
      const done = new Button('Done', { command: Commands.ok });
      dialog.add(
        cover(
          col(
            { gap: 1, padding: 1 },
            fixed(new Text('No roles available'), 1),
            actionRow(done, new Button('Cancel', { command: Commands.cancel })),
          ),
        ),
      );
      focusSoon(done);
      return;
    }
    const labels = state.options.map(
      (option) =>
        `${safeLabel(option.applicationName)} (${safeLabel(option.applicationSlug)}) — ` +
        `${safeLabel(option.roleName)} (${safeLabel(option.roleSlug)})`,
    );
    const scrollerRef: { current?: RoleChecklistScroller } = {};
    const checklist = new RevealingCheckGroup(
      { labels, value: choices },
      (index) => scrollerRef.current?.revealRow(index),
    );
    const scroller = new RoleChecklistScroller(checklist, {
      width: Math.max(...labels.map((label) => label.length), 1) + 6,
      height: labels.length,
    });
    scrollerRef.current = scroller;
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
    focusSoon(checklist);
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
