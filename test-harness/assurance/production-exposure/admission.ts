import type { ProductionExposureProfile } from '../tests/production-exposure-contract.js';
import type { ValidationExposureRawCase } from '../tests/validation-exposure-case-model.js';

/** Exact production-exposure case identities admitted for each lifecycle profile. */
export const productionExposureCaseIdsByProfile: Readonly<
  Record<ProductionExposureProfile, readonly string[]>
> = Object.freeze({
  operational: Object.freeze([
    'st53-untrusted-forwarded-host',
    'st53-untrusted-forwarded-proto',
    'st53-untrusted-forwarded-client-ip',
    'st56-operational-database-error-exposure',
    'st56-operational-cache-error-exposure',
    'st56-operational-mail-error-exposure',
  ]),
  'production-security': Object.freeze([
    'st53-untrusted-forwarded-host',
    'st53-untrusted-forwarded-proto',
    'st53-untrusted-forwarded-client-ip',
    'st55-unconfigured-cors-origin',
    'st55-unconfigured-cors-method-and-header',
    'st55-production-response-policy',
    'st55-production-html-csp-policy',
    'st55-production-session-cookie-policy',
    'st56-production-security-database-error-exposure',
    'st56-production-security-cache-error-exposure',
    'st56-production-security-mail-error-exposure',
  ]),
});

/** Admits only the exact immutable production-exposure case set for one lifecycle profile. */
export function admitProductionExposureCases(
  profile: ProductionExposureProfile,
  candidates: readonly ValidationExposureRawCase[],
): readonly ValidationExposureRawCase[] {
  const expectedIds = productionExposureCaseIdsByProfile[profile];
  const byId = new Map<string, ValidationExposureRawCase>();
  for (const candidate of candidates) {
    if (byId.has(candidate.id)) throw new Error('production exposure case identity is duplicated');
    byId.set(candidate.id, candidate);
  }
  const admitted = expectedIds.map((id) => {
    const candidate = byId.get(id);
    if (candidate === undefined || !candidate.executionProfiles.includes(profile)) {
      throw new Error('production exposure exact profile case set is incomplete');
    }
    return candidate;
  });
  const profileIds = candidates
    .filter(
      (candidate) =>
        candidate.executionProfiles.includes(profile) &&
        (candidate.sentinelId === 'ST-53' ||
          candidate.sentinelId === 'ST-55' ||
          candidate.sentinelId === 'ST-56'),
    )
    .map((candidate) => candidate.id)
    .sort();
  if (JSON.stringify(profileIds) !== JSON.stringify([...expectedIds].sort())) {
    throw new Error('production exposure profile admits an unexpected case');
  }
  return Object.freeze(admitted);
}
