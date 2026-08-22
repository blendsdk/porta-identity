/** Stable failure marker used while live magic-link correction observations are unavailable. */
export const MAGIC_LINK_LIVE_AUTHORITY_CORRECTION_CAPABILITY_MISSING =
  'MAGIC_LINK_LIVE_AUTHORITY_CORRECTION_CAPABILITY_MISSING';

/** Closed live-authority states arranged independently from public callback handling. */
export type LiveInteractionAuthorityState = 'matching' | 'missing' | 'foreign-client';

/** Immutable security rules for callback authority, delivery, throttling, and diagnostics. */
export interface MagicLinkLiveAuthorityCorrectionOracle {
  /** Exact interaction states which must be rejected without durable mutation. */
  readonly rejectedLiveAuthorities: readonly ['missing', 'foreign-client'];
  /** Callback throttling rules applied before artifact lookup or consumption. */
  readonly callbackLimit: {
    /** Maximum admitted attempts for one tenant, socket peer, and protected artifact identity. */
    readonly admittedAttempts: 5;
    /** Whether another socket peer has an independent budget for the same tenant and artifact. */
    readonly isolatesSocketPeers: true;
    /** Whether limiter unavailability may fail open. */
    readonly unavailableAllowsAttempt: false;
  };
  /** Standalone delivery rules for artifacts without interaction authority. */
  readonly standaloneDelivery: {
    /** Whether a standalone URL may contain an interaction query field. */
    readonly includesInteractionQuery: false;
    /** Successful uses permitted for the delivered artifact. */
    readonly successfulUses: 1;
  };
  /** Protected values forbidden from serialized operational output. */
  readonly forbiddenOperationalValues: readonly [
    'artifact',
    'email',
    'interaction',
    'user',
    'organization',
  ];
}

/** Frozen oracle which cannot drift with the callback implementation. */
export const MAGIC_LINK_LIVE_AUTHORITY_CORRECTION_ORACLE = Object.freeze({
  rejectedLiveAuthorities: ['missing', 'foreign-client'],
  callbackLimit: {
    admittedAttempts: 5,
    isolatesSocketPeers: true,
    unavailableAllowsAttempt: false,
  },
  standaloneDelivery: {
    includesInteractionQuery: false,
    successfulUses: 1,
  },
  forbiddenOperationalValues: ['artifact', 'email', 'interaction', 'user', 'organization'],
} as const satisfies MagicLinkLiveAuthorityCorrectionOracle);

/** Test-owned values arranged outside the callback implementation. */
export interface MagicLinkLiveAuthorityFixture {
  /** Organization which owns the user and artifact. */
  readonly organizationId: string;
  /** Different organization which owns the foreign client. */
  readonly foreignOrganizationId: string;
  /** User protected by the artifact. */
  readonly userId: string;
  /** Intended recipient retained only for output redaction checks. */
  readonly email: string;
  /** Plaintext artifact retained only for public presentation and redaction checks. */
  readonly artifact: string;
  /** Exact interaction persisted with the artifact. */
  readonly interactionUid: string;
}

/** Public callback result without template text or protected identifiers. */
export interface MagicLinkLiveAuthorityOutcome {
  /** Whether the callback produced an authenticated or standalone success. */
  readonly accepted: boolean;
  /** Stable status/content classification visible to an unauthenticated caller. */
  readonly responseShape: string;
  /** Generic rejection discriminator, or null after success. */
  readonly genericFailure: string | null;
}

/** Independently observed durable, cache, delivery, and diagnostic state. */
export interface MagicLinkLiveAuthorityObservation {
  /** Number of durable artifact consumptions. */
  readonly artifactConsumptions: number;
  /** Number of account login mutations. */
  readonly accountMutations: number;
  /** Number of successful durable audit events. */
  readonly successfulAuditEvents: number;
  /** Number of continuation writes. */
  readonly continuationWrites: number;
  /** Number of intended-recipient messages. */
  readonly intendedDeliveries: number;
  /** Sanitized URL extracted from the intended delivery. */
  readonly deliveredUrl: string | null;
  /** Serialized output captured from the production logger boundary. */
  readonly operationalOutput: readonly string[];
}

/** Service-backed driver used by the immutable correction specification. */
export interface MagicLinkLiveAuthorityCorrectionDriver {
  /** Arrange one interaction-bound artifact and its matching live authority. */
  resetBound(): Promise<MagicLinkLiveAuthorityFixture>;
  /** Replace the live provider authority without changing the persisted artifact UID. */
  setLiveAuthority(state: LiveInteractionAuthorityState): Promise<void>;
  /** Present the arranged artifact through the public callback from one direct socket peer. */
  present(input?: { readonly socketPeer?: string }): Promise<MagicLinkLiveAuthorityOutcome>;
  /** Arrange one token value that is absent until explicitly activated. */
  resetCallbackLimit(): Promise<MagicLinkLiveAuthorityFixture>;
  /** Insert the previously absent artifact without changing its callback-limit identity. */
  activateCallbackArtifact(): Promise<void>;
  /** Make the callback limiter unavailable without changing durable artifact state. */
  disableCallbackLimiter(): Promise<void>;
  /** Deliver a standalone artifact through the production recovery processor and intended mailbox. */
  deliverStandalone(): Promise<MagicLinkLiveAuthorityFixture>;
  /** Invoke both request and continuation failures through the production logger. */
  exerciseOperationalFailures(): Promise<void>;
  /** Read state independently from public responses and product expectations. */
  observe(): Promise<MagicLinkLiveAuthorityObservation>;
}

/** Available capability backed by production services and independent observers. */
export interface LiveMagicLinkAuthorityCorrectionCapability {
  /** Discriminator admitting the behavioral tests. */
  readonly available: true;
  /** Fixed evidence boundary excluding a requirements-only simulation. */
  readonly evidenceBoundary: 'public-actions-production-logger-and-owned-services';
  /** Create one isolated service-backed driver. */
  createDriver(): Promise<MagicLinkLiveAuthorityCorrectionDriver>;
}

/** Unavailable capability used before the production-backed adapter exists. */
export interface UnavailableMagicLinkAuthorityCorrectionCapability {
  /** Discriminator which prevents accidental behavioral credit. */
  readonly available: false;
  /** Stable reason asserted by the required-mode RED. */
  readonly reason: typeof MAGIC_LINK_LIVE_AUTHORITY_CORRECTION_CAPABILITY_MISSING;
}

/** Closed capability union consumed by the immutable specification. */
export type MagicLinkLiveAuthorityCorrectionCapability =
  LiveMagicLinkAuthorityCorrectionCapability | UnavailableMagicLinkAuthorityCorrectionCapability;
