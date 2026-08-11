import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium, request } from '@playwright/test';
import { z } from 'zod';

import { protectedCredentialDescriptors, publicFixtureManifest } from './fixture-definition.js';
import { readPublicRuntimeFixtureManifest } from './fixture-runtime-files.js';
import type {
  AssuranceProjectDefinition,
  AssuranceRuntimeProfile,
  FixtureAssuranceSurface,
  FixtureOrganizationId,
  PublicPostconditionResult,
  TenantResourceObservation,
} from './fixture-assurance-contract.js';

export type * from './fixture-assurance-contract.js';

/** Returns the declared owner of one synthetic resource identifier. */
function resourceOwner(resourceId: string): FixtureOrganizationId | undefined {
  for (const tenant of [publicFixtureManifest.alpha, publicFixtureManifest.bravo]) {
    if (tenant.resources.some((resource) => resource.id === resourceId)) return tenant.id;
  }
  return undefined;
}

/** Returns the declared owner of one synthetic principal identifier. */
function actorOwner(actorId: string): FixtureOrganizationId | undefined {
  for (const tenant of [publicFixtureManifest.alpha, publicFixtureManifest.bravo]) {
    if (tenant.users.some((user) => user.id === actorId)) return tenant.id;
  }
  if (publicFixtureManifest.superAdmin.actors.some((actor) => actor.id === actorId)) {
    return 'super-admin';
  }
  return undefined;
}

/** Observes fixture ownership without granting a cross-tenant result. */
async function observeTenantResource(
  actorId: string,
  resourceId: string,
): Promise<TenantResourceObservation> {
  const actorOrganization = actorOwner(actorId);
  const observedOrganizationId = resourceOwner(resourceId);
  if (actorOrganization === undefined || observedOrganizationId === undefined) {
    throw new Error('fixture actor or resource is not registered');
  }
  return {
    actorId,
    resourceId,
    observedOrganizationId,
    status: actorOrganization === observedOrganizationId ? 'allowed' : 'forbidden',
  };
}

const projects: readonly AssuranceProjectDefinition[] = [
  {
    id: 'spa',
    pattern: 'tests/spa-*.spec.ts',
    workers: 1,
    files: [
      'tests/spa-magic-link.spec.ts',
      'tests/spa-password.spec.ts',
      'tests/spa-refresh-logout.spec.ts',
    ],
  },
  {
    id: 'bff',
    pattern: 'tests/bff-*.spec.ts',
    workers: 1,
    files: [
      'tests/bff-magic-link.spec.ts',
      'tests/bff-password.spec.ts',
      'tests/bff-refresh-logout.spec.ts',
    ],
  },
  {
    id: 'protocol',
    pattern: 'tests/protocol/**/*.spec.test.ts',
    workers: 1,
    files: ['tests/protocol/discovery.spec.test.ts'],
  },
  {
    id: 'security',
    pattern: 'tests/security/**/*.spec.test.ts',
    workers: 1,
    files: ['tests/security/public-boundary.spec.test.ts'],
  },
  {
    id: 'compatibility',
    pattern: 'tests/compatibility/**/*.spec.test.ts',
    workers: 1,
    files: ['tests/compatibility/retained-clients.spec.test.ts'],
  },
];
const profiles: readonly AssuranceRuntimeProfile[] = [
  {
    id: 'operational',
    environmentSecurityEvidenceEligible: false,
    productionModeRequired: false,
    tlsRequired: false,
    secureCookiesRequired: false,
    minimalErrorsRequired: false,
    securityHeadersRequired: false,
  },
  {
    id: 'production-security',
    environmentSecurityEvidenceEligible: true,
    productionModeRequired: true,
    tlsRequired: true,
    secureCookiesRequired: true,
    minimalErrorsRequired: true,
    securityHeadersRequired: true,
  },
];

