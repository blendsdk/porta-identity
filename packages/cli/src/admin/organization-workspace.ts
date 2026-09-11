/** Direct JSVision workspace for the selected organization's settings. */

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

import { formatAdminDateTime } from './admin-date-time.js';
import type {
  AdminCapabilities,
  AdminOrganizationIntent,
  AdminOrganizationSettings,
  AdminOrganizationWorkspaceProjection,
  AdminOrganizationWorkspaceState,
} from './state.js';
import { textValidator } from './user-dialog-fields.js';

/** Construction values for one selected-organization workspace. */
export interface AdminOrganizationWorkspaceOptions {
  /** Capabilities from the currently verified administration session. */
  readonly capabilities: AdminCapabilities;
  /** Receives closed user intents while the controller owns remote work. */
  readonly onIntent: (intent: AdminOrganizationIntent) => void;
  /** Focuses one mounted control through the application event loop. */
  readonly focusView?: (view: View) => void;
}

/** Mounted organization workspace controlled by validated immutable state. */
export interface AdminOrganizationWorkspace {
  /** Maximized modeless dialog mounted into the administration desktop. */
  readonly content: Dialog;
  /** Replaces the complete validated workspace state. */
  readonly setState: (state: AdminOrganizationWorkspaceState) => void;
  /** Restores focus within the currently selected tab. */
  readonly focusCurrent: () => void;
  /** Removes retained state and controls. */
  readonly clear: () => void;
}

/** Fixed failure labels that are safe to render. */
const FAILURE_LABELS = {
  validation: 'Validation failed',
  unauthorized: 'Not authorized',
  conflict: 'Conflict',
  unavailable: 'Service unavailable',
  'invalid-response': 'Invalid server response',
} as const;

/** Wraps one Layout DSL tree in the Group required by TabView. */
function tabPage(child: View): Group {
  const page = new Group();
  page.add(cover(child));
  return page;
}

/** Returns whether an organization name is safe and within the public contract. */
function validName(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 255) return false;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return false;
  }
  return true;
}

