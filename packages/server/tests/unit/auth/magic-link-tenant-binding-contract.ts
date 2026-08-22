/** Stable failure text used when the behavioral authority capability is unavailable. */
export const MAGIC_LINK_TENANT_BINDING_CAPABILITY_MISSING =
  'MAGIC_LINK_TENANT_BINDING_CAPABILITY_MISSING';

/** Immutable requirement-derived authority rules for magic-link presentation and continuation use. */
export interface MagicLinkTenantBindingOracle {
  /** Ordered behavioral scenarios protected by this immutable specification. */
  readonly specificationCases: readonly [
    'foreign-route-rejects-before-mutation',
    'exact-bound-presentation-succeeds-once',
    'stored-interaction-is-authoritative',
    'standalone-rejects-supplied-interaction',
    'consumed-artifact-cannot-replay',
    'concurrent-exact-continuation-consume-is-single-use',
    'mismatched-continuation-consume-preserves-key',
  ];
  /** Artifact and user authority must agree with the route organization before mutation. */
  readonly artifactAuthority: {
    /** Whether the route organization must equal the persisted artifact organization. */
    readonly routeOrganizationMatchesArtifact: true;
    /** Whether the resolved user organization must equal the persisted artifact organization. */
    readonly artifactOrganizationMatchesUser: true;
    /** Whether a mismatched presentation may consume the artifact. */
    readonly mismatchConsumesArtifact: false;
  };
  /** Interaction-bound and standalone artifact rules. */
  readonly interactionAuthority: {
    /** Whether a bound artifact requires its exact persisted interaction identifier. */
    readonly boundArtifactRequiresExactPersistedUid: true;
    /** Whether the persisted interaction client must belong to the route organization. */
    readonly interactionClientMatchesRouteOrganization: true;
    /** Whether a supplied interaction identifier is valid for a standalone artifact. */
    readonly standaloneAcceptsSuppliedUid: false;
    /** Whether the transport query value can replace persisted interaction authority. */
    readonly queryOverridesPersistedAuthority: false;
  };
  /** Exact durable and continuation single-use rules. */
  readonly singleUse: {
    /** Number of successful presentations allowed for one artifact. */
    readonly successfulArtifactPresentations: 1;
    /** Number of successful exact continuation consumers allowed for one key. */
    readonly successfulExactContinuationConsumers: 1;
    /** Whether a mismatched continuation consume preserves the continuation. */
    readonly mismatchPreservesContinuation: true;
  };
  /** Failure outcomes must remain generic and avoid protected values in logs. */
  readonly privacy: {
    /** Whether public failures disclose a reason specific to authority mismatch. */
    readonly failureIsGeneric: true;
    /** Values which never appear in operational output. */
    readonly forbiddenLogValues: readonly ['token', 'email', 'raw-interaction'];
  };
}

/** Frozen runtime oracle used to prevent authority requirements from drifting with the implementation. */
export const MAGIC_LINK_TENANT_BINDING_ORACLE = Object.freeze({
  specificationCases: [
    'foreign-route-rejects-before-mutation',
    'exact-bound-presentation-succeeds-once',
    'stored-interaction-is-authoritative',
    'standalone-rejects-supplied-interaction',
    'consumed-artifact-cannot-replay',
    'concurrent-exact-continuation-consume-is-single-use',
    'mismatched-continuation-consume-preserves-key',
  ],
  artifactAuthority: {
    routeOrganizationMatchesArtifact: true,
    artifactOrganizationMatchesUser: true,
    mismatchConsumesArtifact: false,
  },
  interactionAuthority: {
    boundArtifactRequiresExactPersistedUid: true,
    interactionClientMatchesRouteOrganization: true,
    standaloneAcceptsSuppliedUid: false,
    queryOverridesPersistedAuthority: false,
  },
  singleUse: {
    successfulArtifactPresentations: 1,
    successfulExactContinuationConsumers: 1,
    mismatchPreservesContinuation: true,
  },
  privacy: {
    failureIsGeneric: true,
    forbiddenLogValues: ['token', 'email', 'raw-interaction'],
  },
} as const satisfies MagicLinkTenantBindingOracle);

