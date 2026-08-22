import { packedTenantAdminRequirements } from './packed-tenant-admin-requirements.js';

/** Creates one complete non-secret observation fixture for immutable validator specifications. */
export function completePackedTenantAdminEvidence(): unknown {
  return {
    version: 1,
    sourceRevision: 'a'.repeat(40),
    serverImageDigest: `sha256:${'b'.repeat(64)}`,
    fixtureIdentity: `sha256:${'c'.repeat(64)}`,
    archives: {
      sdk: 'd'.repeat(64),
      cli: 'e'.repeat(64),
    },
    resolution: {
      sdkDistOnly: true,
      cliDistOnly: true,
      cliUsesPackedSdk: true,
    },
    journeys: packedTenantAdminRequirements.map((requirement) => ({
      id: requirement.id,
      client: requirement.client,
      operation: requirement.operation,
      actor: requirement.actor,
      observedResult: requirement.expectedResult,
      clientTargetId: 'alpha-user-active',
      independentTargetId: 'alpha-user-active',
      targetChanged: requirement.expectedTargetMutation,
      foreignTenantIdsObserved: [],
      outputRedacted: true,
      ...(requirement.client === 'cli'
        ? {
            cli: {
              exitCode: requirement.expectedResult === 'allowed' ? 0 : 1,
              temporaryHomeMode: 0o700,
              temporaryHomeRemoved: true,
              callerCredentialUnchanged: true,
            },
          }
        : {}),
    })),
    primaryTreeUnchanged: true,
    ownedResidue: [],
  };
}
