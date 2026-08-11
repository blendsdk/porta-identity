/**
 * Declaration-only contract for deterministic assurance fixtures and collection metadata.
 *
 * The runtime module is intentionally absent until the fixture implementation phase. Immutable
 * specification tests import this contract without importing Porta production logic.
 */

/** Stable organization identities required by the fixture ontology. */
export type FixtureOrganizationId = 'alpha' | 'bravo' | 'super-admin';

/** Ordinary account states needed by authentication and enumeration risk slices. */
export type FixtureUserState = 'active' | 'locked' | 'suspended';

/** Administrative permission sets represented by distinct actors. */
export type AdministrativePermissionSet = 'full' | 'limited' | 'unprivileged';

/** Client confidentiality classes exercised through public protocol boundaries. */
export type FixtureClientKind = 'public' | 'confidential';

/** Whether a client is expected to pass registration validation. */
export type FixtureClientValidity = 'valid' | 'invalid';

/** Synthetic user owned by exactly one organization. */
export interface FixtureUser {
  /** Stable synthetic user identifier. */
  readonly id: string;
  /** Owning organization. */
  readonly organizationId: FixtureOrganizationId;
  /** Account state used by authentication policy. */
  readonly state: FixtureUserState;
  /** Whether the identity is configured for two-factor authentication. */
  readonly twoFactorEnabled: boolean;
  /** Whether the identity has recovery behavior available. */
  readonly recoveryEnabled: boolean;
  /** Whether the identity is an explicit enumeration-test subject. */
  readonly enumerationSubject: boolean;
  /** Protected password reference, never the password itself. */
  readonly passwordCredentialRef: string;
}

/** Synthetic OIDC client with an exact tenant and protocol contract. */
export interface FixtureClient {
  /** Stable client identifier. */
  readonly id: string;
  /** Owning ordinary organization. */
  readonly organizationId: 'alpha' | 'bravo';
  /** Public or confidential client behavior. */
  readonly kind: FixtureClientKind;
  /** Whether protocol validation should accept the client. */
  readonly validity: FixtureClientValidity;
  /** Explicit invalidity reason for deliberately rejected clients. */
  readonly invalidReason?: string;
  /** Exact redirect URI allowlist. */
  readonly redirectUris: readonly string[];
  /** Exact browser-origin allowlist. */
  readonly origins: readonly string[];
  /** Exact grant-type allowlist. */
  readonly grantTypes: readonly string[];
  /** Exact scope allowlist. */
  readonly scopes: readonly string[];
  /** Protected client-secret reference for confidential clients. */
  readonly clientSecretCredentialRef?: string;
}

/** Synthetic session identity owned by one tenant user. */
export interface FixtureSession {
  /** Stable non-secret session identifier. */
  readonly id: string;
  /** Owning organization. */
  readonly organizationId: 'alpha' | 'bravo';
  /** Owning synthetic user. */
  readonly userId: string;
  /** Protected cookie reference rather than a raw cookie. */
  readonly cookieCredentialRef: string;
}

/** Synthetic token identity whose raw token remains outside the public manifest. */
export interface FixtureToken {
  /** Stable non-secret token identifier. */
  readonly id: string;
  /** Owning organization. */
  readonly organizationId: 'alpha' | 'bravo';
  /** Owning synthetic user. */
  readonly userId: string;
  /** Associated synthetic client. */
  readonly clientId: string;
  /** Protected raw-token reference. */
  readonly tokenCredentialRef: string;
}

/** Tenant-owned resource used to prove authorization isolation. */
export interface FixtureTenantResource {
  /** Stable resource identifier. */
  readonly id: string;
  /** Owning organization. */
  readonly organizationId: 'alpha' | 'bravo';
  /** Owning synthetic user. */
  readonly ownerUserId: string;
}

