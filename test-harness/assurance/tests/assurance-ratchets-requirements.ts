import type { RatchetCoverageCounts, StalenessTrigger } from './assurance-ratchets-contract.js';

/** Reviewed observation-only coverage baseline from the accepted security capture. */
export const reviewedCoverageBaseline = Object.freeze({
  sourceRevision: '16dae6b8412577a1c98e3f1f2ae07e20a69eee95',
  sourceRunId: '53ff6f24-219a-485b-a87f-93343612aa91',
  summaryDigest: 'sha256:7b48038ecc8ce95ecb59770f6dcbc1fadfda1461c99b641a07a3a2fd218c66a9',
  normalizedPathCount: 150,
  normalizedPathDigest: 'sha256:fd7fc28f6149f51ca71b8ca6266dc140706bf2c225b877aa40252ed3b0a94e63',
  counts: Object.freeze<RatchetCoverageCounts>({
    statements: Object.freeze({ covered: 1838, total: 7630 }),
    branches: Object.freeze({ covered: 580, total: 3919 }),
    functions: Object.freeze({ covered: 317, total: 1177 }),
    lines: Object.freeze({ covered: 1806, total: 7296 }),
  }),
  enforcement: 'local-observation-only' as const,
  promotionAuthorized: false as const,
});

/** Reviewed identities for inputs that reopen assurance conclusions when changed. */
export const reviewedStalenessDigests: Readonly<Record<StalenessTrigger, string>> = Object.freeze({
  'requirement-r5': 'sha256:f17005ca28d271dbf6e14ff2b0a606fe06c7a5af654bc252c2a55b3f85ffc569',
  fixture: 'sha256:08c5e9634ea2fc605d18c65050e2edebad5949aa09295b7d11a08784f9ebaab6',
  dependency: 'sha256:b35d279fd3d199436eeb59658b8e44ab3eb3a9140ae90cd7094b17ed27478dd9',
  sentinel: 'sha256:6726cac4bad02ab2849ef4487e241b52ff11f84c14d237f632e5c07a3894d74c',
});

/** Stable non-secret digest used to prove each changed-input branch. */
export const changedRatchetInputDigest = `sha256:${'f'.repeat(64)}`;
