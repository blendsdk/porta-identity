/** Stable request passed to the future retained-harness cross-site adapter. */
export interface HumanAuthCrossSiteRequest {
  readonly sentinelId: 'ST-45';
  readonly profile: 'production-security';
  readonly topology: {
    readonly owner: 'endpoint-manifest';
    readonly portaUrl: string;
    readonly spaUrl: string;
    readonly attackerUrl: string;
    readonly attackerSharesSpaPort: boolean;
    readonly attackerHostKind: 'literal-ipv4-loopback';
    readonly browserSiteRelation: 'distinct-site';
  };
  readonly project: {
    readonly name: 'security';
    readonly profile: 'production-security';
    readonly skipPolicy: 'forbidden';
  };
  readonly certificate: {
    readonly requiredIpSans: readonly ['127.0.0.1'];
  };
  readonly preflightCases: readonly CrossSitePreflightRequirement[];
  readonly cookie: CookieBoundaryRequirement;
  readonly csrf: CsrfBoundaryRequirement;
}

/** One fail-closed topology variation evaluated before browser or service startup. */
export interface CrossSitePreflightRequirement {
  readonly id: string;
  readonly attackerUrl: string;
  readonly expected: 'valid' | 'invalid';
  readonly rejection: string | null;
}

/** Exact production cookie policy observed from browser cookie metadata. */
export interface CookieBoundaryRequirement {
  readonly observationSource: 'browser-cookie-metadata';
  readonly target: {
    readonly role: 'authenticated-session';
    readonly name: '_session';
    readonly domain: 'porta-harness.ci.portaidentity.com';
    readonly path: '/';
  };
  readonly required: {
    readonly secure: true;
    readonly httpOnly: true;
    readonly sameSite: 'Lax' | 'Strict';
    readonly hostOnly: true;
  };
}

/** Cross-site state-changing request and its independent durable-state oracle. */
export interface CsrfBoundaryRequirement {
  readonly control: {
    readonly originContext: 'same-origin';
    readonly csrfProof: 'valid';
    readonly expectedResult: 'allowed';
    readonly expectedMutationDelta: 1;
  };
  readonly probes: readonly {
    readonly originContext: 'cross-origin-same-site' | 'cross-site-loopback-ip';
    readonly csrfProof: 'missing' | 'wrong';
    readonly expectedResult: 'forbidden';
    readonly expectedMutationDelta: 0;
  }[];
  readonly independentObservation: 'target-fingerprint-before-and-after';
}

/** Deterministic topology observations available before any service or browser starts. */
export interface HumanAuthCrossSiteObservation {
  readonly manifest: {
    readonly portaUrl: string;
    readonly spaUrl: string;
    readonly attackerUrl: string;
    readonly attackerPort: number;
    readonly spaPort: number;
  };
  readonly certificateIpSans: readonly string[];
  readonly preflights: readonly {
    readonly id: string;
    readonly accepted: boolean;
    readonly servicesStarted: boolean;
    readonly browserStarted: boolean;
    readonly rejection: string | null;
  }[];
  readonly environmentAttackerUrl: string;
}

/** Swappable seam for deterministic lifecycle topology admission. */
export interface HumanAuthCrossSiteContract {
  observeBoundary(request: HumanAuthCrossSiteRequest): Promise<HumanAuthCrossSiteObservation>;
}
