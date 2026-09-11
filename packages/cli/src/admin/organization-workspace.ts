/** Direct JSVision workspace for the selected organization's settings. */

import {
  Button,
  CheckGroup,
  col,
  ComboBox,
  cover,
  Dialog,
  fixed,
  Group,
  grow,
  Input,
  Label,
  RadioGroup,
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
  AdminOrganizationAsset,
  AdminOrganizationIntent,
  AdminOrganizationLoginMethod,
  AdminOrganizationSettings,
  AdminOrganizationTwoFactorPolicy,
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
  /** Releases controller ownership when the modeless window is closed directly. */
  readonly onClose?: () => void;
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
  'file-type': 'Choose a PNG, JPEG, WebP, ICO, or SVG image',
  'file-size': 'The selected image exceeds the allowed size',
  'file-read': 'The selected image could not be read',
} as const;

/** Logical action that should regain focus after a dialog or native picker closes. */
type DialogLauncherKind =
  | 'lifecycle'
  | 'logo-upload'
  | 'logo-remove'
  | 'favicon-upload'
  | 'favicon-remove';

/** Retains launcher meaning so rerendered controls can replace detached instances. */
interface DialogLauncher {
  readonly kind: DialogLauncherKind;
  readonly view: View;
}

/** Modeless organization dialog that reports direct frame-close actions to its owner. */
class OrganizationDialog extends Dialog {
  /** Creates the fixed workspace surface and retains its optional close callback. */
  constructor(private readonly onClose?: () => void) {
    super({ title: 'Organization', width: 72, height: 20 });
  }

  /** Lets the controller remove an owned workspace without leaving stale state behind. */
  override close(): void {
    if (this.onClose) this.onClose();
    else super.close();
  }
}

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

/** Returns a field-specific organization name error, or no error when valid. */
function nameError(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Name is required.';
  return validName(value)
    ? undefined
    : 'Name must be at most 255 characters and contain no control characters.';
}

/** Returns whether an optional fallback image URL is safe to send. */
function validBrandingUrl(value: string): boolean {
  const normalized = value.trim();
  if (normalized.length === 0) return true;
  try {
    const url = new URL(normalized);
    if (url.username || url.password) return false;
    if (url.protocol === 'https:') return true;
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
    );
  } catch {
    return false;
  }
}

/** Formats decoded bytes without exposing unnecessary precision. */
function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  const kibibytes = size / 1024;
  if (kibibytes < 1024) return `${Number(kibibytes.toFixed(1))} KiB`;
  return `${Number((kibibytes / 1024).toFixed(1))} MiB`;
}