/** Reads exact public endpoints after verifying fixture and endpoint run identity. */
function activeEndpoints(): {
  readonly profile: string;
  readonly porta: string;
  readonly app: string;
  readonly mailhog: string;
} {
  const activeRun = z
    .object({ runId: z.uuid(), manifest: z.object({ environmentName: z.string().min(1) }) })
    .passthrough()
    .parse(
      JSON.parse(
        readFileSync(resolve(import.meta.dirname, '../.assurance-runtime/active-run.json'), 'utf8'),
      ),
    );
  const runtimeDirectory = resolve(import.meta.dirname, '../.assurance-runtime', activeRun.runId);
  const endpointManifestPath =
    process.env.PORTA_ENDPOINT_MANIFEST ?? resolve(runtimeDirectory, 'endpoint-manifest.json');
  const fixtureManifestPath =
    process.env.HARNESS_FIXTURE_MANIFEST ?? resolve(runtimeDirectory, 'fixture-public.json');
  const endpoint = z
    .object({
      runId: z.uuid(),
      urls: z.object({
        porta: z.string().url(),
        app: z.string().url(),
        mailhog: z.string().url(),
      }),
    })
    .passthrough()
    .parse(JSON.parse(readFileSync(endpointManifestPath, 'utf8')));
  const fixture = readPublicRuntimeFixtureManifest(fixtureManifestPath);
  if (fixture.runId !== endpoint.runId)
    throw new Error('fixture and endpoint run identities differ');
  return { ...endpoint.urls, profile: activeRun.manifest.environmentName };
}

/** Runs one public-boundary check while retaining only its stable result classification. */
async function publicResult(
  boundary: PublicPostconditionResult['boundary'],
  check: () => Promise<void>,
): Promise<PublicPostconditionResult> {
  try {
    await check();
    return {
      boundary,
      status: 'passed',
      expectationSource: 'public-contract',
      productionDerived: false,
    };
  } catch {
    return {
      boundary,
      status: 'failed',
      expectationSource: 'public-contract',
      productionDerived: false,
    };
  }
}

/** Verifies active HTTP, protocol, browser, and email-capture boundaries. */
async function verifyPublicPostconditions(
  profileId: 'operational' | 'production-security',
): Promise<readonly PublicPostconditionResult[]> {
  const endpoints = activeEndpoints();
  if (endpoints.profile !== profileId) throw new Error('active runtime profile does not match');
  const api = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    const http = await publicResult('http', async () => {
      const response = await api.get(`${endpoints.porta}/health`);
      if (!response.ok()) throw new Error('public health endpoint failed');
    });
    const protocol = await publicResult('protocol', async () => {
      for (const tenant of ['alpha', 'bravo'] as const) {
        const response = await api.get(
          `${endpoints.porta}/${tenant}/.well-known/openid-configuration`,
        );
        if (!response.ok()) throw new Error('tenant discovery failed');
        const discovery = z
          .object({ issuer: z.string().url(), authorization_endpoint: z.string().url() })
          .passthrough()
          .parse(await response.json());
        if (discovery.issuer !== `${endpoints.porta}/${tenant}`) {
          throw new Error('tenant issuer did not match the public contract');
        }
      }
    });
    const email = await publicResult('email', async () => {
      const response = await api.get(`${endpoints.mailhog}/api/v2/messages`);
      if (!response.ok()) throw new Error('MailHog public API failed');
      z.object({ items: z.array(z.unknown()) })
        .passthrough()
        .parse(await response.json());
    });
    const browser = await publicResult('browser', async () => {
      const instance = await chromium.launch({ headless: true });
      try {
        const context = await instance.newContext({ ignoreHTTPSErrors: true });
        const page = await context.newPage();
        const response = await page.goto(endpoints.app, { waitUntil: 'domcontentloaded' });
        if (response === null || !response.ok()) throw new Error('retained SPA did not load');
        await page.locator('[data-testid="login-btn"]').waitFor({ state: 'visible' });
      } finally {
        await instance.close();
      }
    });
    return [browser, email, http, protocol];
  } finally {
    await api.dispose();
  }
}

/** Loads the implemented fixture ontology; later boundaries fail closed until installed. */
export async function loadFixtureAssuranceSurface(): Promise<FixtureAssuranceSurface> {
  return {
    publicManifest: publicFixtureManifest,
    protectedCredentials: protectedCredentialDescriptors,
    projects,
    profiles,
    observeTenantResource,
    runSequence: async () => {
      throw new Error('fixture sequence verification is not installed');
    },
    verifyPublicPostconditions,
  };
}