/** Builds the maximized organization workspace with one direct page per concern. */
export function createAdminOrganizationWorkspace(
  options: AdminOrganizationWorkspaceOptions,
): AdminOrganizationWorkspace {
  const content = new Dialog({ title: 'Organization', width: 72, height: 20 });
  content.resizable = false;
  content.zoomable = false;
  content.minWidth = 49;
  content.minHeight = 19;
  content.background = 'dialog';
  let state: AdminOrganizationWorkspaceState = { kind: 'closed' };
  let currentFocus: View | null = null;
  const selectedTab = signal(0);

  /** Builds a labelled one-row field with a stable label column. */
  const field = (label: string, control: View): Group =>
    row({ gap: 1 }, fixed(new Label(label, control), 15), grow(control));

  /** Builds the editable Overview page from one authoritative projection. */
  const overviewPage = (
    organization: AdminOrganizationSettings,
    pending: boolean,
  ): Group => {
    const canUpdate = options.capabilities.canUpdateOrganizations;
    const canLifecycle = options.capabilities.canSuspendOrganizations;
    const name = signal(organization.name);
    const locale = signal<string | null>(organization.defaultLocale);
    const localeItems = signal(
      organization.defaultLocale === 'en' ? ['en'] : [organization.defaultLocale, 'en'],
    );
    const nameInput = new Input({
      value: name,
      maxLength: 255,
      validator: textValidator(1, 255, false),
    });
    const localeInput = new ComboBox<string>({
      items: localeItems,
      getText: (value) => value,
      value: locale,
      editable: false,
    });
    nameInput.focusable = canUpdate;
    localeInput.focusable = canUpdate;
    localeInput.input.focusable = canUpdate;

    /** Returns only values that differ from the last authoritative state. */
    const changes = (): { readonly name?: string; readonly defaultLocale?: string } => {
      const input: { name?: string; defaultLocale?: string } = {};
      const nextName = name().trim();
      if (nextName !== organization.name) input.name = nextName;
      const nextLocale = locale();
      if (nextLocale && nextLocale !== organization.defaultLocale) input.defaultLocale = nextLocale;
      return input;
    };
    const save = new Button('~S~ave', {
      disabled: () =>
        !canUpdate || pending || !validName(name()) || Object.keys(changes()).length === 0,
      onClick: () => options.onIntent({ kind: 'save-overview', input: changes() }),
    });
    const lifecycle =
      organization.status === 'suspended'
        ? new Button('~A~ctivate', {
            disabled: !canLifecycle || pending,
            onClick: () => options.onIntent({ kind: 'activate' }),
          })
        : new Button('~S~uspend', {
            disabled: !canLifecycle || organization.isSuperAdmin || pending,
            onClick: () => options.onIntent({ kind: 'suspend' }),
          });
    const notices = [
      organization.defaultLocale !== 'en'
        ? `${organization.defaultLocale} is unsupported here; it is preserved until English is selected.`
        : undefined,
      organization.isSuperAdmin
        ? 'The super-admin control-plane organization cannot be suspended.'
        : !canLifecycle
          ? 'This action requires organization suspend permission.'
          : undefined,
    ].filter((value): value is string => value !== undefined);

    const page = tabPage(
      col(
        { gap: 1, padding: 1 },
        fixed(field('Name', nameInput), 1),
        fixed(field('Default locale', localeInput), 1),
        fixed(new Text(`ID: ${organization.id}`), 1),
        fixed(new Text(`Slug: ${organization.slug}`), 1),
        fixed(new Text(`Status: ${organization.status.toUpperCase()}`), 1),
        fixed(new Text(`Created: ${formatAdminDateTime(organization.createdAt)}`), 1),
        fixed(new Text(`Updated: ${formatAdminDateTime(organization.updatedAt)}`), 1),
        ...notices.map((notice) => fixed(new Text(notice), 1)),
        spacer(),
        fixed(row({ gap: 1 }, save, spacer(), lifecycle), 2),
      ),
    );
    currentFocus = canUpdate ? nameInput : lifecycle;
    return page;
  };

  /** Builds the Authentication tab's stable action placement. */
  const authenticationPlaceholder = (): Group =>
    tabPage(
      col(
        { gap: 1, padding: 1 },
        fixed(new Text('Authentication settings'), 1),
        spacer(),
        fixed(row(new Button('~S~ave', { disabled: true }), spacer()), 2),
      ),
    );

  /** Builds the Branding tab's stable asset-row placement. */
  const brandingPlaceholder = (): Group =>
    tabPage(
      col(
        { gap: 1, padding: 1 },
        fixed(row({ gap: 1 }, new Text('Logo'), new Button('Add', { disabled: true }), spacer()), 2),
        fixed(
          row({ gap: 1 }, new Text('Favicon'), new Button('Add', { disabled: true }), spacer()),
          2,
        ),
        spacer(),
      ),
    );

  /** Renders all tabs from one retained authoritative projection. */
  const renderProjection = (projection: AdminOrganizationWorkspaceProjection): void => {
    const pending = state.kind === 'ready' && state.pendingTabs?.includes('overview') === true;
    const tabs: Signal<Tab[]> = signal([
      { title: 'Overview', content: overviewPage(projection.organization, pending) },
      { title: 'Authentication', content: authenticationPlaceholder() },
      { title: 'Branding', content: brandingPlaceholder() },
    ]);
    const tabView = new TabView({ tabs, active: selectedTab });
    const status =
      state.kind === 'ready' && state.failure
        ? FAILURE_LABELS[state.failure]
        : state.kind === 'loading'
          ? 'Loading organization…'
          : undefined;
    content.add(
      cover(
        col(
          status && fixed(new Text(status), 1),
          grow(tabView),
        ),
      ),
    );
    if (selectedTab.peek() !== 0) currentFocus = tabView.strip;
  };

  /** Rebuilds the retained tree so replaced states cannot leave stale controls. */
  const render = (): void => {
    for (const child of [...content.children]) content.remove(child);
    currentFocus = null;
    if (state.kind === 'closed') return;
    if (state.kind === 'ready') {
      content.title.set(`${state.organization.name} — Organization`);
      renderProjection(state);
      return;
    }
    if (state.kind === 'loading' && state.previous) {
      content.title.set(`${state.previous.organization.name} — Organization`);
      renderProjection(state.previous);
      return;
    }
    const failure = state.kind === 'failure' ? FAILURE_LABELS[state.failure] : 'Loading organization…';
    content.title.set('Organization');
    content.add(cover(col({ gap: 1, padding: 1 }, fixed(new Text(failure), 1), spacer())));
  };

  return {
    content,
    setState(next) {
      state = next;
      render();
    },
    focusCurrent() {
      if (currentFocus) options.focusView?.(currentFocus);
    },
    clear() {
      state = { kind: 'closed' };
      selectedTab.set(0);
      render();
    },
  };
}
