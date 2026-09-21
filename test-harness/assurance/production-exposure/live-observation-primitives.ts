import { createHash, randomBytes } from 'node:crypto';
import { request as plainHttpRequest } from 'node:http';

import type { APIResponse } from '@playwright/test';

import { LiveProtocolContext, livePkceChallenge } from '../tests/protocol-live-http.js';
import { LiveTenantAdminContext } from '../tests/tenant-admin-live-context.js';
import type { ValidationExposureRawCase } from '../tests/validation-exposure-case-model.js';
import { boundedPublicResponse, type BoundedPublicResponse } from './response-classifier.js';
import type { InterruptibleService } from './service-controller.js';

/** Observation state that is explicitly not available from the selected public boundary. */
export const unobserved = 'unobserved' as const;

/** Converts a Playwright response into one bounded, non-secret in-process response. */
export async function boundedResponse(response: APIResponse): Promise<BoundedPublicResponse> {
  return boundedPublicResponse(response.status(), response.headers(), await response.text());
}

/** Creates a stable digest for independent before/after response-state comparisons. */
export function responseDigest(response: BoundedPublicResponse): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify({ status: response.status, body: response.body }))
    .digest('hex')}`;
}

/** Replaces only the closed placeholders used by the production-exposure requirement catalog. */
export function replacePathPlaceholders(
  value: string,
  context: LiveTenantAdminContext,
  protocol: LiveProtocolContext,
): string {
  const client = protocol.client('alpha', 'public');
  const verifier = randomBytes(48).toString('base64url');
  return value
    .replaceAll('{alphaOrgId}', context.entity('alpha'))
    .replaceAll('{alphaClientId}', encodeURIComponent(client.clientId))
    .replaceAll('{registeredRedirect}', encodeURIComponent(client.redirectUri))
    .replaceAll('{validS256Challenge}', livePkceChallenge(verifier));
}

/** Maps a requirement request into concrete headers without retaining bearer material. */
export function concreteHeaders(
  requirementHeaders: Readonly<Record<string, string>>,
  context: LiveTenantAdminContext,
): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(requirementHeaders)) {
    if (value.includes('{synthetic-full-authority-token}')) {
      headers[name] = context.adminHeaders('admin-full').Authorization ?? '';
    } else if (value === 'https://app-harness.ci.portaidentity.com') {
      headers[name] = new URL(context.endpoints.app).origin;
    } else {
      headers[name] = value;
    }
  }
  return Object.freeze(headers);
}

/** Returns the dependency service selected by one immutable arrangement. */
export function dependencyService(requirement: ValidationExposureRawCase): InterruptibleService {
  switch (requirement.harnessArrangement) {
    case 'owned-database-unavailable':
      return 'postgres';
    case 'owned-cache-unavailable':
      return 'redis';
    case 'owned-mail-unavailable-with-acquired-csrf-browser':
      return 'mailhog';
    default:
      throw new Error('production exposure case does not select an interruptible dependency');
  }
}

/** Proves that cleartext HTTP cannot complete on the run-owned TLS listener. */
export function plaintextTlsRejected(port: number): Promise<boolean> {
  return new Promise((resolveProbe) => {
    const request = plainHttpRequest(
      { host: '127.0.0.1', port, path: '/health', method: 'GET', timeout: 5_000 },
      (response) => {
        const rejectedWithoutCookie =
          (response.statusCode ?? 0) >= 400 && response.headers['set-cookie'] === undefined;
        response.resume();
        resolveProbe(rejectedWithoutCookie);
      },
    );
    request.once('error', () => resolveProbe(true));
    request.once('timeout', () => {
      request.destroy();
      resolveProbe(true);
    });
    request.end();
  });
}
