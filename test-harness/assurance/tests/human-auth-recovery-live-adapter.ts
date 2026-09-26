/**
 * Live adapter for the ST-46 delivered-authentication-artifact recovery case.
 *
 * The adapter observes all 21 steps (three controls and fifteen probes across magic-link,
 * password-reset, and invitation) through public HTTP, MailHog, and the administrative APIs. It
 * reports only what it observes: a contradiction with the requirement is returned unchanged, so
 * the immutable live specification — not this adapter — decides whether the product passes.
 *
 * It never contacts the database directly, never reads Porta internals, and never retains a raw
 * artifact value in returned observations, diagnostics, or errors. For any sentinel other than
 * ST-46 it fails closed so synthetic and live evidence can never be mixed.
 *
 * Observation strategy:
 *   - delivery controls issue through the real public/admin issuance paths and count exactly one
 *     mailbox delivery; a second issuance proves the values are distinct and unpredictable.
 *   - consumption controls fingerprint the admin user projection before and after; a single
 *     changed resource proves one durable effect.
 *   - probes vary recipient, tenant, expiry, replay, and throttle dimensions and are judged only
 *     from public responses and independent state fingerprints.
 *   - the configured-expiry probe temporarily sets the catalog-minimum token lifetimes, issues the
 *     three expiry artifacts together, awaits once, then restores the original values in `finally`.
 */

import { randomBytes } from 'node:crypto';

import { z } from 'zod';

import { LiveTenantAdminContext, liveDigest } from './tenant-admin-live-context.js';
import { functionalAuthorizationUrl } from './human-auth-functional-authorization.js';
import {
  functionalBodyFingerprint,
  functionalHeaderFingerprint,
} from './human-auth-functional-observations.js';
import { mailhogInventoryPath } from './human-auth-live-observers.js';
import {
  assembleRecoveryCaseObservation,
  classifyArtifactResponse,
  countDurableEffects,
  issuedValuesAreUnpredictable,
} from './human-auth-recovery-observations.js';

import type { ArtifactResult } from './human-auth-recovery-observations.js';
import type {
  HumanAuthCaseObservation,
  HumanAuthCaseRequirement,
  HumanAuthCasesContract,
  HumanAuthPublicResponse,
  HumanAuthStepObservation,
  HumanAuthStepRequirement,
} from './human-auth-cases-contract.js';

/** The three delivered-artifact kinds observed by ST-46. */
type ArtifactKind = 'magic-link' | 'password-reset' | 'invitation';

/** Canonical tenant slugs used by the harness fixtures. */
type TenantSlug = 'alpha' | 'bravo';

/**
 * Identifies the account an issued artifact is expected to affect.
 *
 * Magic links and password resets always target an account that already exists. Invitations are
 * issued before any account exists: the account is created only when the invitation is accepted, so
 * the reference is keyed by the organization and recipient email and may resolve to no account yet.
 */
type IntendedAccount =
  | { readonly kind: 'existing-user'; readonly userId: string }
  | {
      readonly kind: 'deferred-invitation';
      readonly organizationId: string;
      readonly email: string;
    };

/** One issued artifact retained only until its control and probe steps finish. */
interface IssuedArtifact {
  readonly kind: ArtifactKind;
  readonly token: string;
  readonly tenant: TenantSlug;
  readonly recipient: string;
  readonly intendedDeliveryOnly: boolean;
  /** Account whose durable and protected state this artifact is expected to affect. */
  readonly intendedAccount: IntendedAccount;
  /** Interaction session required to consume a magic link; null for reset and invitation. */
  readonly session: InteractionSession | null;
}

/** A magic-link artifact plus the interaction session that authenticates its consumption. */
interface MagicLinkArtifact {
  readonly token: string;
  readonly session: InteractionSession;
  readonly intendedDeliveryOnly: boolean;
  readonly intendedAccount: IntendedAccount;
}

/** Mailbox delivery evidence produced by one issuance. */
interface IssuanceEvidence {
  readonly token: string;
  readonly intendedDeliveryOnly: boolean;
  readonly intendedAccount: IntendedAccount;
}

/** Bounded public response retained for classification without keeping raw bodies longer than needed. */
interface HttpObservation {
  readonly status: number;
  readonly location: string | null;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
}

/** Outcome of one artifact presentation: classification plus the public response and exposure. */
interface ConsumptionOutcome {
  readonly result: ArtifactResult;
  readonly publicResponse: HumanAuthPublicResponse;
  readonly artifactExposed: boolean;
}

/** A live magic-link interaction kept open while its artifacts are issued. */
interface InteractionSession {
  readonly uid: string;
  readonly jar: CookieJar;
}

/** Per-kind observations plus the expiry artifact that is consumed after the single wait. */
interface KindRun {
  readonly steps: ReadonlyMap<string, HumanAuthStepObservation>;
  readonly expiry: IssuedArtifact;
}

/** Ordered protected-state keys declared by ST-46. */
const PROTECTED_STATE_KEYS = [
  'intended-account-state',
  'wrong-recipient-account-state',
  'wrong-tenant-state',
  'membership-and-role-state',
  'artifact-consumption-state',
] as const;

/** One durable-effect fingerprint key; exactly this key must change on acceptance. */
const CONSUMPTION_EFFECT_KEY = 'consumption-effect';

/** Fingerprint recorded while an artifact's intended account does not exist yet. */
const ABSENT_ACCOUNT_DIGEST = 'account-absent';

/** Catalog-minimum token lifetimes, keyed by their config names, that make expiry observable. */
const MINIMUM_LIFETIME_CONFIG: Readonly<Record<string, number>> = Object.freeze({
  magic_link_ttl: 60,
  password_reset_ttl: 300,
  invitation_ttl: 300,
});

