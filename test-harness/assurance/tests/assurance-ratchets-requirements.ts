import type { RatchetCoverageCounts, StalenessTrigger } from './assurance-ratchets-contract.js';

/** Reviewed observation-only coverage baseline from the accepted security capture. */
export const reviewedCoverageBaseline = Object.freeze({
  sourceRevision: '604c2a0fdd9d62a6fbfb8dd5a78ee168a82e9da7',
  sourceRunId: '83acea43-3440-48c9-80da-5114767148a3',
  summaryDigest: 'sha256:b3d31684ee9a79fc357ae52895e33cfc26c2b911f5d4a745b20a047c396ab10b',
  normalizedPathCount: 188,
  normalizedPathDigest: 'sha256:86a8366b408dfaca021a8b190d2c2b148114b6d5ab1efe8ae5a014036586df94',
  counts: Object.freeze<RatchetCoverageCounts>({
    statements: Object.freeze({ covered: 2114, total: 9613 }),
    branches: Object.freeze({ covered: 691, total: 5179 }),
    functions: Object.freeze({ covered: 363, total: 1550 }),
    lines: Object.freeze({ covered: 2074, total: 9034 }),
  }),
  enforcement: 'local-observation-only' as const,
  promotionAuthorized: false as const,
});

/** Reviewed identities for inputs that reopen assurance conclusions when changed. */
export const reviewedStalenessDigests: Readonly<Record<StalenessTrigger, string>> = Object.freeze({
  'requirement-r5': 'sha256:06c509c014c98fc03aba7ea38ef0db42ea886267a959657d977a4ca18fb2ef18',
  fixture: 'sha256:3524d67b9c53cbe6a4599fc31994808ae3098b9a9fe7ac00d69dfde78a06cbf0',
  dependency: 'sha256:7735f69b8381f91fdfc0ae1333f0d4b7f0b23076fe002793f556622c7ed32c3c',
  sentinel: 'sha256:6726cac4bad02ab2849ef4487e241b52ff11f84c14d237f632e5c07a3894d74c',
});

/** Stable non-secret digest used to prove each changed-input branch. */
export const changedRatchetInputDigest = `sha256:${'f'.repeat(64)}`;
