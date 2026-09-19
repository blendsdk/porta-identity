/** Direct four-tab Layout DSL editor for authoritative operational policy. */
import {
  Button,
  col,
  ComboBox,
  cover,
  Dialog,
  fixed,
  Group,
  grow,
  Input,
  Label,
  row,
  signal,
  spacer,
  TabView,
  Text,
} from '@jsvision/ui';
import type { Signal, Tab, View } from '@jsvision/ui';
import type { ConfigEntry, ConfigKey } from '@portaidentity/sdk';
import {
  formatAdminConfigDuration,
  parseAdminConfigDraft,
  projectAdminConfigDrafts,
  setAdminConfigDraft,
} from './system-config-state.js';
import type {
  AdminSystemConfigIntent,
  AdminSystemConfigWorkspaceState,
} from './system-config-state.js';

/** Shared label width fits the longest approved human field caption. */
const LABEL_WIDTH = 'Password-reset request window'.length;
/** Single-line integer inputs leave room for the native value and editing signs. */
const INPUT_WIDTH = 12;
/** Non-divisible lifetimes need more cells than the shorter whole-day maximum. */
const HELP_WIDTH = 'seconds · 300–31536000 · 31535999 seconds · Restart required'.length;
/** Fitting viewport includes page padding, tab/window borders and menu/status chrome. */
export const SYSTEM_CONFIG_MINIMUM_SIZE = Object.freeze({
  width: LABEL_WIDTH + INPUT_WIDTH + HELP_WIDTH + 2 + 6 + 2,
  height: 8 + 7 + 2 + 3 + 2 + 3 + 2 + 2,
});

/** Verified authority needed by this feature only. */
export interface AdminSystemConfigCapabilities {
  /** Whether catalog values may be read. */
  readonly canReadConfig: boolean;
  /** Whether valid dirty values may be saved. */
  readonly canUpdateConfig: boolean;
}
/** Construction boundaries for one focused workspace. */
export interface AdminSystemConfigWorkspaceOptions {
  /** Verified session capabilities. */
  readonly capabilities: AdminSystemConfigCapabilities;
  /** Sends closed user actions to the owning controller. */
  readonly onIntent: (intent: AdminSystemConfigIntent) => void;
  /** Focuses one mounted control through the application loop. */
  readonly focusView?: (view: View) => void;
  /** Delegates frame closure to the controller's discard handling. */
  readonly onClose?: () => void;
}
/** Mounted full-page editor controlled through immutable projections. */
export interface AdminSystemConfigWorkspace {
  /** Maximized, non-restorable modeless dialog. */
  readonly content: Dialog;
  /** Publishes authoritative entries, drafts and operation state. */
  readonly setState: (state: AdminSystemConfigWorkspaceState) => void;
  /** Focuses a reachable control on the active tab. */
  readonly focusCurrent: () => void;
  /** Releases retained data and bindings. */
  readonly clear: () => void;
}

/** Modeless frame delegates close and reports compact geometry without a resize framework. */
class ConfigDialog extends Dialog {
  /** Builds the full-page frame and its existing maximize behavior. */
  constructor(
    private readonly requestClose: () => void,
    private readonly geometry: (fits: boolean) => void,
  ) {
    super({
      title: 'System Configuration',
      width: SYSTEM_CONFIG_MINIMUM_SIZE.width,
      height: SYSTEM_CONFIG_MINIMUM_SIZE.height - 2,
    });
    this.resizable = false;
    this.movable = false;
    this.onMount(() => {
      this.zoomable = true;
      if (!this.isZoomed()) this.zoom();
      this.zoomable = false;
      this.onResized();
    });
  }
  /** Delegates frame closure; busy and dirty checks remain controller-owned. */
  override close(): void {
    this.requestClose();
  }
  /** Changes the owned surface before painting, using the existing window resize hook. */
  override onResized(): void {
    const size = this.currentRect();
    this.geometry(
      size.width >= SYSTEM_CONFIG_MINIMUM_SIZE.width &&
        size.height >= SYSTEM_CONFIG_MINIMUM_SIZE.height - 2,
    );
  }
}