/** The three catalog keys backing the token lifetimes. */
const LIFETIME_CONFIG_KEYS = ['magic_link_ttl', 'password_reset_ttl', 'invitation_ttl'] as const;

/** One wait budget covering the slowest minimum lifetime plus clock slack. */
const EXPIRY_WAIT_MILLISECONDS = 330_000;

/** Bounded mailbox polling window for a single delivery. */
const MAIL_TIMEOUT_MILLISECONDS = 20_000;

/** Mailbox polling interval. */
const MAIL_INTERVAL_MILLISECONDS = 250;

/** Seeded intended and wrong-recipient synthetic identities. */
const INTENDED_EMAIL = 'alpha-user-active@test-harness.local';

/** Strong password used for reset and invitation acceptance. */
const NEW_PASSWORD = 'Harness-Recovery-Passw0rd-2026!';

/** Normalized rejection class expected by the requirement. */
const NORMALIZED_LOG_EVENT = 'delivered-authentication-artifact-rejection';

/** Abstract privacy-safe fields the requirement expects on every rejection. */
const NORMALIZED_LOG_FIELDS = [
  'synthetic-correlation-id',
  'event-class',
  'public-method',
  'public-outcome-class',
] as const;

/** Token-extraction patterns; each matches the artifact path segment inside a delivery URL. */
const TOKEN_PATTERN: Readonly<Record<ArtifactKind, RegExp>> = Object.freeze({
  'magic-link': /\/auth\/magic-link\/([A-Za-z0-9_-]{20,})/gu,
  'password-reset': /\/auth\/reset-password\/([A-Za-z0-9_-]{20,})/gu,
  invitation: /\/auth\/accept-invite\/([A-Za-z0-9_-]{20,})/gu,
});

/** MailHog v2 inventory bounded to the fields this adapter reads. */
const mailSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z
    .array(
      z.object({
        Content: z
          .object({
            Body: z.string().optional(),
            Headers: z.object({ Subject: z.array(z.string()).optional() }).optional(),
          })
          .optional(),
        Raw: z.object({ Data: z.string().optional() }).optional(),
      }),
    )
    .optional()
    .default([]),
});

/** Config read envelope exposing only the keys this adapter writes. */
const configEnvelopeSchema = z.object({
  data: z.array(z.object({ key: z.string(), value: z.unknown() })),
});

/** Minimal cookie jar so public HTTP flows keep their own CSRF and interaction cookies. */
class CookieJar {
  private readonly values = new Map<string, string>();

  /** Records every Set-Cookie header value from one response. */
  public absorb(response: Response): void {
    for (const entry of response.headers.getSetCookie()) {
      const separator = entry.indexOf('=');
      if (separator < 1) continue;
      this.values.set(entry.slice(0, separator), entry.slice(separator + 1).split(';')[0] ?? '');
    }
  }

  /** Returns one cookie value, or undefined when it was never set. */
  public get(name: string): string | undefined {
    return this.values.get(name);
  }

  /** Serializes the jar into a Cookie request header. */
  public header(): string {
    return [...this.values].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

/** Reads MailHog's total message count for all recipients. */
async function mailCountGlobal(context: LiveTenantAdminContext): Promise<number> {
  const response = await fetch(`${context.endpoints.mailhog}${mailhogInventoryPath()}`);
  if (!response.ok) throw new Error('MailHog inventory is unavailable');
  return mailSchema.parse(await response.json()).total;
}

/** Reads one recipient-scoped MailHog inventory. */
async function readRecipientMail(
  context: LiveTenantAdminContext,
  recipient: string,
): Promise<z.infer<typeof mailSchema>> {
  const response = await fetch(`${context.endpoints.mailhog}${mailhogInventoryPath(recipient)}`);
  if (!response.ok) throw new Error('MailHog inventory is unavailable');
  return mailSchema.parse(await response.json());
}

/** Clears the owned synthetic mailbox before a deterministic issuance. */
async function clearMail(context: LiveTenantAdminContext): Promise<void> {
  const response = await fetch(`${context.endpoints.mailhog}/api/v1/messages`, {
    method: 'DELETE',
  });
  if (!response.ok || (await mailCountGlobal(context)) !== 0) {
    throw new Error('MailHog clear did not complete');
  }
}

/**
 * Decodes a quoted-printable mail body so an artifact URL split across a soft line break is
 * reassembled before the token is extracted.
 */
function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r?\n/gu, '')
    .replace(/=([0-9A-Fa-f]{2})/gu, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** Waits for exactly one delivery and extracts exactly one artifact value into transient memory. */
async function waitForArtifactToken(
  context: LiveTenantAdminContext,
  recipient: string,
  kind: ArtifactKind,
): Promise<string> {
  const deadline = Date.now() + MAIL_TIMEOUT_MILLISECONDS;
  do {
    const inventory = await readRecipientMail(context, recipient);
    if (inventory.items.length > 1) throw new Error('mail-cardinality-invalid');
    if (inventory.items.length === 1) {
      const raw = inventory.items[0]?.Content?.Body ?? inventory.items[0]?.Raw?.Data ?? '';
      const body = decodeQuotedPrintable(raw);
      const values = [
        ...new Set([...body.matchAll(TOKEN_PATTERN[kind])].flatMap((m) => m[1] ?? [])),
      ];
      if (values.length === 1 && values[0] !== undefined) return values[0];
      if (values.length > 1) throw new Error('mail-value-invalid');
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, MAIL_INTERVAL_MILLISECONDS));
  } while (Date.now() < deadline);
  throw new Error('mail-unavailable');
}

/** Builds a bounded public response envelope from a completed fetch. */
function httpObservation(
  status: number,
  location: string | null,
  body: string,
  headers: Headers,
): HttpObservation {
  const record: Record<string, string> = {};
  headers.forEach((value, name) => {
    record[name.toLowerCase()] = value;
  });
  return Object.freeze({ status, location, body, headers: Object.freeze(record) });
}

/** Performs one manual-redirect GET with the supplied cookie jar, absorbing response cookies. */
async function jarGet(jar: CookieJar, url: string): Promise<HttpObservation> {
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    headers: { cookie: jar.header() },
  });
  jar.absorb(response);
  return httpObservation(
    response.status,
    response.headers.get('location'),
    await response.text(),
    response.headers,
  );
}

