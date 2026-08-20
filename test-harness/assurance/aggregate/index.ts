export {
  aggregateExitCode,
  aggregateRetainedFields,
  validateAggregateEvidence,
} from './evidence.js';
export {
  runAssuranceAggregate,
  type AggregateInvocationExecutor,
  type AggregateRunnerDependencies,
  type AggregateRunResult,
} from './runner.js';
export { admitKnownIncompleteCollector } from './incomplete-admission.js';
export {
  aggregateChildRegistry,
  aggregateKnownGaps,
  aggregateKnownIncompleteCollectors,
  aggregateRegistryDigest,
} from './registry.js';
