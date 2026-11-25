/**
 * Porta-rendered device authorization pages and outcome audit.
 *
 * node-oidc-provider owns the device protocol, but its default pages are
 * unbranded and load external fonts. These hooks replace only the rendering
 * and audit boundary; the provider still owns the XSRF check, code state,
 * login, 2FA and consent.
 *
 * The input hook also handles every re-render state (unknown, expired, used or
 * aborted codes) with one generic invalid-or-expired message. It never renders
 * the provider's raw error, the device code, an IP address or a user agent.
 */

import { createHash } from 'node:crypto';
import {
  DEFAULT_BRANDING_PRIMARY_COLOR,
  resolveEffectiveBranding,
  type EffectiveBranding,
} from '../auth/effective-branding.js';
import { getTranslationFunction, resolveLocale } from '../auth/i18n.js';
import { renderPage } from '../auth/template-engine.js';
import { writeAuditLogStrict } from '../lib/audit-log.js';
import { logger } from '../lib/logger.js';
import { getRedis } from '../lib/redis.js';
import { buildUserCodeKey } from '../middleware/device-rate-limit-keys.js';
import { resetRateLimit } from '../auth/rate-limiter.js';
import { buildHtmlCsp } from '../middleware/security-headers.js';
import { getOrganizationById } from '../organizations/service.js';
import type { Organization } from '../organizations/types.js';
import { getClientByClientId } from '../clients/service.js';
import { getUserById } from '../users/service.js';
import { DEVICE_CODE_AUDIT_WINDOW_SECONDS, purgeExpired } from './postgres-adapter.js';

/** Maximum number of scopes rendered on a confirmation or success page. */
const MAX_RENDERED_SCOPES = 64;

/** Maximum scope token length retained from provider state. */
const MAX_SCOPE_LENGTH = 255;

/** Generic message used by the fallback renderer when the template engine fails. */
const FALLBACK_HTML =
  '<!DOCTYPE html><html><body><h1>Device authorization</h1><p>The request could not be displayed. Try again.</p></body></html>';

/** Default branding used only when no organization can be resolved. */
const DEFAULT_BRANDING: EffectiveBranding = {
  logoUrl: null,
  faviconUrl: null,
  primaryColor: DEFAULT_BRANDING_PRIMARY_COLOR,
  companyName: 'Porta',
  customCss: null,
  imageSources: [],
};

/** Return true only for a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Read one record-valued property. */
function readRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const child = value[key];
  return isRecord(child) ? child : undefined;
}

/** Read one non-empty string property. */
function readString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const child = value[key];
  return typeof child === 'string' && child.length > 0 ? child : undefined;
}

/** Read a bounded, deduplicated scope string. */
export function readProviderScopes(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const seen = new Set<string>();
  const scopes: string[] = [];
  for (const scope of value.split(/\s+/)) {
    if (!scope) continue;
    const bounded = scope.slice(0, MAX_SCOPE_LENGTH);
    if (!seen.has(bounded)) {
      seen.add(bounded);
      scopes.push(bounded);
    }
    if (scopes.length >= MAX_RENDERED_SCOPES) break;
  }
  return scopes;
}

/** Read scopes from either an approved DeviceCode or its requested params. */
function deviceCodeScopes(code: unknown): string[] {
  const direct = readString(code, 'scope');
  if (direct !== undefined) return readProviderScopes(direct);
  const params = readRecord(code, 'params');
  return readProviderScopes(params?.['scope']);
}

/** Read the client display name without trusting a missing or malformed value. */
function clientName(value: unknown): string {
  const direct = readString(value, 'clientName');
  if (direct !== undefined) return direct;
  if (isRecord(value)) {
    const metadata = value['metadata'];
    if (typeof metadata === 'function') {
      const result: unknown = Reflect.apply(metadata, value, []);
      const name = readString(result, 'client_name') ?? readString(result, 'clientName');
      if (name !== undefined) return name;
    }
  }
  return readString(value, 'clientId') ?? '';
}