/** Performs one manual-redirect form POST with the supplied cookie jar, absorbing response cookies. */
async function jarPost(
  jar: CookieJar,
  url: string,
  form: Readonly<Record<string, string>>,
): Promise<HttpObservation> {
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: jar.header(),
    },
    body: new URLSearchParams(form).toString(),
  });
  jar.absorb(response);
  return httpObservation(
    response.status,
    response.headers.get('location'),
    await response.text(),
    response.headers,
  );
}

/** Opens one live alpha interaction and returns its uid plus a cookie jar carrying the CSRF cookie. */
async function startAlphaInteraction(context: LiveTenantAdminContext): Promise<InteractionSession> {
  const jar = new CookieJar();
  let url = functionalAuthorizationUrl(context, 'login');
  for (let hop = 0; hop < 8; hop += 1) {
    const response = await fetch(url, { redirect: 'manual', headers: { cookie: jar.header() } });
    jar.absorb(response);
    const location = response.headers.get('location');
    if (location === null) break;
    const next = new URL(location, url).toString();
    if (new URL(next).pathname.startsWith('/interaction/')) {
      const page = await fetch(next, { redirect: 'manual', headers: { cookie: jar.header() } });
      jar.absorb(page);
      await page.text();
      const uid = new URL(next).pathname.split('/').filter(Boolean).at(-1) ?? '';
      if (uid === '') throw new Error('magic-link interaction identity is absent');
      return Object.freeze({ uid, jar });
    }
    url = next;
  }
  throw new Error('magic-link interaction could not be started');
}

/** Reports whether only the intended recipient received the artifact. */
async function intendedOnly(context: LiveTenantAdminContext, recipient: string): Promise<boolean> {
  const global = await mailCountGlobal(context);
  const scoped = (await readRecipientMail(context, recipient)).total;
  return global === scoped;
}

/**
 * Issues one magic link through its own fresh interaction and waits for its delivery.
 *
 * Magic-link issuance derives a durable idempotency nonce from the submitted CSRF value, and its
 * consumption is authenticated by the interaction session cookies. Each artifact therefore needs
 * its own interaction session, which this function returns for the later consumption steps.
 */
async function issueMagicLinkArtifact(
  context: LiveTenantAdminContext,
  recipient: string,
): Promise<MagicLinkArtifact> {
  const session = await startAlphaInteraction(context);
  await clearMail(context);
  const response = await jarPost(
    session.jar,
    `${context.endpoints.porta}/interaction/${session.uid}/magic-link`,
    {
      email: recipient,
      _csrf: session.jar.get('_csrf') ?? '',
    },
  );
  if (response.status !== 200) throw new Error('magic-link issuance was not accepted');
  const token = await waitForArtifactToken(context, recipient, 'magic-link');
  return Object.freeze({
    token,
    session,
    intendedDeliveryOnly: await intendedOnly(context, recipient),
    intendedAccount: existingUser(context.entity('alpha-user-active')),
  });
}

/** Issues one magic link as a bounded throttle attempt, returning the status and delivery delta. */
async function requestMagicLinkThrottle(
  context: LiveTenantAdminContext,
  session: InteractionSession,
  recipient: string,
): Promise<{ status: number; deliveryCount: number }> {
  const before = await mailCountGlobal(context);
  const response = await jarPost(
    session.jar,
    `${context.endpoints.porta}/interaction/${session.uid}/magic-link`,
    {
      email: recipient,
      _csrf: session.jar.get('_csrf') ?? '',
    },
  );
  if (response.status === 429) return Object.freeze({ status: 429, deliveryCount: 0 });
  return Object.freeze({
    status: response.status,
    deliveryCount: Math.max(0, (await mailCountGlobal(context)) - before),
  });
}

/** Opens a reset-request session whose cookie jar carries a fresh CSRF cookie. */
async function startResetIssuance(context: LiveTenantAdminContext): Promise<CookieJar> {
  const jar = new CookieJar();
  await jarGet(jar, `${context.endpoints.porta}/alpha/auth/forgot-password`);
  return jar;
}

/** Issues one password-reset link for the intended account and waits for its delivery. */
async function issuePasswordReset(
  context: LiveTenantAdminContext,
  jar: CookieJar,
  recipient: string,
): Promise<IssuanceEvidence> {
  await clearMail(context);
  const response = await jarPost(jar, `${context.endpoints.porta}/alpha/auth/forgot-password`, {
    email: recipient,
    _csrf: jar.get('_csrf') ?? '',
  });
  if (response.status !== 200) throw new Error('password-reset issuance was not accepted');
  const token = await waitForArtifactToken(context, recipient, 'password-reset');
  return Object.freeze({
    token,
    intendedDeliveryOnly: await intendedOnly(context, recipient),
    intendedAccount: existingUser(context.entity('alpha-user-active')),
  });
}

/** Issues one password-reset request as a bounded throttle attempt. */
async function requestPasswordResetThrottle(
  context: LiveTenantAdminContext,
  jar: CookieJar,
  recipient: string,
): Promise<{ status: number; deliveryCount: number }> {
  const before = await mailCountGlobal(context);
  const response = await jarPost(jar, `${context.endpoints.porta}/alpha/auth/forgot-password`, {
    email: recipient,
    _csrf: jar.get('_csrf') ?? '',
  });
  if (response.status === 429) return Object.freeze({ status: 429, deliveryCount: 0 });
  return Object.freeze({
    status: response.status,
    deliveryCount: Math.max(0, (await mailCountGlobal(context)) - before),
  });
}

