/** Focused editor for OIDC redirect URIs, logout redirects, and browser origins. */

import type { UpdateClientInput } from '@portaidentity/sdk';
import {
  Button,
  col,
  ComboBox,
  Commands,
  cover,
  DataGrid,
  Dialog,
  fixed,
  grow,
  GroupBox,
  Input,
  Label,
  row,
  signal,
  spacer,
  Text,
} from '@jsvision/ui';
import type { Column, EventLoop, ModalDialogHost, Signal } from '@jsvision/ui';

import { runAbortableAdminDialog } from './application-runtime.js';
import type { AdminClient } from './client-state.js';
import type { AdminOrganizationContext } from './state.js';
import { textValidator } from './user-dialog-fields.js';

/** Modal host needed for abort-driven authentication-editor closure. */
export interface ClientAuthenticationDialogHost extends ModalDialogHost {
  /** Event loop that can synchronously close an owned modal. */
  readonly loop: ModalDialogHost['loop'] & Pick<EventLoop, 'endModal'>;
}

/** Result returned by the focused authentication editor. */
export type ClientAuthenticationDialogResult =
  | { readonly kind: 'update'; readonly clientId: string; readonly input: UpdateClientInput }
  | { readonly kind: 'cancel' };

/** Closed collection choices shown by the editor. */
type CollectionKind = 'redirects' | 'logoutRedirects' | 'origins';

/** Display metadata for one collection choice. */
interface CollectionChoice {
  /** Stable internal collection discriminator. */
  readonly kind: CollectionKind;
  /** Human-readable selector label. */
  readonly label: string;
}

/** One editable row in the reused DataGrid. */
interface CollectionRow {
  /** Stable local row key. */
  readonly id: string;
  /** Exact URI or origin value. */
  readonly value: string;
}

/** Parent-local staged collections that are returned together on Save. */
interface AuthenticationCollections {
  /** Required authorization redirect URIs. */
  readonly redirects: Signal<CollectionRow[]>;
  /** Optional post-logout redirect URIs. */
  readonly logoutRedirects: Signal<CollectionRow[]>;
  /** Optional allowed browser origins. */
  readonly origins: Signal<CollectionRow[]>;
}

const COLLECTION_CHOICES: readonly CollectionChoice[] = [
  { kind: 'redirects', label: 'Redirect URIs' },
  { kind: 'logoutRedirects', label: 'Post-logout redirect URIs' },
  { kind: 'origins', label: 'Allowed origins' },
];

const COLLECTION_COLUMNS: Column<CollectionRow>[] = [
  { title: 'Value', accessor: (entry) => entry.value, width: '1fr', minWidth: 20 },
];

/** DataGrid that writes complete replacements into the currently selected staged collection. */
class AuthenticationCollectionGrid extends DataGrid<CollectionRow> {
  /** Creates the reused grid over its visible-row signal. */
  constructor(
    private readonly visibleRows: Signal<CollectionRow[]>,
    focused: Signal<number>,
    selected: Signal<number>,
    private readonly replaceActiveRows: (rows: CollectionRow[]) => void,
    onSelect: (index: number, row: CollectionRow) => void,
  ) {
    super({
      rows: visibleRows,
      focused,
      selected,
      columns: COLLECTION_COLUMNS,
      zebra: true,
      onSelect,
    });
  }

  /** Replaces the active collection while retaining one grid instance across selector changes. */
  setRows(rows: CollectionRow[]): void {
    this.replaceActiveRows([...rows]);
  }

  /** Returns a snapshot of the active staged collection for diagnostics and behavior tests. */
  getRows(): readonly CollectionRow[] {
    return [...this.visibleRows.peek()];
  }
}

/** Fixed full-page surface with validation shared by buttons and keyboard submission. */
class ClientAuthenticationDialog extends Dialog {
  /** Creates a non-movable, non-resizable editor that will be maximized after mounting. */
  constructor(
    width: number,
    height: number,
    private readonly collections: AuthenticationCollections,
    private readonly valueInput: Input,
  ) {
    super({ title: 'OIDC client authentication', width, height, centered: true });
    this.closable = false;
    this.movable = false;
    this.resizable = false;
    this.zoomable = false;
  }

  /** Prevents invalid hidden collections from being submitted through any command route. */
  valid(command: string): boolean {
    if (command === Commands.cancel) return true;
    if (!collectionsAreValid(this.collections)) {
      this.firstInvalid = this.valueInput;
      return false;
    }
    return super.valid(command);
  }
}

/** Returns rows for immutable strings without mutating the source client. */
function collectionRows(values: readonly string[]): CollectionRow[] {
  return values.map((value, index) => ({ id: String(index), value }));
}