/** Extract the provider XSRF value from its trusted form markup. */
export function extractProviderXsrf(form: unknown): string {
  if (typeof form !== 'string') return '';
  const match = /name="xsrf"\s+value="([^"]+)"/.exec(form);
  return match?.[1] ?? '';
}

/** Read the provider action URL, falling back to the organization device route. */
function codeVerificationAction(oidc: Record<string, unknown> | undefined, orgSlug: string): string {
  const urlFor = oidc?.['urlFor'];
  if (typeof urlFor === 'function') {
    const value: unknown = Reflect.apply(urlFor, oidc, ['code_verification']);
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return `/${orgSlug}/device`;
}

/** Set one response header through the provider context without a broad cast. */
function setHeader(ctx: unknown, name: string, value: string): void {
  if (!isRecord(ctx)) return;
  const set = ctx['set'];
  if (typeof set === 'function') Reflect.apply(set, ctx, [name, value]);
}

/** Replace the response body and content type through the provider context. */
function setHtmlBody(ctx: unknown, html: string): void {
  if (!isRecord(ctx)) return;
  Reflect.set(ctx, 'type', 'text/html; charset=utf-8');
  Reflect.set(ctx, 'body', html);
}

/** Render a minimal safe page when the template engine is unavailable. */
function renderFallback(ctx: unknown): void {
  setHeader(ctx, 'Content-Security-Policy', buildHtmlCsp([]));
  setHtmlBody(ctx, FALLBACK_HTML);
}

/** Resolve the provider hook context into the records the pages read. */
interface DevicePageContext {
  readonly raw: Record<string, unknown>;
  readonly oidc?: Record<string, unknown>;
  readonly client?: Record<string, unknown>;
  readonly deviceCode?: Record<string, unknown>;
  readonly session?: Record<string, unknown>;
  readonly requestOrganization?: unknown;
  readonly headers?: Record<string, unknown>;
  readonly ip?: string;
}

/** Build the normalized page context. */
function readDevicePageContext(ctx: unknown): DevicePageContext {
  const raw = isRecord(ctx) ? ctx : {};
  const oidc = readRecord(raw, 'oidc');
  return {
    raw,
    oidc,
    client: readRecord(oidc, 'client'),
    deviceCode: readRecord(oidc, 'deviceCode'),
    session: readRecord(oidc, 'session'),
    // The rate-limit page runs on the outer Koa context, where the tenant resolver stores the
    // organization on `state`; provider hooks receive it on the raw request instead.
    requestOrganization:
      readRecord(raw, 'req')?.['_portaOrganization'] ??
      readRecord(raw, 'state')?.['organization'],
    headers: readRecord(raw, 'headers'),
    ip: readString(readRecord(raw, 'req'), '_portaRequestIp') ?? readString(raw, 'ip'),
  };
}

/**
 * Resolve the organization for a device page.
 *
 * The URL tenant is the primary strategy because the device binding already
 * proved the code belongs to it. The loaded client and the authenticated
 * session are fallbacks for provider-driven states such as the success page.
 */
async function resolvePageOrganization(context: DevicePageContext): Promise<Organization | undefined> {
  const requestOrgId = readString(context.requestOrganization, 'id');
  if (requestOrgId !== undefined) {
    const org = await getOrganizationById(requestOrgId);
    if (org) return org;
  }

  const clientOrgId = readString(context.client, 'organizationId');
  if (clientOrgId !== undefined) {
    const org = await getOrganizationById(clientOrgId);
    if (org) return org;
  }

  const deviceClientId = readString(context.deviceCode, 'clientId');
  if (deviceClientId !== undefined) {
    const client = await getClientByClientId(deviceClientId);
    if (client) {
      const org = await getOrganizationById(client.organizationId);
      if (org) return org;
    }
  }

  const accountId = readString(context.session, 'accountId');
  if (accountId !== undefined) {
    const user = await getUserById(accountId);
    if (user) {
      const org = await getOrganizationById(user.organizationId);
      if (org) return org;
    }
  }

  return undefined;
}

/** Build the common branding, locale and translation context. */
async function resolvePageShell(
  context: DevicePageContext,
): Promise<{
  organization: Organization | undefined;
  branding: EffectiveBranding;
  locale: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}> {
  const organization = await resolvePageOrganization(context);
  const branding = organization === undefined
    ? DEFAULT_BRANDING
    : await resolveEffectiveBranding(organization);
  const acceptLanguage = readString(context.headers, 'accept-language');
  const locale = await resolveLocale(undefined, acceptLanguage, organization?.defaultLocale ?? '');
  return {
    organization,
    branding,
    locale,
    t: getTranslationFunction(locale, organization?.slug),
  };
}

/** Title key for each device page. */
const DEVICE_PAGE_TITLES = {
  'device-code': 'device.title',
  'device-confirm': 'device.confirm_title',
  'device-success': 'device.success_title',
} as const;

/** Shared branding, locale and translation context for one device page. */
type DevicePageShell = Awaited<ReturnType<typeof resolvePageShell>>;

/** Render one device page with a previously resolved shell. */
async function renderDevicePageWithShell(
  context: DevicePageContext,
  shell: DevicePageShell,
  page: keyof typeof DEVICE_PAGE_TITLES,
  data: Record<string, unknown>,
): Promise<void> {
  const html = await renderPage(page, {
    branding: shell.branding,
    locale: shell.locale,
    t: shell.t,
    pageTitle: shell.t(DEVICE_PAGE_TITLES[page]),
    csrfToken: '',
    orgSlug: shell.organization?.slug ?? '',
    ...data,
  });
  setHeader(context.raw, 'Content-Security-Policy', buildHtmlCsp(shell.branding.imageSources));
  setHtmlBody(context.raw, html);
}

/** Render one device page with the shared shell. */
async function renderDevicePage(
  context: DevicePageContext,
  page: keyof typeof DEVICE_PAGE_TITLES,
  data: Record<string, unknown>,
): Promise<void> {
  const shell = await resolvePageShell(context);
  await renderDevicePageWithShell(context, shell, page, data);
}

/** Hash the device-code `jti` for the audit idempotency key. */
function auditJtiDigest(jti: string): string {
  return createHash('sha256').update('porta:device-audit:v1\0').update(jti).digest('hex').slice(0, 16);
}

/**
 * Build the Redis marker for one device audit outcome.
 *
 * @param kind - Authorized or denied event family
 * @param jti - Opaque DeviceCode identifier
 * @returns Privacy-safe marker key
 */
export function deviceAuditMarker(kind: 'authorized' | 'denied', jti: string): string {
  return `audit:device-${kind}:${auditJtiDigest(jti)}`;
}

/**
 * Classify a provider re-render error as a real user decision.
 *
 * @param error - Value thrown by the provider
 * @returns `aborted` for a direct abort, `denied` for a denial with a cause, otherwise undefined
 */
export function classifyDeviceDenial(error: unknown): 'denied' | 'aborted' | undefined {
  if (readErrorProperty(error, 'name') !== 'AbortedError') return undefined;
  return readErrorProperty(error, 'cause') === undefined ? 'aborted' : 'denied';
}

/** Write at most one authorized event for one device code. */
async function writeAuthorizedAudit(
  context: DevicePageContext,
  organization: Organization | undefined,
  code: Record<string, unknown>,
): Promise<void> {
  const jti = readString(code, 'jti');
  if (jti === undefined) return;

  const marker = deviceAuditMarker('authorized', jti);
  let first = true;
  try {
    first = (await getRedis().set(marker, '1', 'EX', DEVICE_CODE_AUDIT_WINDOW_SECONDS, 'NX')) === 'OK';
  } catch (error) {
    // Without Redis the event is still written; a duplicate is preferable to a missing approval row.
    logger.warn({ err: error }, 'Device audit idempotency marker unavailable');
  }
  if (!first) return;

  try {
    await writeAuditLogStrict({
      organizationId: organization?.id,
      userId: readString(context.session, 'accountId') ?? readString(code, 'accountId'),
      eventType: 'user.device.authorized',
      eventCategory: 'authentication',
      description: 'Device authorization approved',
      metadata: {
        clientId: readString(code, 'clientId'),
        scopes: deviceCodeScopes(code),
      },
    });
  } catch (error) {
    try {
      await getRedis().del(marker);
    } catch {
      // Best effort: the marker expires with the DeviceCode retention.
    }
    logger.warn({ err: error }, 'Device authorized audit write failed');
  }
}

/** Resolve a DeviceCode record from the provider context for the denial audit. */
async function resolveAuditDeviceCode(context: DevicePageContext): Promise<Record<string, unknown> | undefined> {
  if (context.deviceCode !== undefined) return context.deviceCode;

  const interaction = readRecord(context.oidc, 'entities')?.['Interaction'];
  const jti = readString(interaction, 'deviceCode');
  if (jti === undefined) return undefined;

  const provider = readRecord(context.oidc, 'provider');
  const model = provider?.['DeviceCode'];
  if (model === null || (typeof model !== 'object' && typeof model !== 'function')) {
    return undefined;
  }
  const find = Reflect.get(model, 'find');
  if (typeof find !== 'function') return undefined;
  const result: unknown = await Reflect.apply(find, model, [
    jti,
    { ignoreExpiration: true, ignoreSessionBinding: true },
  ]);
  return isRecord(result) ? result : undefined;
}

/** Read a property from a thrown error without assuming an Error instance. */
function readErrorProperty(error: unknown, key: string): unknown {
  if (!isRecord(error)) return undefined;
  return error[key];
}

/**
 * Write one denied event for a real user abort or consent denial.
 *
 * Provider re-render errors for unknown, expired or already-used codes are not
 * user decisions and never create a denial row.
 */
async function writeDeniedAudit(context: DevicePageContext, error: unknown): Promise<void> {
  const reason = classifyDeviceDenial(error);
  if (reason === undefined) return;

  const code = await resolveAuditDeviceCode(context);
  if (code === undefined) return;
  const organization = await resolvePageOrganization(context);

  const jti = readString(code, 'jti');
  const marker = jti === undefined ? undefined : deviceAuditMarker('denied', jti);
  if (marker !== undefined) {
    let first = true;
    try {
      first = (await getRedis().set(marker, '1', 'EX', DEVICE_CODE_AUDIT_WINDOW_SECONDS, 'NX')) === 'OK';
    } catch (markerError) {
      logger.warn({ err: markerError }, 'Device denial audit marker unavailable');
    }
    if (!first) return;
  }

  try {
    await writeAuditLogStrict({
      organizationId: organization?.id,
      userId: readString(context.session, 'accountId') ?? readString(code, 'accountId'),
      eventType: 'user.device.denied',
      eventCategory: 'authentication',
      description: 'Device authorization denied',
      metadata: {
        clientId: readString(code, 'clientId'),
        scopes: deviceCodeScopes(code),
        reason,
      },
    });
  } catch (auditError) {
    if (marker !== undefined) {
      try {
        await getRedis().del(marker);
      } catch {
        // The marker expires with the DeviceCode retention.
      }
    }
    logger.warn({ err: auditError }, 'Device denied audit write failed');
  }
}

/**
 * Render the code-entry page, including every generic invalid state.
 *
 * @param ctx - Provider hook context
 * @param form - Trusted provider form containing the XSRF value
 * @param out - Provider error details (never rendered)
 * @param err - Provider re-render error, when present
 */
export async function userCodeInputSourceHook(
  ctx: unknown,
  form: unknown,
  out?: unknown,
  err?: unknown,
): Promise<void> {
  const context = readDevicePageContext(ctx);
  try {
    await writeDeniedAudit(context, err);
    const organization = await resolvePageOrganization(context);
    const action = codeVerificationAction(context.oidc, organization?.slug ?? '');
    const invalid = err !== undefined || readString(out, 'error') !== undefined;
    await renderDevicePage(context, 'device-code', {
      device: {
        action,
        xsrf: extractProviderXsrf(form),
        invalid,
        rateLimited: false,
      },
    });
  } catch (renderError) {
    logger.error({ err: renderError }, 'Failed to render device code page');
    renderFallback(ctx);
  }
}

/**
 * Render the confirmation page with the client, code and requested scopes.
 *
 * @param ctx - Provider hook context
 * @param form - Trusted provider form containing the XSRF value
 * @param client - Loaded provider client
 * @param _deviceInfo - Empty device metadata (unused)
 * @param userCode - Denormalized user code shown on the device
 */
export async function userCodeConfirmSourceHook(
  ctx: unknown,
  form: unknown,
  client: unknown,
  _deviceInfo?: unknown,
  userCode?: unknown,
): Promise<void> {
  const context = readDevicePageContext(ctx);
  try {
    // Approval/login entry is the only point that performs opportunistic cleanup.
    purgeExpired();
    const shell = await resolvePageShell(context);
    const scopes = deviceCodeScopes(context.deviceCode).map((scope) =>
      shell.t(`consent.scope_${scope}`, { defaultValue: scope }),
    );
    await renderDevicePageWithShell(context, shell, 'device-confirm', {
      device: {
        action: codeVerificationAction(context.oidc, shell.organization?.slug ?? ''),
        xsrf: extractProviderXsrf(form),
        userCode: typeof userCode === 'string' ? userCode : '',
        clientName: clientName(client ?? context.client),
        scopes,
      },
    });
  } catch (renderError) {
    logger.error({ err: renderError }, 'Failed to render device confirmation page');
    renderFallback(ctx);
  }
}

/**
 * Render the success page, write the authorized audit and clear the primary user-code budget.
 *
 * @param ctx - Provider hook context
 */
export async function deviceSuccessSourceHook(ctx: unknown): Promise<void> {
  const context = readDevicePageContext(ctx);
  try {
    purgeExpired();
    const organization = await resolvePageOrganization(context);
    if (context.deviceCode !== undefined) {
      await writeAuthorizedAudit(context, organization, context.deviceCode);
    }

    const sessionUid = readString(context.session, 'uid');
    if (organization !== undefined && context.ip !== undefined) {
      await resetRateLimit(buildUserCodeKey(organization.id, context.ip, sessionUid));
    }

    const deviceClientId = readString(context.deviceCode, 'clientId');
    const loadedClient = context.client
      ?? (deviceClientId === undefined ? undefined : await getClientByClientId(deviceClientId))
      ?? undefined;

    await renderDevicePage(context, 'device-success', {
      device: {
        clientName: clientName(loadedClient),
      },
    });
  } catch (renderError) {
    logger.error({ err: renderError }, 'Failed to render device success page');
    renderFallback(ctx);
  }
}

/**
 * Render the branded user-code rate-limit page and set its retry header.
 *
 * @param ctx - Koa request context
 * @param retryAfter - Seconds until another attempt is allowed
 */
export async function renderDeviceRateLimitedPage(ctx: unknown, retryAfter: number): Promise<void> {
  const context = readDevicePageContext(ctx);
  setHeader(ctx, 'Retry-After', String(retryAfter));
  setHeader(ctx, 'Cache-Control', 'no-store');
  setHeader(ctx, 'Pragma', 'no-cache');
  try {
    await renderDevicePage(context, 'device-code', {
      device: {
        action: '',
        xsrf: '',
        invalid: false,
        rateLimited: true,
        retryAfter,
      },
    });
  } catch (renderError) {
    logger.error({ err: renderError }, 'Failed to render device rate-limit page');
    renderFallback(ctx);
  }
}
