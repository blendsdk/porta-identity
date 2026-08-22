import {
  controlPlaneAuthorityProfile,
  tenantOidcAuthorityProfile,
} from './tenant-admin-profile-requirements.js';
import { z } from 'zod';
import type {
  StaleAuthorityRetryObservation,
  StaleAuthorityScenarioObservation,
  StaleAuthorityScenarioRequest,
} from './tenant-admin-boundaries-contract.js';
import { authorizationResult, LiveTenantAdminContext } from './tenant-admin-live-context.js';
import {
  establishLiveOidcBrowserSession,
  retryLiveOidcBrowserSession,
} from './tenant-admin-live-oidc.js';

/** Runs the administrative read control used by role and actor-state transitions. */
async function retryAdminRead(
  context: LiveTenantAdminContext,
  token: string,
): Promise<StaleAuthorityRetryObservation['result']> {
  const api = await context.api();
  const organizationId = context.entity('alpha');
  const userId = context.entity('alpha-user-active');
  const response = await api.get(
    `${context.endpoints.porta}/api/admin/organizations/${organizationId}/users/${userId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return authorizationResult(response.status());
}

/** Performs one supported administrative authority transition through its public route. */
async function mutateAdministrativeAuthority(
  context: LiveTenantAdminContext,
  request: StaleAuthorityScenarioRequest,
): Promise<{ readonly token: string; readonly mutationAccepted: boolean }> {
  const actor = context.adminActor('admin-limited');
  const token = context.credential(actor.tokenCredentialRef);
  const control = await retryAdminRead(context, token);
  if (control !== 'allowed') throw new Error('stale-authority control was not allowed');
  const actorId = context.entity(actor.id);
  const organizationId = context.entity('super-admin');
  const response =
    request.transition === 'role-removal'
      ? await context.rawRequest(
          'DELETE',
          `/api/admin/organizations/${organizationId}/users/${actorId}/roles`,
          'admin-full',
          { roleIds: [context.entity(actor.roleId)] },
        )
      : await context.rawRequest(
          'POST',
          `/api/admin/users/${actorId}/${request.transition === 'actor-deactivation' ? 'deactivate' : 'suspend'}`,
          'admin-full',
          request.transition === 'actor-suspension'
            ? { reason: 'assurance-stale-authority-probe' }
            : undefined,
        );
  return { token, mutationAccepted: response.status >= 200 && response.status < 300 };
}

/** Creates one exact retry observation from an actual post-transition public response. */
function retryObservation(
  context: StaleAuthorityRetryObservation['context'],
  result: StaleAuthorityRetryObservation['result'],
): StaleAuthorityRetryObservation {
  return Object.freeze({
    context,
    result,
    authorityAccepted: result === 'allowed',
    authorityMaterial: 'pre-transition',
    portaRestarted: context === 'fresh-porta-process',
  });
}

/** Executes one cache-warmed authority transition and all required post-transition retries. */
export async function observeLiveStaleAuthorityScenario(
  context: LiveTenantAdminContext,
  request: StaleAuthorityScenarioRequest,
): Promise<StaleAuthorityScenarioObservation> {
  await context.lifecycle('reset');
  const target = await context.adminTarget('admin-target-alpha-user');
  const before = await context.targetFingerprint(target);
  if (request.transition === 'session-revocation') {
    return observeSessionRevocation(context, request);
  }
  const sideEffectsBefore = await context.captureSideEffectSnapshot();
  const mutation = await mutateAdministrativeAuthority(context, request);
  const existingResult = await retryAdminRead(context, mutation.token);
  const freshContext = new LiveTenantAdminContext();
  const freshResult = await retryAdminRead(freshContext, mutation.token);
  await context.lifecycle('restart-porta');
  const restartedContext = new LiveTenantAdminContext();
  const restartedResult = await retryAdminRead(restartedContext, mutation.token);
  const retries = Object.freeze([
    retryObservation('existing-client', existingResult),
    retryObservation('fresh-client', freshResult),
    retryObservation('fresh-porta-process', restartedResult),
  ]);
  const after = await restartedContext.targetFingerprint(target);
  const sideEffectsAfter = await restartedContext.captureSideEffectSnapshot();
  const targetChanged = before.digest !== after.digest;
  const prohibitedKeys = [
    ...tenantOidcAuthorityProfile.threatProfile.prohibitedSideEffects,
    ...controlPlaneAuthorityProfile.threatProfile.prohibitedSideEffects,
  ];
  const observation: StaleAuthorityScenarioObservation = Object.freeze({
    transition: request.transition,
    authorizedControlCaseId: request.authorizedControlCaseId,
    mutationMethod: request.mutationMethod,
    mutationRoute: request.mutationRoute,
    authorizedControlPassed: true,
    cacheWarmed: true,
    mutationAccepted: mutation.mutationAccepted,
    revokedStateObserved: retries.every((retry) => !retry.authorityAccepted),
    retries,
    prohibitedSideEffects: context.observedSideEffects(
      prohibitedKeys,
      {
        targetChanged,
        targetDisclosed: false,
        unauthorizedAccepted: retries.some((retry) => retry.authorityAccepted),
      },
      sideEffectsBefore,
      sideEffectsAfter,
    ),
    targetBefore: before,
    targetAfter: after,
  });
  await restartedContext.lifecycle('reset');
  return observation;
}

/** Executes one real OIDC browser-session revocation without substituting an access token. */
async function observeSessionRevocation(
  context: LiveTenantAdminContext,
  request: StaleAuthorityScenarioRequest,
): Promise<StaleAuthorityScenarioObservation> {
  const session = await establishLiveOidcBrowserSession(context, 'alpha');
  try {
    const target = await context.adminTarget('admin-target-alpha-user');
    const before = await context.targetFingerprint(target);
    const sideEffectsBefore = await context.captureSideEffectSnapshot();
    const userId = context.entity('alpha-user-active');
    const inventory = await context.rawRequest(
      'GET',
      `/api/admin/sessions?userId=${encodeURIComponent(userId)}&activeOnly=true&pageSize=100`,
      'admin-full',
    );
    if (inventory.status !== 200) throw new Error('live OIDC session inventory failed');
    const sessions = z
      .object({
        data: z.array(
          z
            .object({ sessionId: z.string().min(1), revokedAt: z.unknown().nullable() })
            .passthrough(),
        ),
      })
      .passthrough()
      .parse(inventory.body).data;
    const live = sessions.find(
      (candidate) =>
        candidate.revokedAt === null &&
        candidate.sessionId !== context.credential('credential:alpha:cookie:baseline'),
    );
    if (live === undefined) throw new Error('new live OIDC session was not tracked');
    const mutation = await context.rawRequest(
      'DELETE',
      `/api/admin/sessions/${encodeURIComponent(live.sessionId)}`,
      'admin-full',
    );
    const existingResult = await retryLiveOidcBrowserSession(context, session, false);
    const freshResult = await retryLiveOidcBrowserSession(context, session, true);
    await context.lifecycle('restart-porta');
    const restartedResult = await retryLiveOidcBrowserSession(context, session, true);
    const retries = Object.freeze([
      retryObservation('existing-client', existingResult),
      retryObservation('fresh-client', freshResult),
      retryObservation('fresh-porta-process', restartedResult),
    ]);
    const after = await context.targetFingerprint(target);
    const sideEffectsAfter = await context.captureSideEffectSnapshot();
    const targetChanged = before.digest !== after.digest;
    const prohibitedKeys = [
      ...tenantOidcAuthorityProfile.threatProfile.prohibitedSideEffects,
      ...controlPlaneAuthorityProfile.threatProfile.prohibitedSideEffects,
    ];
    const observation: StaleAuthorityScenarioObservation = Object.freeze({
      transition: request.transition,
      authorizedControlCaseId: request.authorizedControlCaseId,
      mutationMethod: request.mutationMethod,
      mutationRoute: request.mutationRoute,
      authorizedControlPassed: true,
      cacheWarmed: true,
      mutationAccepted: mutation.status >= 200 && mutation.status < 300,
      revokedStateObserved: retries.every((retry) => !retry.authorityAccepted),
      retries,
      prohibitedSideEffects: context.observedSideEffects(
        prohibitedKeys,
        {
          targetChanged,
          targetDisclosed: false,
          unauthorizedAccepted: retries.some((retry) => retry.authorityAccepted),
        },
        sideEffectsBefore,
        sideEffectsAfter,
      ),
      targetBefore: before,
      targetAfter: after,
    });
    await context.lifecycle('reset');
    return observation;
  } finally {
    await session.browser.close();
  }
}