/** Builds inline native-unit/range help without converting the stored editor value. */
function help(entry: ConfigEntry, raw: string): string {
  const parsed = parseAdminConfigDraft(entry, raw);
  const range =
    entry.valueType === 'integer'
      ? `${entry.minimum}–${entry.maximum}`
      : entry.allowedValues?.join(', ');
  const duration =
    entry.unit === 'seconds' && typeof parsed === 'number'
      ? ` · ${formatAdminConfigDuration(parsed)}`
      : '';
  const invalid = parsed === undefined ? ' · Invalid value' : '';
  const restart = entry.applicationMode === 'restart-required' ? ' · Restart required' : '';
  return `${entry.unit} · ${range}${duration}${invalid}${restart}`;
}

/**
 * Creates one direct DSL form with retained raw edits and a persistent footer.
 * Compact geometry removes editable controls but retains immutable drafts and active-tab identity.
 * @param options - Verified capabilities, intent sink and application focus boundary.
 * @returns The modeless window and its state/lifecycle operations.
 * @example createAdminSystemConfigWorkspace({ capabilities, onIntent });
 */
export function createAdminSystemConfigWorkspace(
  options: AdminSystemConfigWorkspaceOptions,
): AdminSystemConfigWorkspace {
  let state: AdminSystemConfigWorkspaceState = { kind: 'closed' };
  let fits = true;
  let builtEntries: readonly ConfigEntry[] | undefined;
  let body: View | undefined;
  let pane: TabView | undefined;
  let save: Button | undefined;
  let cancel: Button | undefined;
  const statusMessage = signal('');
  const active = signal(0);
  const inputs = new Map<
    ConfigKey,
    {
      readonly input: Input | ComboBox<string>;
      readonly value: Signal<string>;
      readonly selection?: Signal<string | null>;
      readonly help: Signal<string>;
    }
  >();

  /** Updates retained controls without rebuilding or stealing focus on every keystroke. */
  const refresh = (): void => {
    if (state.kind !== 'ready') return;
    const projection = projectAdminConfigDrafts(
      state,
      options.capabilities.canReadConfig && options.capabilities.canUpdateConfig,
    );
    for (const entry of state.entries) {
      const control = inputs.get(entry.key);
      if (!control) continue;
      const raw = state.drafts?.[entry.key] ?? String(entry.value);
      if (control.value.peek() !== raw) control.value.set(raw);
      if (control.selection && control.selection.peek() !== raw) control.selection.set(raw);
      control.help.set(help(entry, raw));
      control.input.state.disabled = !!state.busy;
      if (control.input instanceof ComboBox) control.input.input.state.disabled = !!state.busy;
      control.input.invalidate();
    }
    if (save) {
      save.state.disabled = !projection.canSave;
      save.invalidate();
    }
    if (cancel) {
      cancel.state.disabled = !!state.busy;
      cancel.invalidate();
    }
    statusMessage.set(state.message ?? '');
  };

  /** Rebuilds only on catalog replacement or a geometry/state-mode transition. */
  const rebuild = (): void => {
    if (body) window.remove(body);
    inputs.clear();
    pane = undefined;
    save = undefined;
    cancel = undefined;
    statusMessage.set('');
    if (!fits) {
      body = col(
        { padding: 1 },
        new Text('Terminal too small.'),
        new Text(
          `Resize to at least ${SYSTEM_CONFIG_MINIMUM_SIZE.width}x${SYSTEM_CONFIG_MINIMUM_SIZE.height}.`,
        ),
      );
    } else if (state.kind === 'ready') {
      const entries = state.entries;
      const tabs: Tab[] = [
        ['lifetimes', 'Lifetimes'],
        ['rate-limits', 'Rate limits'],
        ['lockout', 'Lockout'],
        ['general', 'General'],
      ].map(([group, title]) => {
        const rows = entries
          .filter((entry) => entry.group === group)
          .map((entry) => {
            const value = signal(
              state.kind === 'ready'
                ? (state.drafts?.[entry.key] ?? String(entry.value))
                : String(entry.value),
            );
            const selection =
              entry.valueType === 'string' ? signal<string | null>(value.peek()) : undefined;
            const input = selection
              ? new ComboBox({
                  items: signal([...(entry.allowedValues ?? [])]),
                  value: selection,
                  getText: (locale) => locale,
                  editable: false,
                })
              : new Input({ value, maxLength: 32 });
            const hint = signal(help(entry, value.peek()));
            inputs.set(entry.key, { input, value, selection, help: hint });
            input.onMount(() =>
              input.bind(
                () => (selection ? selection() : value()),
                (text) => {
                  if (
                    state.kind !== 'ready' ||
                    state.busy ||
                    text === null ||
                    text === (state.drafts?.[entry.key] ?? String(entry.value))
                  )
                    return;
                  state = setAdminConfigDraft(state, entry.key, text);
                  refresh();
                  options.onIntent({ kind: 'set-draft', key: entry.key, text });
                },
              ),
            );
            return fixed(
              row(
                { gap: 1 },
                fixed(
                  new Label(entry.label, input instanceof ComboBox ? input.input : input),
                  LABEL_WIDTH,
                ),
                fixed(input, INPUT_WIDTH),
                fixed(new Text(() => hint()), HELP_WIDTH),
                spacer(),
              ),
              1,
            );
          });
        const page = new Group();
        page.add(cover(col({ padding: 1, gap: 1 }, ...rows, spacer())));
        return { title: title ?? '', content: page };
      });
      pane = new TabView({ tabs: signal(tabs), active });
      save = new Button('Save', { onClick: () => options.onIntent({ kind: 'save' }) });
      cancel = new Button('Cancel', { onClick: () => options.onIntent({ kind: 'close' }) });
      body = col(
        { padding: 1 },
        grow(pane),
        fixed(new Text(() => statusMessage()), 1),
        fixed(
          row(
            { gap: 1, padding: { left: 1, right: 1, top: 0, bottom: 0 }, justify: 'end' },
            save,
            cancel,
          ),
          2,
        ),
      );
      builtEntries = entries;
    } else {
      body = col(
        { padding: 1 },
        new Text(
          state.kind === 'loading'
            ? 'Loading configuration…'
            : state.kind === 'failure'
              ? 'Could not load configuration.'
              : '',
        ),
      );
      builtEntries = undefined;
    }
    window.add(cover(body));
    refresh();
  };
  const window = new ConfigDialog(
    () => (options.onClose ? options.onClose() : options.onIntent({ kind: 'close' })),
    (next) => {
      if (fits === next) return;
      fits = next;
      rebuild();
    },
  );
  return {
    content: window,
    setState(next) {
      const oldKind = state.kind;
      state = next;
      if (
        !body ||
        oldKind !== next.kind ||
        (next.kind === 'ready' && next.entries !== builtEntries)
      )
        rebuild();
      else refresh();
    },
    focusCurrent() {
      const page = pane?.tabs.peek()[active.peek()]?.content;
      const entry =
        state.kind === 'ready'
          ? state.entries.find((item) => inputs.get(item.key)?.input.parent?.parent === page)
          : undefined;
      const target = entry ? inputs.get(entry.key)?.input : pane?.strip;
      if (target) options.focusView?.(target instanceof ComboBox ? target.input : target);
    },
    clear() {
      state = { kind: 'closed' };
      builtEntries = undefined;
      if (body) window.remove(body);
      body = undefined;
      inputs.clear();
    },
  };
}
