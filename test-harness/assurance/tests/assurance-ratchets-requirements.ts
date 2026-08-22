import type { RatchetCoverageCounts, StalenessTrigger } from './assurance-ratchets-contract.js';

/** Reviewed observation-only coverage baseline from the accepted security capture. */
export const reviewedCoverageBaseline = Object.freeze({
  sourceRevision: 'c347b1363a182335e77f40735e28e191e314eb03',
  sourceRunId: '1ca88f05-8501-4a15-bdde-d0b2f33e762c',
  summaryDigest: 'sha256:489254a6735e87e10c7e2d86e0d26e4af69a74a5673e8e07e0e24683071b9128',
  normalizedPathCount: 139,
  normalizedPathDigest: 'sha256:69f21de088bff6acf74b1235bd294524a40228d3afc32c51517055d037961dab',
  counts: Object.freeze<RatchetCoverageCounts>({
    statements: Object.freeze({ covered: 1483, total: 6442 }),
    branches: Object.freeze({ covered: 399, total: 3118 }),
    functions: Object.freeze({ covered: 243, total: 939 }),
    lines: Object.freeze({ covered: 1462, total: 6203 }),
  }),
  enforcement: 'local-observation-only' as const,
  promotionAuthorized: false as const,
});

/** Reviewed identities for inputs that reopen assurance conclusions when changed. */
export const reviewedStalenessDigests: Readonly<Record<StalenessTrigger, string>> = Object.freeze({
  'requirement-r5': 'sha256:e9ec7df09f9de12bc8cfff9f18cdc94aa261a6330fab3fdc5fb8c9665a9d5af2',
  fixture: 'sha256:08c5e9634ea2fc605d18c65050e2edebad5949aa09295b7d11a08784f9ebaab6',
  dependency: 'sha256:b35d279fd3d199436eeb59658b8e44ab3eb3a9140ae90cd7094b17ed27478dd9',
  sentinel: 'sha256:6726cac4bad02ab2849ef4487e241b52ff11f84c14d237f632e5c07a3894d74c',
});

/** Stable non-secret digest used to prove each changed-input branch. */
export const changedRatchetInputDigest = `sha256:${'f'.repeat(64)}`;