/** Returns true for bounded control-free text. */
function validText(value: string): boolean {
  if (value.length < 1 || value.length > 2_048) return false;
  return ![...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

/** Returns true for one absolute redirect URI without wildcard or fragment syntax. */
function validRedirectUri(value: string): boolean {
  if (!validText(value) || value.includes('*')) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol.length > 1 && parsed.hash === '';
  } catch {
    return false;
  }
}

/** Returns true for one exact HTTP(S) origin. */
function validOrigin(value: string): boolean {
  if (!validText(value) || value.includes('*')) return false;
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.pathname === '/' &&
      parsed.search === '' &&
      parsed.hash === '' &&
      parsed.origin === value
    );
  } catch {
    return false;
  }
}

/** Selects the validator for the active collection. */
function collectionValueIsValid(kind: CollectionKind, value: string): boolean {
  return kind === 'origins' ? validOrigin(value) : validRedirectUri(value);
}

/** Validates count, value syntax, and exact uniqueness for one complete collection. */
function collectionIsValid(kind: CollectionKind, rows: readonly CollectionRow[]): boolean {
  const minimum = kind === 'redirects' ? 1 : 0;
  const values = rows.map((entry) => entry.value);
  return (
    values.length >= minimum &&
    values.length <= 10 &&
    new Set(values).size === values.length &&
    values.every((value) => collectionValueIsValid(kind, value))
  );
}

/** Validates all staged collections, including the two that are not currently visible. */
function collectionsAreValid(collections: AuthenticationCollections): boolean {
  return COLLECTION_CHOICES.every((choice) =>
    collectionIsValid(choice.kind, collections[choice.kind]()),
  );
}

/** Explains why the current value cannot be added or edited. */
function valueGuidance(
  kind: CollectionKind,
  value: string,
  rows: readonly CollectionRow[],
  selectedIndex: number,
): string {
  if (value.length === 0) return 'A value is required.';
  if (!collectionValueIsValid(kind, value))
    return 'The value is invalid. Enter an exact URI or origin.';
  const duplicate = rows.some((row, index) => row.value === value && index !== selectedIndex);
  return duplicate ? 'That exact value already exists.' : '';
}

/** Maximizes a fixed editor while leaving user zoom controls disabled. */
function maximizeDialog(dialog: Dialog): void {
  if (dialog.isZoomed()) return;
  dialog.zoomable = true;
  dialog.zoom();
  dialog.zoomable = false;
}