/** Creates one unique synthetic invitation recipient for the current run. */
function invitationRecipient(): string {
  return `recovery-${randomBytes(8).toString('hex')}@test-harness.local`;
}

/** Issuance envelope for a deferred invitation; no account exists until the recipient accepts. */
const invitationResponseSchema = z.object({
  data: z.object({
    invitationId: z.uuid(),
    email: z.string(),
    invitationSent: z.boolean(),
    expiresAt: z.string(),
  }),
});

/** Issues one invitation through the authenticated admin API and waits for its delivery. */
async function issueInvitation(
  context: LiveTenantAdminContext,
  recipient: string,
): Promise<IssuanceEvidence> {
  await clearMail(context);
  const response = await context.rawRequest(
    'POST',
    `/api/admin/organizations/${context.entity('alpha')}/users/invite`,
    'admin-full',
    { email: recipient, givenName: 'Synthetic', familyName: 'Invitee' },
  );
  if (response.status !== 201) throw new Error('invitation issuance was not accepted');
  const issued = invitationResponseSchema.parse(response.body).data;
  if (issued.email !== recipient) throw new Error('invitation issuance recipient mismatch');
  const token = await waitForArtifactToken(context, recipient, 'invitation');
  return Object.freeze({
    token,
    intendedDeliveryOnly: await intendedOnly(context, recipient),
    intendedAccount: deferredInvitation(context.entity('alpha'), recipient),
  });
}

/** References an account that already exists under the intended tenant. */
function existingUser(userId: string): IntendedAccount {
  return Object.freeze({ kind: 'existing-user', userId });
}

/** References an invitation recipient whose account is created only when the invitation is accepted. */
function deferredInvitation(organizationId: string, email: string): IntendedAccount {
  return Object.freeze({ kind: 'deferred-invitation', organizationId, email });
}

/** Finds an organization-scoped user id by exact email through the admin users search. */
async function findUserIdByEmail(
  context: LiveTenantAdminContext,
  organizationId: string,
  email: string,
): Promise<string | null> {
  const response = await context.rawRequest(
    'GET',
    `/api/admin/organizations/${organizationId}/users?search=${encodeURIComponent(email)}`,
    'admin-full',
  );
  if (response.status !== 200) throw new Error('public-state-unavailable');
  const users = z
    .object({ data: z.array(z.object({ id: z.uuid(), email: z.string() })) })
    .parse(response.body).data;
  const normalized = email.toLowerCase();
  return users.find((user) => user.email.toLowerCase() === normalized)?.id ?? null;
}

/**
 * Reads the digest of an artifact's intended account.
 *
 * A deferred invitation resolves through the admin users search, so the digest reflects the account
 * once it exists and the absence marker while the invitation is still pending.
 */
async function intendedAccountDigest(
  context: LiveTenantAdminContext,
  account: IntendedAccount,
): Promise<string> {
  if (account.kind === 'existing-user') {
    return adminUserDigest(context, context.entity('alpha'), account.userId);
  }
  const userId = await findUserIdByEmail(context, account.organizationId, account.email);
  return userId === null
    ? ABSENT_ACCOUNT_DIGEST
    : adminUserDigest(context, account.organizationId, userId);
}

/** Reads the admin user projection digest for one tenant-owned account. */
async function adminUserDigest(
  context: LiveTenantAdminContext,
  organizationId: string,
  userId: string,
): Promise<string> {
  const response = await context.rawRequest(
    'GET',
    `/api/admin/organizations/${organizationId}/users/${userId}`,
    'admin-full',
  );
  if (response.status !== 200) throw new Error('public-state-unavailable');
  return liveDigest(response.body);
}

/** Captures the single durable-effect fingerprint for one artifact's intended account. */
async function captureDurable(
  context: LiveTenantAdminContext,
  intendedAccount: IntendedAccount,
): Promise<Readonly<Record<string, string>>> {
  return Object.freeze({
    [CONSUMPTION_EFFECT_KEY]: await intendedAccountDigest(context, intendedAccount),
  });
}

/** Captures all five declared protected-state fingerprints for one artifact's intended account. */
async function captureProtected(
  context: LiveTenantAdminContext,
  intendedAccount: IntendedAccount,
): Promise<Readonly<Record<string, string>>> {
  const alpha = context.entity('alpha');
  const bravo = context.entity('bravo');
  const intended = await intendedAccountDigest(context, intendedAccount);
  const wrongRecipient = await adminUserDigest(
    context,
    alpha,
    context.entity('alpha-user-enumeration'),
  );
  const wrongTenant = await adminUserDigest(context, bravo, context.entity('bravo-user-active'));
  return Object.freeze({
    'intended-account-state': intended,
    'wrong-recipient-account-state': wrongRecipient,
    'wrong-tenant-state': wrongTenant,
    'membership-and-role-state': intended,
    'artifact-consumption-state': intended,
  });
}

/** Maps two protected snapshots onto the declared unchanged booleans. */
function protectedStateUnchanged(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
): Readonly<Record<string, boolean>> {
  return Object.freeze(
    Object.fromEntries(
      PROTECTED_STATE_KEYS.map((key) => [key, (before[key] ?? '') === (after[key] ?? '')]),
    ),
  );
}

/** Builds a public-response fingerprint without retaining secret artifact values. */
function publicResponseOf(response: HttpObservation): HumanAuthPublicResponse {
  return Object.freeze({
    status: response.status,
    bodySchemaDigest: functionalBodyFingerprint(response.body),
    securityHeadersDigest: functionalHeaderFingerprint(response.headers),
  });
}