/** Fixture facts deliberately arranged outside the product implementation. */
export interface MagicLinkAuthorityFixture {
  /** Organization that owns the token artifact and resolved user. */
  readonly organizationId: string;
  /** A different organization used to verify tenant isolation. */
  readonly foreignOrganizationId: string;
  /** User identifier encoded into the durable artifact. */
  readonly userId: string;
  /** Email associated with the resolved user; retained only for log-safety assertions. */
  readonly email: string;
  /** Raw artifact value; retained only for log-safety assertions. */
  readonly tokenValue: string;
  /** Opaque interaction identifier persisted by an interaction-bound artifact. */
  readonly interactionUid: string;
  /** Different interaction identifier used to prove transport cannot alter authority. */
  readonly changedInteractionUid: string;
  /** Interaction identifier owned by a client from another organization. */
  readonly foreignClientInteractionUid: string;
}

/** Artifact mode selected when arranging a presentation scenario. */
export type MagicLinkArtifactMode = 'interaction-bound' | 'standalone';

/** Privacy-safe public outcome shape independent from templates and random values. */
export interface MagicLinkPublicOutcome {
  /** Whether the public endpoint accepted the action. */
  readonly accepted: boolean;
  /** Canonical public representation without tenant or token-specific details. */
  readonly responseShape: string;
  /** Generic failure text, or null for an accepted action. */
  readonly genericError: string | null;
}

/** Independent durable and side-effect observations after a public presentation. */
export interface MagicLinkAuthorityObservations {
  /** Exact durable consumption count for the arranged artifact. */
  readonly artifactConsumptionCount: number;
  /** Number of resolved-user state updates caused by the arranged artifact. */
  readonly userMutations: number;
  /** Number of email-side effects caused by the arranged artifact. */
  readonly emailMutations: number;
  /** Number of login effects caused by the arranged artifact. */
  readonly loginEffects: number;
  /** Number of successful audit events caused by the arranged artifact. */
  readonly successfulAuditEvents: number;
  /** Number of Redis or session writes caused by the arranged artifact. */
  readonly continuationWrites: number;
  /** Number of sessions created by continuation consumption. */
  readonly sessionMutations: number;
  /** Whether the bound continuation currently exists. */
  readonly continuationExists: boolean;
  /** Operational output retained by the independent observer. */
  readonly operationalOutput: readonly string[];
}

/** Test-owned boundary over public presentation and independently observed durable state. */
export interface MagicLinkTenantBindingSpecDriver {
  /** Reset owned state and arrange one artifact with the supplied authority mode. */
  reset(input: { readonly mode: MagicLinkArtifactMode }): Promise<MagicLinkAuthorityFixture>;
  /** Present the arranged artifact on one organization route with an optional transport interaction UID. */
  present(input: {
    /** Organization selected by the public route. */
    readonly routeOrganizationId: string;
    /** Transport interaction UID, which must not replace persisted authority. */
    readonly interactionUid?: string;
  }): Promise<MagicLinkPublicOutcome>;
  /** Mark the arranged artifact consumed without producing account or continuation effects. */
  consumeArtifact(): Promise<void>;
  /** Expire the arranged artifact without consuming it or producing account effects. */
  expireArtifact(): Promise<void>;
  /** Consume the bound continuation under the supplied tenant and interaction authority. */
  consumeContinuation(input: {
    /** Organization selected for continuation consumption. */
    readonly organizationId: string;
    /** Interaction selected for continuation consumption. */
    readonly interactionUid: string;
  }): Promise<{ readonly sessionCreated: boolean }>;
  /** Read independent state and privacy-safe operational observations. */
  observe(): Promise<MagicLinkAuthorityObservations>;
}

/** Capability that creates a live driver backed by public actions and independent observers. */
export interface LiveMagicLinkTenantBindingCapability {
  /** Discriminator admitting behavioral specification execution. */
  readonly available: true;
  /** Evidence boundary excluding a test-owned behavioral simulation. */
  readonly evidenceBoundary: 'public-actions-and-owned-observers';
  /** Create an isolated authority-specification driver. */
  createDriver(): Promise<MagicLinkTenantBindingSpecDriver>;
}

/** Fail-closed capability returned before the required production-backed observations exist. */
export interface UnavailableMagicLinkTenantBindingCapability {
  /** Discriminator preventing behavioral specification admission. */
  readonly available: false;
  /** Stable unavailable reason. */
  readonly reason: typeof MAGIC_LINK_TENANT_BINDING_CAPABILITY_MISSING;
}

/** Capability union used by the immutable authority specification. */
export type MagicLinkTenantBindingCapability =
  LiveMagicLinkTenantBindingCapability | UnavailableMagicLinkTenantBindingCapability;
