import { randomBytes } from 'node:crypto';

import { activeEndpoints } from '../../fixtures/fixture-assurance.js';
import { RuntimeCommandRunner } from '../../fixtures/lifecycle-runtime-command.js';
import type { ValidationExposureRawCase } from '../tests/validation-exposure-case-model.js';
import { validationExposureRawCases } from '../tests/validation-exposure-raw-case-requirements.js';
import { LiveProtocolContext, livePkceChallenge } from '../tests/protocol-live-http.js';
import { LiveTenantAdminContext } from '../tests/tenant-admin-live-context.js';
import {
  correlateByRequestId,
  parseDecisionLog,
  projectObservedFields,
} from '../p1/decision-log.js';
import { capturePortaLog } from '../p1/porta-log-source.js';
import { materializeRawRequest } from '../p1/request-material.js';
import { sendRawRequest, type RawHttpResponse } from '../p1/raw-http-transport.js';

const endpoints = activeEndpoints();
const admin = new LiveTenantAdminContext();
const protocol = new LiveProtocolContext();
const runner = new RuntimeCommandRunner();

const replacements: Record<string, string> = {
  alphaOrgId: admin.entity('alpha'),
  bravoOrgId: admin.entity('bravo'),
  alphaUserId: admin.entity('alpha-user-active'),
  bravoUserId: admin.entity('bravo-user-active'),
  alphaSessionId: admin.entity('alpha-session-baseline'),
  bravoSessionId: admin.entity('bravo-session-baseline'),
  alphaClientId: protocol.client('alpha', 'public').clientId,
  validS256Challenge: livePkceChallenge(randomBytes(48).toString('base64url')),
  'synthetic-full-authority-token': admin.credential(
    admin.adminActor('admin-full').tokenCredentialRef,
  ),
};

async function execute(request: ValidationExposureRawCase['request']): Promise<RawHttpResponse> {
  const materialized = materializeRawRequest(request, replacements, 100 * 1024);
  return sendRawRequest(materialized, {
    url: endpoints.porta,
    rejectUnauthorized: false,
    timeoutMs: 15_000,
  });
}

for (const requirement of validationExposureRawCases) {
  const started = Date.now();
  let controlStatus = 0;
  let probeStatus = 0;
  let recoveryStatus = 0;
  let requestId = '';
  let error = '';
  try {
    controlStatus = (await execute(requirement.control.request)).status;
    const probe = await execute(requirement.request);
    probeStatus = probe.status;
    requestId = probe.headers['x-request-id'] ?? '';
    recoveryStatus = (await execute(requirement.control.request)).status;
  } catch (thrown) {
    error = thrown instanceof Error ? thrown.message : String(thrown);
  }
  const capture = await capturePortaLog({
    repositoryRoot: process.cwd(),
    activeRun: { composeProject: endpoints.composeProject },
    runner,
    environment: process.env as Record<string, string>,
    since: new Date(started - 1_000),
    until: new Date(Date.now() + 1_000),
  });
  const records = parseDecisionLog(capture.text);
  const correlated = correlateByRequestId(records, requestId);
  const decision = correlated.find((record) => record.kind === 'security-decision');
  const completion = correlated.find((record) => record.kind === 'request-completion');
  process.stdout.write(
    `${JSON.stringify({
      id: requirement.id,
      expectedStatus: requirement.expected.status,
      controlStatus,
      probeStatus,
      recoveryStatus,
      requestId,
      error,
      decision: decision === undefined ? null : (decision.reasonCode ?? 'decision'),
      completion: completion?.statusCode ?? null,
      observedFields:
        decision === undefined
          ? []
          : projectObservedFields(decision, requirement.requiredLogFields),
    })}\n`,
  );
}

await protocol.close();
await admin.close();