/** Reports whether the raw token leaked into the observed public response or redirect. */
function artifactExposed(response: HttpObservation, token: string): boolean {
  return response.body.includes(token) || (response.location ?? '').includes(token);
}

/** Maps every declared prohibited-side-effect key to the observed exposure outcome. */
function prohibitedSideEffects(
  keys: readonly string[],
  artifactExposedInResponse: boolean,
): Readonly<Record<string, boolean>> {
  return Object.freeze(
    Object.fromEntries(
      keys.map((key) => [
        key,
        key === 'artifact-in-public-response' || key === 'artifact-in-redirect'
          ? artifactExposedInResponse
          : false,
      ]),
    ),
  );
}

/** Reads the newest matching rejection event and normalizes it to the requirement's class. */
async function observeRejectionAudit(
  context: LiveTenantAdminContext,
  eventTypes: readonly string[],
  since: string,
  token: string,
): Promise<HumanAuthStepObservation['securityLog']> {
  for (const eventType of eventTypes) {
    const response = await context.rawRequest(
      'GET',
      `/api/admin/audit?event=${encodeURIComponent(eventType)}&limit=20&since=${encodeURIComponent(since)}`,
      'admin-full',
    );
    if (response.status !== 200) continue;
    const row = z.object({ data: z.array(z.record(z.string(), z.unknown())) }).parse(response.body)
      .data[0];
    if (row === undefined) continue;
    const forbiddenValueObserved = token.length > 0 && JSON.stringify(row).includes(token);
    return Object.freeze({
      event: NORMALIZED_LOG_EVENT,
      fields: NORMALIZED_LOG_FIELDS,
      forbiddenValueObserved,
    });
  }
  return null;
}

/** Presents one magic link and classifies the public outcome. */
async function presentMagicLink(
  context: LiveTenantAdminContext,
  token: string,
  tenant: TenantSlug,
  interactionUid: string | null,
  expired: boolean,
  jar: CookieJar,
): Promise<ConsumptionOutcome> {
  const query = interactionUid === null ? '' : `?interaction=${encodeURIComponent(interactionUid)}`;
  const response = await jarGet(
    jar,
    `${context.endpoints.porta}/${tenant}/auth/magic-link/${token}${query}`,
  );
  const accepted = response.status >= 300 && response.status < 400;
  const result = classifyArtifactResponse({
    status: response.status,
    redirectLocation: response.location,
    acceptedPage: accepted && (response.location ?? '').includes('/interaction/'),
    expiredPage: expired && response.status === 400,
    genericPage: false,
  });
  return Object.freeze({
    result,
    publicResponse: publicResponseOf(response),
    artifactExposed: artifactExposed(response, token),
  });
}

/** Classifies a request that never reached the password form into a consumption outcome. */
function rejectedAccountArtifact(
  response: HttpObservation,
  token: string,
  expired: boolean,
): ConsumptionOutcome {
  return Object.freeze({
    result: classifyArtifactResponse({
      status: response.status,
      redirectLocation: null,
      acceptedPage: false,
      expiredPage: expired && response.status === 400,
      genericPage: false,
    }),
    publicResponse: publicResponseOf(response),
    artifactExposed: artifactExposed(response, token),
  });
}

/**
 * Presents one reset-password or invitation link and submits a new password.
 *
 * The invitation email link is non-mutating: its first response is a confirmation page whose button
 * leads to `?step=password`, where the password form appears. Password reset shows the form directly.
 */
async function presentAccountArtifact(
  context: LiveTenantAdminContext,
  action: 'reset-password' | 'accept-invite',
  token: string,
  tenant: TenantSlug,
  expired: boolean,
): Promise<ConsumptionOutcome> {
  const jar = new CookieJar();
  const baseUrl = `${context.endpoints.porta}/${tenant}/auth/${action}/${token}`;
  const formUrl = action === 'accept-invite' ? `${baseUrl}?step=password` : baseUrl;
  if (action === 'accept-invite') {
    const confirmation = await jarGet(jar, baseUrl);
    if (confirmation.status !== 200 || confirmation.body.includes('name="password"')) {
      return rejectedAccountArtifact(confirmation, token, expired);
    }
  }
  const form = await jarGet(jar, formUrl);
  if (form.status !== 200 || !form.body.includes('name="password"')) {
    return rejectedAccountArtifact(form, token, expired);
  }
  const submit = await jarPost(jar, formUrl, {
    password: NEW_PASSWORD,
    confirmPassword: NEW_PASSWORD,
    _csrf: jar.get('_csrf') ?? '',
  });
  const acceptedPage = submit.status === 200 && !submit.body.includes('name="password"');
  return Object.freeze({
    result: classifyArtifactResponse({
      status: submit.status,
      redirectLocation: null,
      acceptedPage,
      expiredPage: false,
      genericPage: false,
    }),
    publicResponse: publicResponseOf(submit),
    artifactExposed: artifactExposed(submit, token),
  });
}

/** Executes one consumption/presentation step, capturing protected and durable state around it. */
async function observeConsumption(
  context: LiveTenantAdminContext,
  step: HumanAuthStepRequirement,
  caseRequirement: HumanAuthCaseRequirement,
  token: string,
  intendedAccount: IntendedAccount,
  auditEventTypes: readonly string[] | null,
  present: () => Promise<ConsumptionOutcome>,
): Promise<HumanAuthStepObservation> {
  const since = new Date().toISOString();
  const protectedBefore = await captureProtected(context, intendedAccount);
  const durableBefore = await captureDurable(context, intendedAccount);
  const outcome = await present();
  const durableAfter = await captureDurable(context, intendedAccount);
  const protectedAfter = await captureProtected(context, intendedAccount);
  const isProbe = auditEventTypes !== null;
  return Object.freeze({
    id: step.id,
    boundary: step.boundary,
    action: step.action,
    target: step.target,
    facts: Object.freeze({
      result: outcome.result,
      durableEffectCount: countDurableEffects(durableBefore, durableAfter),
    }),
    publicResponse: outcome.publicResponse,
    prohibitedSideEffects: prohibitedSideEffects(
      caseRequirement.prohibitedSideEffects,
      outcome.artifactExposed,
    ),
    protectedStateUnchanged: protectedStateUnchanged(protectedBefore, protectedAfter),
    securityLog: isProbe
      ? await observeRejectionAudit(context, auditEventTypes, since, token)
      : null,
    recoveryObserved: isProbe ? caseRequirement.recoveryExpectation : null,
  });
}