/** Builds the maximized organization workspace with one direct page per concern. */
export function createAdminOrganizationWorkspace(
  options: AdminOrganizationWorkspaceOptions,
): AdminOrganizationWorkspace {
  const content = new OrganizationDialog(options.onClose);
  content.resizable = false;
  content.zoomable = false;
  content.minWidth = 49;
  content.minHeight = 19;
  content.background = 'dialog';
  let state: AdminOrganizationWorkspaceState = { kind: 'closed' };
  let currentFocus: View | null = null;
  let currentTabs: TabView | undefined;
  let tabFocus: readonly (View | null)[] = [];
  let dialogLauncher: DialogLauncher | null = null;
  const selectedTab = signal(0);

  /** Replaces a retained launcher with its equivalent control after a state rerender. */
  const reconcileLauncher = (kind: DialogLauncherKind, view: View): void => {
    if (dialogLauncher?.kind === kind) dialogLauncher = { kind, view };
  };

  /** Returns the one-line operation feedback owned by a tab. */
  const operationFeedback = (
    tab: 'overview' | 'authentication' | 'branding',
  ): string => {
    if (state.kind !== 'ready') return 'No changes';
    if (state.pendingTabs?.includes(tab)) return 'Saving…';
    if (state.feedbackTab === tab && state.failure) {
      const failure = FAILURE_LABELS[state.failure];
      return state.reloadedAfterFailure
        ? `Reloaded after failure: ${failure}`
        : `Failed: ${failure}`;
    }
    if (state.savedTab === tab) return 'Saved';
    return 'No changes';
  };

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
    const lifecycleKind: DialogLauncherKind = 'lifecycle';
    const lifecycle = organization.status === 'suspended'
      ? new Button('~A~ctivate', {
            disabled: !canLifecycle || pending,
            onClick: () => options.onIntent({ kind: 'activate' }),
          })
      : new Button('~S~uspend', {
            disabled: !canLifecycle || organization.isSuperAdmin || pending,
            onClick: () => {
              dialogLauncher = { kind: lifecycleKind, view: lifecycle };
              options.onIntent({ kind: 'suspend' });
            },
          });
    reconcileLauncher(lifecycleKind, lifecycle);
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
        fixed(new Text(() => nameError(name()) ?? operationFeedback('overview')), 1),
        spacer(),
        fixed(row({ gap: 1 }, save, spacer(), lifecycle), 2),
      ),
    );
    currentFocus =
      canUpdate || (canLifecycle && !(organization.status === 'active' && organization.isSuperAdmin))
        ? canUpdate
          ? nameInput
          : lifecycle
        : null;
    return page;
  };

  /** Builds organization login-method defaults and password-login 2FA policy controls. */
  const authenticationPage = (
    organization: AdminOrganizationSettings,
    pending: boolean,
  ): Group => {
    const methodNames = ['password', 'magic_link'] as const;
    const policyNames = [
      'optional',
      'required_email',
      'required_totp',
      'required_any',
    ] as const;
    const initialMethods = methodNames.map((method) =>
      organization.defaultLoginMethods.includes(method),
    );
    const methods = signal([...initialMethods]);
    const initialPolicy = Math.max(0, policyNames.indexOf(organization.twoFactorPolicy));
    const policy = signal(initialPolicy);
    const methodChoices = new CheckGroup({
      labels: ['~P~assword', '~M~agic link'],
      value: methods,
    });
    const policyChoices = new RadioGroup({
      labels: [
        'Optional',
        'Required email OTP',
        'Required authenticator / TOTP',
        'Require either',
      ],
      value: policy,
    });
    const canUpdate = options.capabilities.canUpdateOrganizations;
    const enabled = canUpdate && !pending;
    methodChoices.focusable = enabled;
    policyChoices.focusable = enabled;
    for (let index = 0; index < methodNames.length; index += 1) {
      methodChoices.setItemEnabled(index, enabled);
    }
    for (let index = 0; index < policyNames.length; index += 1) {
      policyChoices.setItemEnabled(index, enabled);
    }
    const hasMethod = (): boolean => methods().some(Boolean);
    const dirty = (): boolean =>
      methods().some((value, index) => value !== initialMethods[index]) ||
      policy() !== initialPolicy;
    const save = new Button('~S~ave', {
      disabled: () => !enabled || !hasMethod() || !dirty(),
      onClick: () => {
        const selectedMethods: AdminOrganizationLoginMethod[] = methods
          .peek()
          .flatMap((selected, index) =>
          selected ? [methodNames[index]!] : [],
          );
        const twoFactorPolicy: AdminOrganizationTwoFactorPolicy = policyNames[policy.peek()]!;
        options.onIntent({
          kind: 'save-authentication',
          loginMethods: selectedMethods,
          twoFactorPolicy,
        });
      },
    });
    tabFocus = [tabFocus[0] ?? null, enabled ? methodChoices : null, tabFocus[2] ?? null];
    return tabPage(
      col(
        { gap: 0, padding: 1 },
        fixed(
          row(
            { gap: 2 },
            grow(col(fixed(new Text('Login methods'), 1), fixed(methodChoices, 2))),
            grow(col(fixed(new Text('Password-login 2FA'), 1), fixed(policyChoices, 4))),
          ),
          5,
        ),
        fixed(
          new Text(
            "OIDC clients configured to inherit use these login methods. Password-login 2FA is organization-wide and takes effect at each user's next password authentication. Magic link is passwordless: no OTP or TOTP follows.",
          ),
          4,
        ),
        fixed(
          new Text(() =>
            hasMethod()
              ? operationFeedback('authentication')
              : 'Select at least one login method before saving.',
          ),
          1,
        ),
        spacer(),
        fixed(row(save, spacer()), 2),
      ),
    );
  };

  /** Builds the four text settings and two immediate uploaded-image rows. */
  const brandingPage = (
    projection: AdminOrganizationWorkspaceProjection,
    pending: boolean,
  ): Group => {
    const organization = projection.organization;
    const values = {
      companyName: signal(organization.brandingCompanyName ?? ''),
      primaryColor: signal(organization.brandingPrimaryColor ?? ''),
      logoUrl: signal(organization.brandingLogoUrl ?? ''),
      faviconUrl: signal(organization.brandingFaviconUrl ?? ''),
    };
    const inputs = {
      companyName: new Input({
        value: values.companyName,
        maxLength: 255,
        validator: textValidator(0, 255),
      }),
      primaryColor: new Input({ value: values.primaryColor, maxLength: 7 }),
      logoUrl: new Input({ value: values.logoUrl, maxLength: 2_048 }),
      faviconUrl: new Input({ value: values.faviconUrl, maxLength: 2_048 }),
    };
    const enabled = options.capabilities.canUpdateOrganizations && !pending;
    for (const input of Object.values(inputs)) input.focusable = enabled;
    const valid = (): boolean =>
      values.companyName().trim().length <= 255 &&
      (values.primaryColor().trim().length === 0 ||
        /^#[0-9A-Fa-f]{6}$/.test(values.primaryColor().trim())) &&
      validBrandingUrl(values.logoUrl()) &&
      validBrandingUrl(values.faviconUrl());
    /** Returns the first field-specific branding validation error. */
    const validationError = (): string | undefined => {
      if (values.companyName().trim().length > 255) {
        return 'Company name must be at most 255 characters.';
      }
      const color = values.primaryColor().trim();
      if (color.length > 0 && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
        return 'Primary color must use #RRGGBB.';
      }
      if (!validBrandingUrl(values.logoUrl())) {
        return 'Fallback logo URL must use HTTPS or loopback HTTP.';
      }
      if (!validBrandingUrl(values.faviconUrl())) {
        return 'Fallback favicon URL must use HTTPS or loopback HTTP.';
      }
      return undefined;
    };
    const changes = (): Extract<
      AdminOrganizationIntent,
      { readonly kind: 'save-branding' }
    >['input'] => {
      const input: {
        companyName?: string | null;
        primaryColor?: string | null;
        logoUrl?: string | null;
        faviconUrl?: string | null;
      } = {};
      const compare = (
        key: keyof typeof input,
        next: string,
        previous: string | null,
      ): void => {
        const normalized = next.trim() || null;
        if (normalized !== previous) input[key] = normalized;
      };
      compare('companyName', values.companyName(), organization.brandingCompanyName);
      compare('primaryColor', values.primaryColor(), organization.brandingPrimaryColor);
      compare('logoUrl', values.logoUrl(), organization.brandingLogoUrl);
      compare('faviconUrl', values.faviconUrl(), organization.brandingFaviconUrl);
      return input;
    };
    const save = new Button('~S~ave', {
      disabled: () => !enabled || !valid() || Object.keys(changes()).length === 0,
      onClick: () => options.onIntent({ kind: 'save-branding', input: changes() }),
    });
    tabFocus = [tabFocus[0] ?? null, tabFocus[1] ?? null, enabled ? inputs.companyName : null];
    const assetRow = (label: string, type: 'logo' | 'favicon'): Group => {
      const asset: AdminOrganizationAsset | undefined = projection.assets.find(
        (candidate) => candidate.assetType === type,
      );
      const metadata = asset
        ? `${asset.contentType} · ${formatBytes(asset.size)} · ${formatAdminDateTime(asset.updatedAt)}`
        : `No uploaded ${label.toLowerCase()}`;
      const uploadKind: DialogLauncherKind = `${type}-upload`;
      const removeKind: DialogLauncherKind = `${type}-remove`;
      const upload = new Button(asset ? 'Replace' : 'Add', {
        disabled: !enabled,
        onClick: () => {
          dialogLauncher = { kind: uploadKind, view: upload };
          options.onIntent({ kind: 'upload-asset', assetType: type });
        },
      });
      reconcileLauncher(uploadKind, upload);
      let remove: Button | undefined;
      if (asset) {
        const action = new Button('Remove', {
          disabled: !enabled,
          onClick: () => {
            dialogLauncher = { kind: removeKind, view: action };
            options.onIntent({ kind: 'remove-asset', assetType: type });
          },
        });
        remove = action;
        reconcileLauncher(removeKind, action);
      } else if (dialogLauncher?.kind === removeKind) {
        dialogLauncher = { kind: uploadKind, view: upload };
      }
      return row(
        { gap: 1 },
        fixed(new Text(label), 8),
        grow(new Text(metadata)),
        upload,
        remove ?? false,
      );
    };
    return tabPage(
      col(
        { gap: 0, padding: 1 },
        fixed(field('Company name', inputs.companyName), 1),
        fixed(field('Primary color', inputs.primaryColor), 1),
        fixed(field('Fallback logo URL', inputs.logoUrl), 1),
        fixed(field('Fallback favicon', inputs.faviconUrl), 1),
        fixed(new Text(() => validationError() ?? operationFeedback('branding')), 1),
        fixed(row(save, spacer()), 2),
        spacer(),
        fixed(assetRow('Logo', 'logo'), 2),
        fixed(assetRow('Favicon', 'favicon'), 2),
      ),
    );
  };

  /** Renders all tabs from one retained authoritative projection. */
  const renderProjection = (projection: AdminOrganizationWorkspaceProjection): void => {
    tabFocus = [];
    const pending = state.kind === 'ready' && state.pendingTabs?.includes('overview') === true;
    const overview = overviewPage(projection.organization, pending);
    tabFocus = [currentFocus, null, null];
    const tabs: Signal<Tab[]> = signal([
      { title: 'Overview', content: overview },
      {
        title: 'Authentication',
        content: authenticationPage(
          projection.organization,
          state.kind === 'ready' && state.pendingTabs?.includes('authentication') === true,
        ),
      },
      {
        title: 'Branding',
        content: brandingPage(
          projection,
          state.kind === 'ready' && state.pendingTabs?.includes('branding') === true,
        ),
      },
    ]);
    const tabView = new TabView({ tabs, active: selectedTab });
    currentTabs = tabView;
    const status = state.kind === 'loading' ? 'Loading organization…' : undefined;
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
    currentTabs = undefined;
    tabFocus = [];
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
      const focus =
        dialogLauncher?.view ??
        (currentTabs ? tabFocus[selectedTab.peek()] ?? currentTabs.strip : currentFocus);
      if (focus) options.focusView?.(focus);
      if (state.kind === 'ready' && !state.pendingTabs?.length) dialogLauncher = null;
    },
    clear() {
      state = { kind: 'closed' };
      selectedTab.set(0);
      dialogLauncher = null;
      render();
    },
  };
}
