/** JSVision presentation for the embedded Porta administration shell. */

import {
  Commands,
  Group,
  View,
  grow,
  item,
  menuBar,
  spacer,
  statusItem,
  statusLine,
  subMenu,
} from '@jsvision/ui';
import type { DrawContext, MenuBar, Size2D, StatusLine } from '@jsvision/ui';
import { normalizeServerOrigin } from '../global-options.js';
import { canRetryAdminState, type AdminConnectionState } from './state.js';

/** Command names handled by the administration application. */
export const ADMIN_COMMANDS = {
  authenticate: 'authenticate',
  retry: 'retry',
  reauthenticate: 'reauthenticate',
  cancel: 'cancel',
} as const;

/** Minimum geometry that can display the full administration summary. */
const NORMAL_WIDTH = 64;
const NORMAL_HEIGHT = 16;

/** Minimum geometry that can display a useful compact shell. */
const COMPACT_WIDTH = 32;
const COMPACT_HEIGHT = 8;

/** Fixed public descriptions for failure categories. */
const FAILURE_LABELS = {
  unavailable: 'Unavailable. Retry is available.',
  unauthenticated: 'Authentication is required.',
  unauthorized: 'The verified identity is not authorized.',
  'configuration-failure': 'The local configuration is invalid.',
  'storage-failure': 'Credentials could not be stored.',
} as const;

/** Presentation objects mounted into one JSVision application. */
export interface AdminPresentation {
  /** Full-screen body mounted between the application chrome rows. */
  readonly content: Group;
  /** Application and session menu bar. */
  readonly menu?: MenuBar;
  /** Keyboard shortcut bar. */
  readonly status: StatusLine;
  /** Replaces displayed state and requests a repaint. */
  readonly setState: (state: AdminConnectionState) => void;
  /** Returns the state currently owned by the view. */
  readonly getState: () => AdminConnectionState;
}

/** Removes terminal controls and bounds a live-verified display claim. */
function safeText(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  let result = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return fallback;
    result += character;
    if (result.length >= 80) break;
  }
  return result || fallback;
}

/** Converts a state discriminator to a stable, readable label. */
function stateLabel(state: AdminConnectionState): string {
  switch (state.kind) {
    case 'selecting-server':
      return 'Selecting server';
    case 'unauthenticated':
      return state.reason ? FAILURE_LABELS[state.reason] : 'Authentication required';
    case 'authenticating':
      return 'Authenticating';
    case 'verifying':
      return 'Verifying identity';
    case 'authenticated':
      return 'Authenticated';
    case 'unauthorized':
      return FAILURE_LABELS.unauthorized;
    case 'fatal':
      return FAILURE_LABELS[state.failure.kind];
  }
}

/** Returns the server origin without any path or credentials. */
function serverLabel(state: AdminConnectionState): string {
  if (!('server' in state)) return 'Not selected';
  try {
    return normalizeServerOrigin(state.server).origin;
  } catch {
    return 'Invalid configuration';
  }
}

/** Renders the current state into the real JSVision frame buffer. */
class AdminSummaryView extends View {
  /** Creates a summary bound to one mutable application-owned state cell. */
  constructor(
    private readonly readState: () => AdminConnectionState,
    private readonly insecure: boolean,
    private readonly reportRecoverableGeometry: (recoverable: boolean) => void,
  ) {
    super();
  }

  /** Draws the responsive normal, compact, or resize-only presentation. */
  draw(context: DrawContext): void {
    context.fill(' ');
    const { width, height } = context.size;
    const recoverable = width >= COMPACT_WIDTH && height >= COMPACT_HEIGHT;
    this.reportRecoverableGeometry(recoverable);
    if (!recoverable) {
      context.text(1, 1, 'Terminal too small.');
      context.text(1, 2, `Resize to at least ${COMPACT_WIDTH}x${COMPACT_HEIGHT}.`);
      context.text(1, Math.max(3, height - 2), 'Alt-X Quit');
      return;
    }

    const state = this.readState();
    const compact = width < NORMAL_WIDTH || height < NORMAL_HEIGHT;
    const lines = compact ? this.compactLines(state) : this.normalLines(state);
    for (let index = 0; index < lines.length && index < height; index += 1) {
      context.text(compact ? 1 : 2, index, lines[index] ?? '');
    }
  }