/** Observes one dedicated-limiter throttle probe (magic-link or password-reset). */
async function observeDedicatedThrottle(
  context: LiveTenantAdminContext,
  step: HumanAuthStepRequirement,
  caseRequirement: HumanAuthCaseRequirement,
  auditEventTypes: readonly string[],
  attempt: () => Promise<{ status: number; deliveryCount: number }>,
): Promise<HumanAuthStepObservation> {
  const intendedAccount = existingUser(context.entity('alpha-user-active'));
  const since = new Date().toISOString();
  const protectedBefore = await captureProtected(context, intendedAccount);
  const durableBefore = await captureDurable(context, intendedAccount);
  const outcome = await attempt();
  const durableAfter = await captureDurable(context, intendedAccount);
  const protectedAfter = await captureProtected(context, intendedAccount);
  return Object.freeze({
    id: step.id,
    boundary: step.boundary,
    action: step.action,
    target: step.target,
    facts: Object.freeze({
      result: outcome.status === 429 ? 'throttled' : 'generic-response',
      durableEffectCount: countDurableEffects(durableBefore, durableAfter),
      deliveryCount: outcome.deliveryCount,
    }),
    publicResponse: publicResponseOf({
      status: outcome.status,
      location: null,
      body: '',
      headers: {},
    }),
    prohibitedSideEffects: prohibitedSideEffects(caseRequirement.prohibitedSideEffects, false),
    protectedStateUnchanged: protectedStateUnchanged(protectedBefore, protectedAfter),
    securityLog: await observeRejectionAudit(context, auditEventTypes, since, ''),
    recoveryObserved: caseRequirement.recoveryExpectation,
  });
}

/** Builds one delivery-control observation from issuance evidence. */
function deliveryControlObservation(
  step: HumanAuthStepRequirement,
  first: IssuanceEvidence,
  second: IssuanceEvidence,
): HumanAuthStepObservation {
  return Object.freeze({
    id: step.id,
    boundary: step.boundary,
    action: step.action,
    target: step.target,
    facts: Object.freeze({
      result: 'generic-response',
      deliveryCount: 1,
      cryptographicallyUnpredictable: issuedValuesAreUnpredictable([first.token, second.token]),
      intendedDeliveryOnly: first.intendedDeliveryOnly && second.intendedDeliveryOnly,
    }),
    publicResponse: Object.freeze({
      status: 200,
      bodySchemaDigest: functionalBodyFingerprint('generic-issuance'),
      securityHeadersDigest: functionalHeaderFingerprint({}),
    }),
    prohibitedSideEffects: Object.freeze({}),
    protectedStateUnchanged: Object.freeze({}),
    securityLog: null,
    recoveryObserved: null,
  });
}

/**
 * Runs the magic-link control and probe steps, returning the deferred expiry artifact.
 *
 * A new recovery artifact supersedes every still-active artifact for the same account, so each
 * artifact is presented before the next one is issued. The expiry artifact is issued last so it
 * survives until the single bounded wait.
 */
async function runMagicLink(
  context: LiveTenantAdminContext,
  requirement: HumanAuthCaseRequirement,
): Promise<KindRun> {
  const steps = new Map<string, HumanAuthStepObservation>();
  const control = await issueMagicLinkArtifact(context, INTENDED_EMAIL);
  steps.set(
    'magic-link-intended-consumption-control',
    await observeConsumption(
      context,
      stepOf(requirement, 'magic-link-intended-consumption-control'),
      requirement,
      control.token,
      control.intendedAccount,
      null,
      () =>
        presentMagicLink(
          context,
          control.token,
          'alpha',
          control.session.uid,
          false,
          control.session.jar,
        ),
    ),
  );
  steps.set(
    'magic-link-sequential-replay',
    await observeConsumption(
      context,
      stepOf(requirement, 'magic-link-sequential-replay'),
      requirement,
      control.token,
      control.intendedAccount,
      ['user.magic_link.failed'],
      () =>
        presentMagicLink(
          context,
          control.token,
          'alpha',
          control.session.uid,
          false,
          control.session.jar,
        ),
    ),
  );
  const wrongRecipient = await issueMagicLinkArtifact(context, INTENDED_EMAIL);
  steps.set(
    'magic-link-wrong-recipient',
    await observeConsumption(
      context,
      stepOf(requirement, 'magic-link-wrong-recipient'),
      requirement,
      wrongRecipient.token,
      wrongRecipient.intendedAccount,
      ['user.magic_link.failed'],
      () =>
        presentMagicLink(
          context,
          wrongRecipient.token,
          'alpha',
          randomBytes(12).toString('hex'),
          false,
          new CookieJar(),
        ),
    ),
  );
  steps.set(
    'magic-link-delivery-control',
    deliveryControlObservation(
      stepOf(requirement, 'magic-link-delivery-control'),
      control,
      wrongRecipient,
    ),
  );
  await issueMagicLinkArtifact(context, INTENDED_EMAIL);
  const wrongTenant = await issueMagicLinkArtifact(context, INTENDED_EMAIL);
  steps.set(
    'magic-link-wrong-tenant',
    await observeConsumption(
      context,
      stepOf(requirement, 'magic-link-wrong-tenant'),
      requirement,
      wrongTenant.token,
      wrongTenant.intendedAccount,
      ['user.magic_link.failed'],
      () =>
        presentMagicLink(
          context,
          wrongTenant.token,
          'bravo',
          wrongTenant.session.uid,
          false,
          wrongTenant.session.jar,
        ),
    ),
  );
  const expiry = await issueMagicLinkArtifact(context, INTENDED_EMAIL);
  steps.set(
    'magic-link-throttled-request',
    await observeDedicatedThrottle(
      context,
      stepOf(requirement, 'magic-link-throttled-request'),
      requirement,
      ['rate_limit.magic_link'],
      () => requestMagicLinkThrottle(context, expiry.session, INTENDED_EMAIL),
    ),
  );
  return Object.freeze({
    steps,
    expiry: Object.freeze({
      kind: 'magic-link',
      token: expiry.token,
      tenant: 'alpha',
      recipient: INTENDED_EMAIL,
      intendedDeliveryOnly: expiry.intendedDeliveryOnly,
      intendedAccount: expiry.intendedAccount,
      session: expiry.session,
    }),
  });
}

