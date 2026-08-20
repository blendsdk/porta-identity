import { createHash } from 'node:crypto';

import type {
  AssuranceAllChildRegistration,
  AssuranceAllInvocationRegistration,
  AssuranceAllKnownGapRegistration,
} from '../tests/assurance-all-aggregate-contract.js';

/** Builds one immutable, shell-free child invocation. */
function invocation(
  id: string,
  command: AssuranceAllInvocationRegistration['command'],
  selector: string | null,
  profile: AssuranceAllInvocationRegistration['profile'],
  arguments_: readonly string[],
): AssuranceAllInvocationRegistration {
  return Object.freeze({
    id,
    command,
    selector,
    profile,
    arguments: Object.freeze([...arguments_]),
  });
}

/** Versioned aggregate registry executed in exact group and invocation order. */
export const aggregateChildRegistry: readonly AssuranceAllChildRegistration[] = Object.freeze([
  {
    id: 'validate',
    ordinal: 0,
    purpose: 'validate registered assurance definitions',
    internalSuite: null,
    invocations: [invocation('validate-registered-surface', 'assurance:validate', null, null, [])],
  },
  {
    id: 'test',
    ordinal: 1,
    purpose: 'run the deduplicated internal assurance suite',
    internalSuite: 'deduplicated-canonical-files',
    invocations: [
      invocation(
        'internal-deduplicated-suite',
        'assurance:test',
        'assurance-all-internal-v1',
        null,
        ['--select', 'assurance-all-internal-v1'],
      ),
    ],
  },
  {
    id: 'harness:operational',
    ordinal: 2,
    purpose: 'run operational black-box projects',
    internalSuite: null,
    invocations: ['spa', 'bff', 'protocol', 'security', 'compatibility'].map((project) =>
      invocation(`harness-${project}-operational`, 'assurance:harness', project, 'operational', [
        '--project',
        project,
        '--profile',
        'operational',
      ]),
    ),
  },
  {
    id: 'harness:production-security',
    ordinal: 3,
    purpose: 'run production-security black-box checks',
    internalSuite: null,
    invocations: [
      invocation(
        'harness-security-production-security',
        'assurance:harness',
        'security',
        'production-security',
        ['--project', 'security', '--profile', 'production-security'],
      ),
    ],
  },
  {
    id: 'coverage',
    ordinal: 4,
    purpose: 'capture fixed attributed coverage',
    internalSuite: null,
    invocations: [
      invocation('coverage-protocol-operational', 'assurance:coverage', 'protocol', 'operational', [
        '--project',
        'protocol',
        '--profile',
        'operational',
        '--seed',
        'coverage-baseline',
      ]),
      invocation(
        'coverage-security-production-security',
        'assurance:coverage',
        'security',
        'production-security',
        [
          '--project',
          'security',
          '--profile',
          'production-security',
          '--seed',
          'coverage-baseline',
        ],
      ),
    ],
  },
  {
    id: 'fault',
    ordinal: 5,
    purpose: 'run the complete curated fault catalog',
    internalSuite: null,
    invocations: [
      invocation('fault-full-catalog', 'assurance:fault', 'full-catalog/catalog/all', null, [
        '--fault',
        'full-catalog',
        '--claim',
        'catalog',
        '--sentinel',
        'all',
      ]),
    ],
  },
  {
    id: 'compat',
    ordinal: 6,
    purpose: 'run packed client behavior groups',
    internalSuite: null,
    invocations: ['tenant-admin', 'protocol', 'p1-admin', 'compatibility'].map((selector) =>
      invocation(`compat-${selector}`, 'assurance:compat', selector, null, ['--select', selector]),
    ),
  },
  {
    id: 'report',
    ordinal: 7,
    purpose: 'render the validated foundation report',
    internalSuite: null,
    invocations: [
      invocation('report-aggregate-run', 'assurance:report', 'aggregate-run-id', null, [
        '--run',
        '<aggregate-run-id>',
      ]),
    ],
  },
]);

/** Approved non-executable gaps retained without attempting synthetic execution. */
export const aggregateKnownGaps: readonly AssuranceAllKnownGapRegistration[] = Object.freeze([
  {
    id: 'protocol-independent-observation-gaps',
    authority: 'stale-or-no-go-evidence',
    statusSource: 'approved-program-gap-register',
    conclusion: 'unqualified',
  },
  {
    id: 'enumeration-timing-contract-unapproved',
    authority: 'authority-blocked',
    statusSource: 'approved-program-gap-register',
    conclusion: 'blocked',
  },
  {
    id: 'totp-same-window-replay-authority',
    authority: 'authority-blocked',
    statusSource: 'approved-program-gap-register',
    conclusion: 'blocked',
  },
  {
    id: 'bulk-import-export-contract-unapproved',
    authority: 'authority-blocked',
    statusSource: 'approved-program-gap-register',
    conclusion: 'blocked',
  },
  {
    id: 'forwarding-context-observer-incomplete',
    authority: 'stale-or-no-go-evidence',
    statusSource: 'approved-program-gap-register',
    conclusion: 'unqualified',
  },
  {
    id: 'source-variation-campaign-not-executed',
    authority: 'stale-or-no-go-evidence',
    statusSource: 'approved-program-gap-register',
    conclusion: 'unqualified',
  },
]);

/** Stable digest binding aggregate evidence to the exact executable registry and known gaps. */
export function aggregateRegistryDigest(): string {
  return `sha256:${createHash('sha256').update(JSON.stringify({ aggregateChildRegistry, aggregateKnownGaps })).digest('hex')}`;
}
