import type { ValidationExposureRawCase } from './validation-exposure-case-model.js';

/** Profiles supported by the owner-fenced production-exposure observer. */
export type ProductionExposureProfile = 'operational' | 'production-security';

/** Sanitized facts observed from one bounded public response. */
export interface ProductionExposureResponse {
  /** Actual status returned by the public boundary. */
  readonly status: number;
  /** Requirement-owned body classification derived from bounded response bytes. */
  readonly bodyContract: string;
  /** Requirement-owned response-header checks derived from actual headers. */
  readonly headerContracts: Readonly<Record<string, boolean>>;
}

/** Complete observation for one production policy or dependency case. */
export interface ProductionExposureObservation {
  /** Exact immutable case that produced this observation. */
  readonly caseId: string;
  /** Active lifecycle profile observed from the endpoint manifest. */
  readonly profile: ProductionExposureProfile;
  /** Same-handler positive control captured before the probe. */
  readonly control: ProductionExposureResponse;
  /** Policy or dependency probe captured from the public boundary. */
  readonly probe: ProductionExposureResponse;
  /** Independent state checks keyed by the immutable requirement vocabulary. */
  readonly independentStateObservations: Readonly<Record<string, boolean | 'unobserved'>>;
  /** Prohibited effects keyed by the immutable requirement vocabulary. */
  readonly prohibitedSideEffects: Readonly<Record<string, boolean | 'unobserved'>>;
  /** Whether an exact fresh control passed after restoration or policy probing. */
  readonly recoveryPassed: boolean;
  /** Correlated decision-log credit is unavailable until Porta emits one complete event. */
  readonly correlatedLogCredit: false;
  /** Stable gap explaining why this observation cannot close the log subclaim. */
  readonly correlatedLogGap: 'correlated-security-decision-event-unavailable';
}

/** Live retained-harness seam for production policy and dependency observations. */
export interface ProductionExposureContract {
  /** Executes one immutable case against the exact active lifecycle run. */
  observe(requirement: ValidationExposureRawCase): Promise<ProductionExposureObservation>;
  /** Releases in-process clients after every case has finished. */
  close(): Promise<void>;
}
