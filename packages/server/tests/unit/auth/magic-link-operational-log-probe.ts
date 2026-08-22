/** Production-logger child probe for bearer and interaction path redaction. */

import Koa from 'koa';
import { requestLogger } from '../../../src/middleware/request-logger.js';

const artifact = process.env.PORTA_PROBE_ARTIFACT ?? '';
const interactionUid = process.env.PORTA_PROBE_INTERACTION ?? '';
const email = process.env.PORTA_PROBE_EMAIL ?? '';
const userId = process.env.PORTA_PROBE_USER ?? '';
const organizationId = process.env.PORTA_PROBE_ORGANIZATION ?? '';

if (![artifact, interactionUid, email, userId, organizationId].every((value) => value.length > 0)) {
  throw new Error('Operational log probe inputs are incomplete');
}

const app = new Koa();
app.use(requestLogger());
app.use((ctx) => {
  ctx.status = 400;
  ctx.body = 'Rejected';
});
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
if (!address || typeof address === 'string') {
  throw new Error('Operational log probe did not receive a loopback port');
}
const baseUrl = `http://127.0.0.1:${address.port}`;
for (const path of [
  `/tenant/auth/magic-link/${artifact}`,
  `/tenant/auth/magic-link/${artifact}/`,
  `/tenant/auth/magic-link/${artifact}/unmatched`,
  `/interaction/${interactionUid}`,
  `/interaction/${interactionUid}/consent`,
]) {
  const response = await fetch(new URL(path, baseUrl));
  await response.arrayBuffer();
}
await new Promise<void>((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
});