  /** Builds the complete summary used by ordinary terminals. */
  private normalLines(state: AdminConnectionState): string[] {
    const lines = [
      'Porta Administration',
      '',
      `Server: ${serverLabel(state)}`,
      `State: ${stateLabel(state)}`,
    ];
    if (state.kind === 'authenticated' || state.kind === 'unauthorized') {
      lines.push(`Identity: ${safeText(state.identity.name, 'Verified administrator')}`);
      lines.push(`Email: ${safeText(state.identity.email, 'Not provided')}`);
    }
    if (this.insecure) lines.push('Warning: insecure TLS verification is enabled.');
    lines.push('', ...this.actionLines(state));
    lines.push('Shortcuts: Alt-X Quit');
    return lines;
  }

  /** Builds the bounded summary used by small but recoverable terminals. */
  private compactLines(state: AdminConnectionState): string[] {
    const lines = ['Porta Admin', `Server: ${serverLabel(state)}`, `State: ${stateLabel(state)}`];
    if (state.kind === 'authenticated' || state.kind === 'unauthorized') {
      lines.push(`Identity: ${safeText(state.identity.email, state.identity.sub)}`);
    }
    if (this.insecure) lines.push('Warning: insecure TLS enabled.');
    lines.push(...this.actionLines(state));
    return lines;
  }

  /** Lists keyboard-complete actions appropriate to the current state. */
  private actionLines(state: AdminConnectionState): string[] {
    if (state.kind === 'authenticated' || state.kind === 'unauthorized') {
      return ['Ctrl-R Reauthenticate', 'Alt-X Quit'];
    }
    if (state.kind === 'authenticating' || state.kind === 'verifying') {
      return ['Esc Cancel', 'Alt-X Quit'];
    }
    if (state.kind === 'unauthenticated') {
      const actions = ['Enter Authenticate'];
      if (canRetryAdminState(state)) actions.push('Ctrl-T Retry');
      actions.push('Alt-X Quit');
      return actions;
    }
    return ['Alt-X Quit'];
  }
}

/** Builds the real JSVision view tree and application chrome. */
export function createAdminPresentation(
  initialState: AdminConnectionState,
  insecure: boolean,
  viewport?: Size2D,
): AdminPresentation {
  let currentState = initialState;
  const belowRecoverable =
    viewport !== undefined && (viewport.width < COMPACT_WIDTH || viewport.height < COMPACT_HEIGHT);
  const fullMenuItems = () => [
    subMenu('~A~pplication', [item('~Q~uit', Commands.quit, 'Alt+X')]),
    subMenu('~S~ession', [item('~R~eauthenticate', ADMIN_COMMANDS.reauthenticate, 'Ctrl+R')]),
  ];
  const fullStatusItems = () => [
    statusItem('~Alt-X~ Quit', Commands.quit, 'Alt+X'),
    spacer(),
    statusItem('~Ctrl-R~ Reauthenticate', ADMIN_COMMANDS.reauthenticate, 'Ctrl+R'),
  ];
  const quitStatusItems = () => [statusItem('~Alt-X~ Quit', Commands.quit, 'Alt+X')];
  const menu = menuBar(belowRecoverable ? [] : fullMenuItems());
  const status = statusLine(belowRecoverable ? quitStatusItems() : fullStatusItems());
  let geometryIsRecoverable = !belowRecoverable;
  const summary = new AdminSummaryView(
    () => currentState,
    insecure,
    (recoverable) => {
      if (recoverable === geometryIsRecoverable) return;
      geometryIsRecoverable = recoverable;
      menu.setItems(recoverable ? fullMenuItems() : []);
      status.setItems(recoverable ? fullStatusItems() : quitStatusItems());
    },
  );
  const content = new Group();
  content.add(grow(summary));

  return {
    content,
    menu,
    status,
    setState: (state) => {
      currentState = state;
      summary.invalidate();
    },
    getState: () => currentState,
  };
}
