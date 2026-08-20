/** Complete contract for one root assurance command. */
export interface AssuranceCommandContract {
  /** Accepted selector syntax shown to callers. */
  selectorGrammar: string;
  /** Bounded execution timeout. */
  timeout: string;
  /** Run-relative directory for sanitized artifacts. */
  artifactSubdirectory: string;
  /** Preconditions checked before command work begins. */
  prerequisites: readonly string[];
  /** Interrupt and termination handling contract. */
  signalContract: string;
  /** Owned-resource cleanup and recovery contract. */
  cleanupContract: string;
  /** Ordered child commands for aggregate commands. */
  composition?: readonly string[];
}

/** Stable command actions accepted by the shared root dispatcher. */
export const assuranceCommandActions = [
  'test',
  'red',
  'baseline',
  'validate',
  'harness',
  'coverage',
  'fault',
  'mutation',
  'control-check',
  'compat',
  'report',
  'stability',
  'all',
] as const;

/** One allowlisted action accepted by the shared root dispatcher. */
export type AssuranceCommandAction = (typeof assuranceCommandActions)[number];

/** Version of the machine-readable command contract. */
export const commandContractVersion = 1;

/** Root alias definitions keyed by their package-script name. */
export const commandContracts: Readonly<Record<string, AssuranceCommandContract>> = {
  'assurance:test': {
    selectorGrammar: '--select <registered-suite|ST-ID|internal-test-path>',
    timeout: '120s; fixture-ontology=900s; fixtures-all=900s-per-child',
    artifactSubdirectory: 'test/',
    prerequisites: [
      'frozen root install',
      'definitions valid',
      'declared services healthy for the selected case',
    ],
    signalContract: 'SIGINT and SIGTERM use common signal cleanup',
    cleanupContract: 'no service ownership unless the selected case declares owned resources',
  },
  'assurance:red': {
    selectorGrammar: '--case <ST-ID> --signature <signature-id>',
    timeout: '120s',
    artifactSubdirectory: 'red/',
    prerequisites: ['case and signature registered', 'pre-existing required lanes green'],
    signalContract: 'SIGINT and SIGTERM use common signal cleanup',
    cleanupContract: 'common cleanup preserves the exact child failure and owned resources',
  },
  'assurance:baseline': {
    selectorGrammar: '--case <ST-ID>',
    timeout: '120s',
    artifactSubdirectory: 'baseline/',
    prerequisites: [
      'case registered',
      'required lanes green',
      'fault tuple registered for legacy-green behavior',
    ],
    signalContract: 'SIGINT and SIGTERM use common signal cleanup',
    cleanupContract: 'common cleanup preserves baseline evidence and owned resources',
  },
  'assurance:validate': {
    selectorGrammar: '',
    timeout: '120s',
    artifactSubdirectory: 'validation/',
    prerequisites: ['frozen root install'],
    signalContract: 'SIGINT and SIGTERM use common signal cleanup',
    cleanupContract: 'no service ownership; validation writes only sanitized owned artifacts',
  },
  'assurance:harness': {
    selectorGrammar:
      '--project <spa|bff|protocol|security|compatibility> --profile <operational|production-security>',
    timeout: '1800s',
    artifactSubdirectory: 'harness/<project>/<profile>/',
    prerequisites: [
      'DNS and IP-site preflight',
      'Docker available',
      'lease acquired',
      'migrated, seeded, and healthy stack',
    ],
    signalContract: 'SIGINT and SIGTERM trigger common signal cleanup',
    cleanupContract: 'owned resources are removed or an exact recovery command is reported',
  },
  'assurance:coverage': {
    selectorGrammar: '--project <project-enum> --profile <profile-enum> --seed <registered-seed>',
    timeout: '2400s',
    artifactSubdirectory: 'coverage/<project>/<profile>/',
    prerequisites: [
      'harness prerequisites satisfied',
      'matching image and maps',
      'writable raw mount',
    ],
    signalContract: 'SIGINT and SIGTERM trigger common signal cleanup and graceful Node flush',
    cleanupContract: 'owned resources are removed; incomplete flush remains a coverage failure',
  },
  'assurance:fault': {
    selectorGrammar: '--fault <fault-id> --claim <claim-id> --sentinel <sentinel-id>',
    timeout: '3600s',
    artifactSubdirectory: 'fault/<fault>/<claim>/<sentinel>/',
    prerequisites: [
      'clean baseline',
      'registered tuple',
      'Docker available',
      'disposable worktree support',
    ],
    signalContract: 'SIGINT and SIGTERM trigger common signal cleanup',
    cleanupContract:
      'owned resources are removed or exact recovery is reported; primary tree immutable',
  },
  'assurance:mutation': {
    selectorGrammar: '--select bounded-pilot | --recover <run-uuid>',
    timeout: '900s',
    artifactSubdirectory: 'mutation/bounded-pilot/',
    prerequisites: [
      'clean baseline',
      'exact StrykerJS packages installed',
      'disposable worktree support',
      'registered include-only targets',
    ],
    signalContract: 'SIGINT and SIGTERM trigger common signal cleanup',
    cleanupContract:
      'owned worktree and runtime are removed or exact recovery is reported; primary tree immutable',
  },
  'assurance:control-check': {
    selectorGrammar:
      '--check <tenant-read-scope|tenant-write-scope|issuer-separation|organization-cache-scope|stale-authority-recheck|admin-organization-membership|admin-permission-rbac> | --recover <run-uuid>',
    timeout: '3600s',
    artifactSubdirectory: 'control-check/<check>/',
    prerequisites: [
      'clean baseline',
      'registered check',
      'Docker available',
      'disposable worktree support',
    ],
    signalContract: 'SIGINT and SIGTERM trigger common signal cleanup',
    cleanupContract:
      'owned resources are removed or exact recovery is reported; primary tree immutable',
  },
  'assurance:compat': {
    selectorGrammar:
      '--select <ST-69|ST-70|ST-71|ST-72|ST-73|tenant-admin|p1-admin|protocol|compatibility>',
    timeout: '1800s',
    artifactSubdirectory: 'compat/<selector>/',
    prerequisites: [
      'built local SDK and CLI archives',
      'clean consumer',
      'temporary HOME isolated',
      'healthy harness',
    ],
    signalContract: 'SIGINT and SIGTERM trigger common signal cleanup',
    cleanupContract: 'owned resources are removed and the real credential store remains unchanged',
  },
  'assurance:report': {
    selectorGrammar: '--run <run-uuid> --coverage-run <coverage-run-uuid>',
    timeout: '120s',
    artifactSubdirectory: 'summary/',
    prerequisites: [
      'sanitized completed or incomplete run manifest exists',
      'matching provenance-bound security coverage observation exists',
    ],
    signalContract: 'SIGINT and SIGTERM use common signal cleanup',
    cleanupContract: 'no service ownership; only the selected owned run is read',
  },
  'assurance:stability': {
    selectorGrammar: '--command <test|harness|coverage|fault|compat> --seed-set <registered-set>',
    timeout: 'child-timeout+300s; campaign<=125-attempts',
    artifactSubdirectory: 'stability/<command>/<seed-set>/',
    prerequisites: [
      'child prerequisites satisfied',
      'fixed registered seed set',
      'empty sequence state',
    ],
    signalContract: 'SIGINT and SIGTERM trigger common signal cleanup for the active child',
    cleanupContract: 'owned resources use common cleanup and every attempt remains visible',
  },
  'assurance:all': {
    selectorGrammar: '',
    timeout: '7200s',
    artifactSubdirectory: 'all/',
    prerequisites: ['all command prerequisites satisfied', 'explicit local operator start'],
    signalContract: 'SIGINT and SIGTERM trigger common signal cleanup for the active child',
    cleanupContract: 'owned resources use common cleanup before the aggregate stops',
    composition: [
      'validate',
      'test',
      'harness:operational',
      'harness:production-security',
      'coverage',
      'fault',
      'compat',
      'report',
    ],
  },
};

/** Stable process outcome names keyed by exit code. */
export const exitTaxonomy = {
  0: 'success',
  20: 'product-failure',
  21: 'test-failure',
  30: 'setup-failure',
  40: 'coverage-incomplete',
  50: 'assurance-invalid',
  60: 'cleanup-failure',
  70: 'timeout',
  130: 'interrupted-sigint',
  143: 'interrupted-sigterm',
} as const;

/** Highest-to-lowest failure precedence when outcomes overlap. */
export const exitPrecedence = [60, 130, 143, 70, 50, 40, 30, 20, 21] as const;

/** Returns whether an untrusted command action belongs to the frozen allowlist. */
export function isAssuranceCommandAction(value: string): value is AssuranceCommandAction {
  return assuranceCommandActions.some((action) => action === value);
}

/** Returns the root alias for an allowlisted dispatcher action. */
export function rootAliasForAction(action: AssuranceCommandAction): string {
  return `assurance:${action}`;
}
