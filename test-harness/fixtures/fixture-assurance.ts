import { protectedCredentialDescriptors, publicFixtureManifest } from './fixture-definition.js';
import type {
  AssuranceProjectDefinition,
  AssuranceRuntimeProfile,
  FixtureAssuranceSurface,
  FixtureOrganizationId,
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

const projects: readonly AssuranceProjectDefinition[] = [];
const profiles: readonly AssuranceRuntimeProfile[] = [];

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
    verifyPublicPostconditions: async () => {
      throw new Error('public fixture verification is not installed');
    },
  };
}
