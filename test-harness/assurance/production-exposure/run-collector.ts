import process from 'node:process';

import { collectProductionExposureEvidence } from './collector.js';

try {
  const result = await collectProductionExposureEvidence();
  process.stdout.write(
    `ASSURANCE_PRODUCTION_EXPOSURE_RESULT: passed=${result.passed} productFailures=${result.productFailures} incomplete=${result.incomplete} executionFailures=${result.executionFailures} artifact=${result.artifactPath}\n`,
  );
  process.exitCode = result.exitCode;
} catch {
  process.stderr.write('ASSURANCE_PRODUCTION_EXPOSURE_FAILED: stage=collector\n');
  process.exitCode = 30;
}
