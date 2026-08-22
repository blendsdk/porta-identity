/** Production-logger child probe for bearer and interaction path redaction. */

import { logger } from '../../../src/lib/logger.js';
import { requestLogger } from '../../../src/middleware/request-logger.js';

const artifact = process.env.PORTA_PROBE_ARTIFACT ?? '';
const interactionUid = process.env.PORTA_PROBE_INTERACTION ?? '';
const email = process.env.PORTA_PROBE_EMAIL ?? '';
const userId = process.env.PORTA_PROBE_USER ?? '';
const organizationId = process.env.PORTA_PROBE_ORGANIZATION ?? '';

if (![artifact, interactionUid, email, userId, organizationId].every((value) => value.length > 0)) {
  throw new Error('Operational log probe inputs are incomplete');
}

/** Execute the real request middleware for one protected path. */
async function logRequest(path: string): Promise<void> {
  const context = {
    state: {} as Record<string, unknown>,
    req: {},
    method: 'GET',
    path,
    status: 400,
    set: () => undefined,
  };
  await requestLogger()(context as never, async () => undefined);
}

await logRequest(`/tenant/auth/magic-link/${artifact}`);
await logRequest(`/interaction/${interactionUid}`);
logger.warn(
  { email, userId, organizationId, uid: interactionUid, interactionUid },
  'Magic link authority rejected',
);
