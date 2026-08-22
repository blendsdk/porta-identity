import { admitProductionExposureCases } from './admission.js';
import {
  productionExposureCaseEvidence,
  productionExposureCollectorExit,
  productionExposureExecutionFailure,
  writeProductionExposureEvidence,
  type ProductionExposureCaseEvidence,
} from './evidence.js';
import { createProductionExposureContract } from '../tests/production-exposure-adapter.js';
import { validationExposureProductionCases } from '../tests/validation-exposure-production-case-requirements.js';
import { validationExposureRawCases } from '../tests/validation-exposure-raw-case-requirements.js';

/** Result of one complete live production-exposure collection. */
export interface ProductionExposureCollectionResult {
  readonly exitCode: 0 | 20 | 30 | 40;
  readonly artifactPath: string;
  readonly passed: number;
  readonly productFailures: number;
  readonly incomplete: number;
  readonly executionFailures: number;
}

/** Collects every applicable case while preserving product and observer failure taxonomy. */
export async function collectProductionExposureEvidence(): Promise<ProductionExposureCollectionResult> {
  const profile = process.env.HARNESS_PROFILE;
  if (profile !== 'operational' && profile !== 'production-security') {
    throw new Error('production exposure profile is unavailable');
  }
  const requirements = admitProductionExposureCases(profile, [
    ...validationExposureRawCases,
    ...validationExposureProductionCases,
  ]);
  const observer = await createProductionExposureContract();
  const records: ProductionExposureCaseEvidence[] = [];
  try {
    for (const requirement of requirements) {
      try {
        const observation = await observer.observe(requirement);
        records.push(productionExposureCaseEvidence(requirement, observation));
      } catch {
        records.push(productionExposureExecutionFailure(requirement));
      }
    }
  } finally {
    await observer.close();
  }
  const artifactPath = writeProductionExposureEvidence(records);
  return Object.freeze({
    exitCode: productionExposureCollectorExit(records),
    artifactPath,
    passed: records.filter((record) => record.outcome === 'passed').length,
    productFailures: records.filter((record) => record.outcome === 'product-failure').length,
    incomplete: records.filter((record) => record.outcome === 'incomplete').length,
    executionFailures: records.filter((record) => record.outcome === 'execution-failure').length,
  });
}
