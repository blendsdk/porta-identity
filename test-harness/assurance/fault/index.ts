export { loadFaultCatalog, resolveFaultFile, selectFault } from './catalog.js';
export { classifyFaultTuple, type FaultClassificationRequest } from './classification.js';
export {
  curatedFaultCatalogSchema,
  curatedFaultSchema,
  faultIdSchema,
  faultTargetSchema,
  faultTupleSchema,
  sha256IdentitySchema,
  type CuratedFault,
  type CuratedFaultCatalog,
  type FaultClassification,
  type FaultObservation,
  type FaultTuple,
  type FaultTupleResult,
} from './model.js';
export { runCuratedFault, type FaultCommandResult, type FaultCommandSelection } from './runner.js';