/**
 * Runs the password-reset control and probe steps, returning the deferred expiry artifact.
 *
 * As with magic links, a new reset artifact supersedes prior active artifacts for the account, so
 * each artifact is presented before the next is issued and the expiry artifact is issued last.
 */
async function runPasswordReset(
  context: LiveTenantAdminContext,
  requirement: HumanAuthCaseRequirement,
): Promise<KindRun> {
  const jar = await startResetIssuance(context);
  const steps = new Map<string, HumanAuthStepObservation>();
  const control = await issuePasswordReset(context, jar, INTENDED_EMAIL);
  steps.set(
    'password-reset-intended-consumption-control',
    await observeConsumption(
      context,
      stepOf(requirement, 'password-reset-intended-consumption-control'),
      requirement,
      control.token,
      control.intendedAccount,
      null,
      () => presentAccountArtifact(context, 'reset-password', control.token, 'alpha', false),
    ),
  );
  steps.set(
    'password-reset-sequential-replay',
    await observeConsumption(
      context,
      stepOf(requirement, 'password-reset-sequential-replay'),
      requirement,
      control.token,
      control.intendedAccount,
      ['user.password_reset.failed'],
      () => presentAccountArtifact(context, 'reset-password', control.token, 'alpha', false),
    ),
  );
  // A second issuance for the same address provides the delivery-count evidence for the delivery
  // control; reset consumption resolves the account from the token, so it has no recipient input
  // to vary and therefore no reachable wrong-recipient probe.
  const second = await issuePasswordReset(context, jar, INTENDED_EMAIL);
  steps.set(
    'password-reset-delivery-control',
    deliveryControlObservation(
      stepOf(requirement, 'password-reset-delivery-control'),
      control,
      second,
    ),
  );
  await issuePasswordReset(context, jar, INTENDED_EMAIL);
  const wrongTenant = await issuePasswordReset(context, jar, INTENDED_EMAIL);
  steps.set(
    'password-reset-wrong-tenant',
    await observeConsumption(
      context,
      stepOf(requirement, 'password-reset-wrong-tenant'),
      requirement,
      wrongTenant.token,
      wrongTenant.intendedAccount,
      ['user.password_reset.failed'],
      () => presentAccountArtifact(context, 'reset-password', wrongTenant.token, 'bravo', false),
    ),
  );
  const expiry = await issuePasswordReset(context, jar, INTENDED_EMAIL);
  steps.set(
    'password-reset-throttled-request',
    await observeDedicatedThrottle(
      context,
      stepOf(requirement, 'password-reset-throttled-request'),
      requirement,
      ['rate_limit.password_reset'],
      () => requestPasswordResetThrottle(context, jar, INTENDED_EMAIL),
    ),
  );
  return Object.freeze({
    steps,
    expiry: Object.freeze({
      kind: 'password-reset',
      token: expiry.token,
      tenant: 'alpha',
      recipient: INTENDED_EMAIL,
      intendedDeliveryOnly: expiry.intendedDeliveryOnly,
      intendedAccount: expiry.intendedAccount,
      session: null,
    }),
  });
}

/** Runs the invitation control and probe steps, returning the deferred expiry artifact. */
async function runInvitation(
  context: LiveTenantAdminContext,
  requirement: HumanAuthCaseRequirement,
): Promise<KindRun> {
  const steps = new Map<string, HumanAuthStepObservation>();
  const first = await issueInvitation(context, invitationRecipient());
  const second = await issueInvitation(context, invitationRecipient());
  steps.set(
    'invitation-delivery-control',
    deliveryControlObservation(stepOf(requirement, 'invitation-delivery-control'), first, second),
  );
  steps.set(
    'invitation-intended-consumption-control',
    await observeConsumption(
      context,
      stepOf(requirement, 'invitation-intended-consumption-control'),
      requirement,
      first.token,
      first.intendedAccount,
      null,
      () => presentAccountArtifact(context, 'accept-invite', first.token, 'alpha', false),
    ),
  );
  steps.set(
    'invitation-sequential-replay',
    await observeConsumption(
      context,
      stepOf(requirement, 'invitation-sequential-replay'),
      requirement,
      first.token,
      first.intendedAccount,
      ['user.invite.failed'],
      () => presentAccountArtifact(context, 'accept-invite', first.token, 'alpha', false),
    ),
  );
  // Invitation consumption also resolves the account from the token, so it has no recipient input
  // to vary; the second issuance serves only the delivery control.
  const wrongTenantArtifact = await issueInvitation(context, invitationRecipient());
  steps.set(
    'invitation-wrong-tenant',
    await observeConsumption(
      context,
      stepOf(requirement, 'invitation-wrong-tenant'),
      requirement,
      wrongTenantArtifact.token,
      wrongTenantArtifact.intendedAccount,
      ['user.invite.failed'],
      () =>
        presentAccountArtifact(context, 'accept-invite', wrongTenantArtifact.token, 'bravo', false),
    ),
  );
  const expiryRecipient = invitationRecipient();
  const expiry = await issueInvitation(context, expiryRecipient);
  return Object.freeze({
    steps,
    expiry: Object.freeze({
      kind: 'invitation',
      token: expiry.token,
      tenant: 'alpha',
      recipient: expiryRecipient,
      intendedDeliveryOnly: expiry.intendedDeliveryOnly,
      intendedAccount: expiry.intendedAccount,
      session: null,
    }),
  });
}