/** Complete ordinary-tenant fixture slice. */
export interface OrdinaryTenantFixture {
  /** Stable organization identity. */
  readonly id: 'alpha' | 'bravo';
  /** Tenant-owned users. */
  readonly users: readonly FixtureUser[];
  /** Valid and deliberately invalid tenant clients. */
  readonly clients: readonly FixtureClient[];
  /** Tenant-owned sessions. */
  readonly sessions: readonly FixtureSession[];
  /** Tenant-owned tokens. */
  readonly tokens: readonly FixtureToken[];
  /** Tenant-owned authorization resources. */
  readonly resources: readonly FixtureTenantResource[];
}

/** Administrative actor residing only in the bootstrapped super-admin organization. */
export interface AdministrativeActor {
  /** Stable actor identifier. */
  readonly id: string;
  /** Administrative organization identity. */
  readonly organizationId: 'super-admin';
  /** Distinct permission set exercised by the actor. */
  readonly permissionSet: AdministrativePermissionSet;
  /** Exact global administrative role, using the reserved Porta role namespace. */
  readonly roleId: string;
  /** Exact permissions associated with the actor's global role. */
  readonly permissions: readonly string[];
  /** Protected password reference. */
  readonly passwordCredentialRef: string;
}

/** Bootstrapped administrative organization and its exact actor classes. */
export interface SuperAdminFixture {
  /** Stable administrative organization identity. */
  readonly id: 'super-admin';
  /** Full, limited, and unprivileged administrative actors. */
  readonly actors: readonly AdministrativeActor[];
}

/** Global application with explicit tenant-owned client associations. */
export interface GlobalApplicationFixture {
  /** Stable global application identifier. */
  readonly id: string;
  /** Tenant-owned clients explicitly exercised by the application. */
  readonly clientIds: readonly string[];
}

/** Global role associated with one application and explicit fixture users or actors. */
export interface GlobalRoleFixture {
  /** Stable global role identifier. */
  readonly id: string;
  /** Global application that owns the role definition. */
  readonly applicationId: string;
  /** Ordinary users and administrative actors assigned through the user-role relationship. */
  readonly assignedUserIds: readonly string[];
  /** Explicit synthetic permissions granted by the role. */
  readonly permissions: readonly string[];
}

/** Generated public fixture manifest containing identifiers but no raw credentials. */
export interface PublicFixtureManifest {
  /** Ordinary alpha tenant. */
  readonly alpha: OrdinaryTenantFixture;
  /** Ordinary bravo tenant. */
  readonly bravo: OrdinaryTenantFixture;
  /** Bootstrapped administrative organization. */
  readonly superAdmin: SuperAdminFixture;
  /** Globally defined applications. */
  readonly globalApplications: readonly GlobalApplicationFixture[];
  /** Globally defined roles. */
  readonly globalRoles: readonly GlobalRoleFixture[];
}

/** Credential kinds stored outside the generated public manifest. */
export type ProtectedCredentialKind =
  'password' | 'client-secret' | 'token' | 'cookie' | 'totp' | 'recovery-code';

/** Non-secret inspection record proving a credential is protected and separately stored. */
export interface ProtectedCredentialDescriptor {
  /** Opaque reference used by public fixture identifiers. */
  readonly ref: string;
  /** Credential category. */
  readonly kind: ProtectedCredentialKind;
  /** Protected runtime storage boundary. */
  readonly storage: 'runtime-protected';
  /** Raw values are never exposed through this inspection contract. */
  readonly rawValueExposed: false;
}

/** Exact Playwright/Node project metadata derived from the assurance collection contract. */
export interface AssuranceProjectDefinition {
  /** Stable project identifier. */
  readonly id: 'spa' | 'bff' | 'protocol' | 'security' | 'compatibility';
  /** Sole repository-relative file pattern owned by the project. */
  readonly pattern: string;
  /** Deterministic worker count. */
  readonly workers: 1;
  /** Files actually collected for this project. */
  readonly files: readonly string[];
}

