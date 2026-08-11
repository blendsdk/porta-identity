import { isAbsolute, normalize, resolve } from 'node:path';

import type {
  EndpointManifest,
  LifecycleRecoveryLookup,
  LifecycleStartRequest,
} from './lifecycle-planned.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const namePattern = /^[a-z][a-z0-9-]{0,62}$/u;
const unsafePathPattern = /[\p{Cc}`$;&|<>]/u;

/** Validates one untrusted lifecycle start request before any capability is invoked. */
export function validateStartRequest(request: LifecycleStartRequest): void {
  if (!uuidPattern.test(request.runId)) throw new Error('run identifier is invalid');
  if (!namePattern.test(request.scenarioId)) throw new Error('scenario identifier is invalid');
  if (!namePattern.test(request.environmentName)) throw new Error('environment name is invalid');
  validateCanonicalWorktree(request.worktreePath);
  if (
    !Number.isSafeInteger(request.candidateBasePort) ||
    request.candidateBasePort < 1024 ||
    request.candidateBasePort > 65_530
  ) {
    throw new Error('candidate port block is invalid');
  }
  if (
    !Number.isSafeInteger(request.collisionRetries) ||
    request.collisionRetries < 0 ||
    request.collisionRetries > 32
  ) {
    throw new Error('collision retry count is invalid');
  }
}

/** Validates the only caller-controlled fields accepted for stale recovery. */
export function validateRecoveryLookup(lookup: LifecycleRecoveryLookup): void {
  if (!uuidPattern.test(lookup.runId)) throw new Error('recovery run identifier is invalid');
  if (Object.keys(lookup).some((key) => key !== 'runId' && key !== 'worktreePath')) {
    throw new Error('recovery lookup contains resource identity');
  }
  validateCanonicalWorktree(lookup.worktreePath);
}

/** Creates one immutable endpoint block from validated input and an attempt ordinal. */
export function createEndpointManifest(
  request: LifecycleStartRequest,
  attempt: number,
): EndpointManifest {
  const basePort = request.candidateBasePort + attempt * 10;
  if (basePort > 65_530) throw new Error('candidate port retries exceed the valid range');
  const ports = Object.freeze({
    porta: basePort,
    app: basePort + 1,
    bff: basePort + 2,
    postgres: basePort + 3,
    redis: basePort + 4,
    mailhog: basePort + 5,
  });
  const urls = Object.freeze({
    porta: `https://porta-harness.ci.portaidentity.com:${ports.porta}`,
    app: `https://app-harness.ci.portaidentity.com:${ports.app}`,
    bff: `http://app-harness.ci.portaidentity.com:${ports.bff}`,
    postgres: `tcp://127.0.0.1:${ports.postgres}`,
    redis: `redis://127.0.0.1:${ports.redis}`,
    mailhog: `http://127.0.0.1:${ports.mailhog}`,
  });
  const certificatePath = resolve(
    request.worktreePath,
    'test-harness/.assurance-runtime',
    request.runId,
    'certs/server.crt',
  );
  return Object.freeze({
    runId: request.runId,
    scenarioId: request.scenarioId,
    composeProject: `porta-${request.runId.replaceAll('-', '')}`,
    worktreePath: request.worktreePath,
    environmentName: request.environmentName,
    ports,
    urls,
    certificatePath,
  });
}

/** Requires an absolute, normalized worktree path without control or shell syntax. */
function validateCanonicalWorktree(worktreePath: string): void {
  if (
    !isAbsolute(worktreePath) ||
    normalize(worktreePath) !== worktreePath ||
    unsafePathPattern.test(worktreePath)
  ) {
    throw new Error('worktree path is not canonical');
  }
}