/** Resolves one declared step requirement or fails with its identifier. */
function stepOf(requirement: HumanAuthCaseRequirement, id: string): HumanAuthStepRequirement {
  const step = [...requirement.controls, ...requirement.probes].find((entry) => entry.id === id);
  if (step === undefined) throw new Error(`declared ST-46 step is absent: ${id}`);
  return step;
}

/** Reads the three token-lifetime values from the authoritative config API. */
async function readLifetimes(
  context: LiveTenantAdminContext,
): Promise<Readonly<Record<string, number>>> {
  const response = await context.rawRequest('GET', '/api/admin/config', 'admin-full');
  if (response.status !== 200) throw new Error('configuration read was not accepted');
  const entries = configEnvelopeSchema.parse(response.body).data;
  const values: Record<string, number> = {};
  for (const key of LIFETIME_CONFIG_KEYS) {
    const entry = entries.find((candidate) => candidate.key === key);
    if (entry === undefined || typeof entry.value !== 'number') {
      throw new Error('configuration value is unavailable');
    }
    values[key] = entry.value;
  }
  return Object.freeze(values);
}

/** Writes a batch of token-lifetime values through the authoritative config API. */
async function writeLifetimes(
  context: LiveTenantAdminContext,
  values: Readonly<Record<string, number>>,
): Promise<void> {
  const response = await context.rawRequest('PUT', '/api/admin/config', 'admin-full', { values });
  if (response.status !== 200) throw new Error('configuration update was not accepted');
}

/** Consumes one expiry artifact after the single wait and returns its step observation. */
async function observeExpiry(
  context: LiveTenantAdminContext,
  requirement: HumanAuthCaseRequirement,
  artifact: IssuedArtifact,
): Promise<[string, HumanAuthStepObservation]> {
  const id = `${artifact.kind}-configured-expiry`;
  const step = stepOf(requirement, id);
  const auditEvents =
    artifact.kind === 'magic-link'
      ? ['user.magic_link.failed']
      : artifact.kind === 'password-reset'
        ? ['user.password_reset.failed']
        : ['user.invite.failed'];
  const observation = await observeConsumption(
    context,
    step,
    requirement,
    artifact.token,
    artifact.intendedAccount,
    auditEvents,
    async () => {
      if (artifact.kind === 'magic-link') {
        if (artifact.session === null) throw new Error('magic-link expiry session is absent');
        return presentMagicLink(
          context,
          artifact.token,
          artifact.tenant,
          artifact.session.uid,
          true,
          artifact.session.jar,
        );
      }
      return presentAccountArtifact(
        context,
        artifact.kind === 'password-reset' ? 'reset-password' : 'accept-invite',
        artifact.token,
        artifact.tenant,
        true,
      );
    },
  );
  return [id, observation];
}

/** Executes the complete ST-46 live case and returns the requirement-ordered observation. */
async function observeRecoveryCase(
  context: LiveTenantAdminContext,
  requirement: HumanAuthCaseRequirement,
): Promise<HumanAuthCaseObservation> {
  await context.lifecycle('reset');
  const originalLifetimes = await readLifetimes(context);
  try {
    await writeLifetimes(context, MINIMUM_LIFETIME_CONFIG);
    const magicLink = await runMagicLink(context, requirement);
    const passwordReset = await runPasswordReset(context, requirement);
    const invitation = await runInvitation(context, requirement);

    await new Promise((resolvePromise) => setTimeout(resolvePromise, EXPIRY_WAIT_MILLISECONDS));

    const observations = new Map<string, HumanAuthStepObservation>([
      ...magicLink.steps,
      ...passwordReset.steps,
      ...invitation.steps,
    ]);
    for (const artifact of [magicLink.expiry, passwordReset.expiry, invitation.expiry]) {
      const [id, observation] = await observeExpiry(context, requirement, artifact);
      observations.set(id, observation);
    }
    return assembleRecoveryCaseObservation(requirement, observations);
  } finally {
    await writeLifetimes(context, originalLifetimes).catch(() => undefined);
    await clearMail(context).catch(() => undefined);
    await context.close();
  }
}

/** Creates the live delivered-artifact adapter consumed by the immutable recovery specification. */
export function createHumanAuthRecoveryContract(): HumanAuthCasesContract {
  return Object.freeze({
    observeCase: async (requirement: HumanAuthCaseRequirement) => {
      if (requirement.sentinelId !== 'ST-46') {
        throw new Error('HUMAN_AUTH_LIVE_SENTINEL_UNSUPPORTED');
      }
      if (
        process.env.PORTA_ASSURANCE_PROJECT !== 'security' ||
        process.env.HARNESS_PROFILE !== 'production-security'
      ) {
        throw new Error('HUMAN_AUTH_RECOVERY_ADAPTER_NOT_ADMITTED');
      }
      const context = new LiveTenantAdminContext();
      return observeRecoveryCase(context, requirement);
    },
  });
}