/** Runtime profile controlling whether environment-dependent evidence is eligible. */
export interface AssuranceRuntimeProfile {
  /** Stable runtime profile identifier. */
  readonly id: 'operational' | 'production-security';
  /** Whether evidence from environment-dependent security checks is eligible. */
  readonly environmentSecurityEvidenceEligible: boolean;
  /** Whether Porta must run in production mode. */
  readonly productionModeRequired: boolean;
  /** Whether public endpoints must use TLS. */
  readonly tlsRequired: boolean;
  /** Whether secure-cookie behavior is mandatory. */
  readonly secureCookiesRequired: boolean;
  /** Whether public errors must omit internal details. */
  readonly minimalErrorsRequired: boolean;
  /** Whether public security headers are mandatory. */
  readonly securityHeadersRequired: boolean;
}

/** Public boundary categories used for post-reset fixture verification. */
export type PublicVerificationBoundary = 'http' | 'browser' | 'protocol' | 'email';

/** One public postcondition result independent from production-derived expectations. */
export interface PublicPostconditionResult {
  /** Public boundary used for the observation. */
  readonly boundary: PublicVerificationBoundary;
  /** Whether the required postcondition passed. */
  readonly status: 'passed' | 'failed';
  /** Expectations originate in the immutable public contract. */
  readonly expectationSource: 'public-contract';
  /** Production behavior never generates the expected result. */
  readonly productionDerived: false;
}

/** Result of one cross-tenant public resource observation. */
export interface TenantResourceObservation {
  /** Actor making the request. */
  readonly actorId: string;
  /** Resource independently observed through a public boundary. */
  readonly resourceId: string;
  /** Independently observed owning organization. */
  readonly observedOrganizationId: FixtureOrganizationId;
  /** Public authorization result. */
  readonly status: 'allowed' | 'forbidden' | 'not-found';
}

/** Residue snapshot after one complete deterministic suite sequence. */
export interface FixtureResidueSnapshot {
  /** Durable database rows outside the fresh baseline. */
  readonly durableRows: number;
  /** Harness-dedicated cache entries outside the fresh baseline. */
  readonly cacheEntries: number;
  /** Mail messages outside the fresh baseline. */
  readonly mailMessages: number;
  /** Sessions outside the fresh baseline. */
  readonly sessions: number;
}

/** Stable outcome of a declared, reversed, or shuffled fixture sequence. */
export interface FixtureSequenceOutcome {
  /** Digest of public behavioral outcomes. */
  readonly outcomeDigest: string;
  /** Residue remaining after reset and cleanup. */
  readonly residue: FixtureResidueSnapshot;
}

/** Planned fixture and collection boundary consumed only by immutable assurance specs. */
export interface FixtureAssuranceSurface {
  /** Generated public manifest. */
  readonly publicManifest: PublicFixtureManifest;
  /** Non-secret credential-storage inspection records. */
  readonly protectedCredentials: readonly ProtectedCredentialDescriptor[];
  /** Exact five-project collection. */
  readonly projects: readonly AssuranceProjectDefinition[];
  /** Exact operational and production-security profiles. */
  readonly profiles: readonly AssuranceRuntimeProfile[];
  /** Observes a tenant resource through an external authorization boundary. */
  observeTenantResource(actorId: string, resourceId: string): Promise<TenantResourceObservation>;
  /** Executes a complete suite sequence against a fresh baseline. */
  runSequence(order: 'reverse' | 'shuffled'): Promise<FixtureSequenceOutcome>;
  /** Verifies all required postconditions through public boundaries. */
  verifyPublicPostconditions(
    profileId: 'operational' | 'production-security',
  ): Promise<readonly PublicPostconditionResult[]>;
}

/** Loads deterministic fixture, project, profile, and public-verification metadata. */
export function loadFixtureAssuranceSurface(): Promise<FixtureAssuranceSurface>;
