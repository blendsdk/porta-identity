import type { AdminDataCaseRequirement, AdminDataResult } from './admin-data-case-requirements.js';
import type {
  ValidationExposureRawCase,
  ValidationExposureResult,
} from './validation-exposure-case-model.js';

/** One concrete response observed through a raw public HTTP boundary. */
export interface P1PublicResponseObservation {
  /** Actual status returned by Porta. */
  readonly status: number;
  /** Requirement-owned body contract classified from the actual bounded response. */
  readonly bodyContract: string;
  /** Requirement-owned header contracts and whether each was observed. */
  readonly headerContracts: Readonly<Record<string, boolean>>;
}

/** Executable observation for one validation or exposure case. */
export interface ValidationExposureLiveObservation {
  /** Exact requirement case executed by the adapter. */
  readonly caseId: string;
  /** Profile of the active owner-fenced harness run. */
  readonly profile: 'operational' | 'production-security';
  /** Raw transport prevents a client library from normalizing the probe. */
  readonly rawTransport: boolean;
  /** Public result derived from the actual response. */
  readonly result: ValidationExposureResult;
  /** Same-handler positive control response. */
  readonly control: P1PublicResponseObservation;
  /** Negative or policy-probe response. */
  readonly probe: P1PublicResponseObservation;
  /** Independent requirement-owned state observations. */
  readonly independentStateObservations: Readonly<Record<string, boolean>>;
  /** Requirement-owned prohibited effects and whether each occurred. */
  readonly prohibitedSideEffects: Readonly<Record<string, boolean>>;
  /** Fields observed together in one privacy-safe correlated event. */
  readonly observedLogFields: readonly string[];
  /** Forbidden fields found in response, log, audit, or retained evidence. */
  readonly exposedForbiddenFields: readonly string[];
  /** Fresh positive control executed after the probe. */
  readonly recoveryPassed: boolean;
}

/** Executable observation for one administrative-data case. */
export interface AdminDataLiveObservation {
  /** Exact requirement case executed by the adapter. */
  readonly caseId: string;
  /** Public result derived from the actual response. */
  readonly result: AdminDataResult;
  /** Actual status returned by Porta. */
  readonly status: number;
  /** Exact public outcome classified from the bounded response and effect. */
  readonly exactPublicOutcome: string;
  /** Authorized control proved the intended handler and target reachable. */
  readonly authorizedControlPassed: boolean;
  /** Independent requirement-owned state and lifecycle observations. */
  readonly independentObservations: Readonly<Record<string, boolean>>;
  /** Requirement-owned prohibited effects and whether each occurred. */
  readonly prohibitedSideEffects: Readonly<Record<string, boolean>>;
  /** Fields observed together in one privacy-safe correlated event. */
  readonly observedLogFields: readonly string[];
  /** Forbidden fields found in response, log, audit, or retained evidence. */
  readonly exposedForbiddenFields: readonly string[];
  /** Fresh same-action control or explicit restoration completed after the probe. */
  readonly recoveryPassed: boolean;
}

/** Stable seam implemented by the retained harness without embedding expectations. */
export interface P1LiveBoundaryContract {
  /** Executes one operational validation/exposure requirement exactly as declared. */
  observeValidationCase(
    requirement: ValidationExposureRawCase,
  ): Promise<ValidationExposureLiveObservation>;
  /** Executes one administrative-data requirement exactly as declared. */
  observeAdminDataCase(requirement: AdminDataCaseRequirement): Promise<AdminDataLiveObservation>;
}