/** Runs one abortable modal and always removes it from the desktop. */
async function runDialog(
  host: ClientAuthenticationDialogHost,
  dialog: Dialog,
  operationSignal: AbortSignal,
): Promise<string> {
  host.desktop.addWindow(dialog);
  maximizeDialog(dialog);
  try {
    return await runAbortableAdminDialog(
      host.loop,
      operationSignal,
      async () => (await host.loop.execView<string>(dialog)) ?? Commands.cancel,
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return Commands.cancel;
    throw error;
  } finally {
    host.desktop.removeWindow(dialog);
  }
}

/** Opens the focused editor and returns all three arrays in one bounded update. */
export async function showClientAuthenticationDialog(
  host: ClientAuthenticationDialogHost,
  operationSignal: AbortSignal,
  organization: AdminOrganizationContext,
  client: AdminClient,
): Promise<ClientAuthenticationDialogResult> {
  if (client.organizationId !== organization.id) return { kind: 'cancel' };
  const collections: AuthenticationCollections = {
    redirects: signal(collectionRows(client.redirectUris)),
    logoutRedirects: signal(collectionRows(client.postLogoutRedirectUris)),
    origins: signal(collectionRows(client.allowedOrigins)),
  };
  const choice = signal<CollectionChoice | null>(COLLECTION_CHOICES[0] ?? null);
  const visibleRows = signal([...collections.redirects.peek()]);
  const focused = signal(0);
  const selected = signal(-1);
  const value = signal('');
  const valueInput = new Input({ value, maxLength: 2_048, validator: textValidator(0, 2_048) });
  const focusedByCollection: Record<CollectionKind, number> = {
    redirects: 0,
    logoutRedirects: 0,
    origins: 0,
  };
  const selectedByCollection: Record<CollectionKind, number> = {
    redirects: -1,
    logoutRedirects: -1,
    origins: -1,
  };
  let activeKind: CollectionKind = 'redirects';
  const grid = new AuthenticationCollectionGrid(
    visibleRows,
    focused,
    selected,
    (rows) => {
      collections[activeKind].set([...rows]);
      visibleRows.set([...rows]);
      const lastIndex = Math.max(0, rows.length - 1);
      focused.set(Math.min(focused.peek(), lastIndex));
      selected.set(rows.length === 0 ? -1 : Math.min(selected.peek(), lastIndex));
    },
    (index, selectedRow) => {
      selected.set(index);
      value.set(selectedRow.value);
    },
  );
  const selector = new ComboBox<CollectionChoice>({
    items: signal([...COLLECTION_CHOICES]),
    getText: (item) => item.label,
    value: choice,
    editable: false,
  });
  const dialog = new ClientAuthenticationDialog(
    Math.max(1, Math.min(78, host.desktop.bounds.width)),
    Math.max(1, Math.min(23, host.desktop.bounds.height)),
    collections,
    valueInput,
  );
  dialog.onMount(() => {
    dialog.bind(
      () => choice()?.kind ?? 'redirects',
      (nextKind) => {
        focusedByCollection[activeKind] = focused.peek();
        selectedByCollection[activeKind] = selected.peek();
        activeKind = nextKind;
        const rows = collections[nextKind].peek();
        visibleRows.set([...rows]);
        focused.set(Math.min(focusedByCollection[nextKind], Math.max(0, rows.length - 1)));
        selected.set(Math.min(selectedByCollection[nextKind], rows.length - 1));
        value.set('');
      },
      { relayout: true },
    );
  });
  const currentRows = (): readonly CollectionRow[] => visibleRows();
  const currentValueIsValid = (excludeSelected: boolean): boolean => {
    const selectedIndex = excludeSelected ? selected() : -1;
    return valueGuidance(activeKind, value(), currentRows(), selectedIndex) === '';
  };
  const add = new Button('~A~dd', {
    disabled: () => visibleRows().length >= 10 || !currentValueIsValid(false),
    onClick: () => {
      if (visibleRows.peek().length >= 10 || !currentValueIsValid(false)) return;
      grid.setRows([
        ...visibleRows.peek(),
        { id: `${activeKind}-${visibleRows.peek().length}`, value: value.peek() },
      ]);
      value.set('');
    },
  });
  const edit = new Button('~E~dit', {
    disabled: () => selected() < 0 || !currentValueIsValid(true),
    onClick: () => {
      const index = selected.peek();
      if (index < 0 || !currentValueIsValid(true)) return;
      grid.setRows(
        visibleRows
          .peek()
          .map((entry, rowIndex) =>
            rowIndex === index ? { ...entry, value: value.peek() } : entry,
          ),
      );
    },
  });
  const remove = new Button('~R~emove', {
    disabled: () => selected() < 0 || (activeKind === 'redirects' && visibleRows().length <= 1),
    onClick: () => {
      const index = selected.peek();
      if (index < 0 || (activeKind === 'redirects' && visibleRows.peek().length <= 1)) return;
      grid.setRows(visibleRows.peek().filter((_entry, rowIndex) => rowIndex !== index));
      value.set('');
    },
  });
  const context = new GroupBox({ title: 'Client', padding: 1 });
  context.add(
    cover(
      col(
        {},
        fixed(new Text(`Organization: ${organization.name}`), 1),
        fixed(new Text(`Client: ${client.clientName}`), 1),
      ),
    ),
  );
  const editor = new GroupBox({ title: 'Authentication collections', padding: 1 });
  editor.add(
    cover(
      col(
        { gap: 0 },
        fixed(row({ gap: 1 }, fixed(new Label('Collection', selector), 18), grow(selector)), 1),
        grow(grid),
        fixed(row({ gap: 1 }, fixed(new Label('Value', valueInput), 18), grow(valueInput)), 1),
        fixed(row({ gap: 1 }, add, edit, remove, spacer()), 2),
        fixed(new Text(() => valueGuidance(activeKind, value(), currentRows(), selected())), 1),
      ),
    ),
  );
  dialog.add(
    cover(
      col(
        { gap: 1, padding: { top: 1, right: 2, bottom: 1, left: 2 } },
        fixed(context, 4),
        grow(editor),
        fixed(
          row(
            { gap: 1 },
            spacer(),
            new Button('~S~ave', {
              command: Commands.ok,
              default: true,
              disabled: () => !collectionsAreValid(collections),
            }),
            new Button('Cancel', { command: Commands.cancel }),
          ),
          2,
        ),
      ),
    ),
  );
  if ((await runDialog(host, dialog, operationSignal)) !== Commands.ok) return { kind: 'cancel' };
  return {
    kind: 'update',
    clientId: client.id,
    input: {
      redirectUris: collections.redirects.peek().map((entry) => entry.value),
      postLogoutRedirectUris: collections.logoutRedirects.peek().map((entry) => entry.value),
      allowedOrigins: collections.origins.peek().map((entry) => entry.value),
    },
  };
}
