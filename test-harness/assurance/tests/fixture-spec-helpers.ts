import type {
  OrdinaryTenantFixture,
  PublicFixtureManifest,
} from '../../fixtures/fixture-assurance.js';

/** Returns stable unique strings for cardinality and isolation assertions. */
export function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

/** Returns values shared by two fixture collections. */
export function intersection(
  first: readonly string[],
  second: readonly string[],
): readonly string[] {
  const secondValues = new Set(second);
  return uniqueSorted(first.filter((value) => secondValues.has(value)));
}

/** Collects every protected credential reference exposed by one ordinary tenant. */
export function tenantCredentialRefs(tenant: OrdinaryTenantFixture): readonly string[] {
  return uniqueSorted([
    ...tenant.users.map((user) => user.passwordCredentialRef),
    ...tenant.clients.flatMap((client) =>
      client.clientSecretCredentialRef === undefined ? [] : [client.clientSecretCredentialRef],
    ),
    ...tenant.sessions.map((session) => session.cookieCredentialRef),
    ...tenant.tokens.map((token) => token.tokenCredentialRef),
  ]);
}

/** Collects all public credential references that must resolve in protected runtime storage. */
export function publicCredentialRefs(manifest: PublicFixtureManifest): readonly string[] {
  return uniqueSorted([
    ...tenantCredentialRefs(manifest.alpha),
    ...tenantCredentialRefs(manifest.bravo),
    ...manifest.superAdmin.actors.map((actor) => actor.passwordCredentialRef),
  ]);
}
