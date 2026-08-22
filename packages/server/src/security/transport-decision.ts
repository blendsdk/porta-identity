/** Privacy-safe handling for HTTP parser failures which occur before Koa middleware. */

import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { Socket } from 'node:net';
import { createSecurityDecisionEvent } from './decision-event.js';
import {
  logSecurityDecision,
  recordSecurityDecisionSinkFailure,
  type SecurityDecisionSink,
} from './decision-context.js';

const MINIMAL_BAD_REQUEST =
  'HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n';

/** Attach one owner for HTTP parser failures and return a removal callback. */
export function attachTransportDecisionHandler(
  server: Server,
  sink: SecurityDecisionSink = logSecurityDecision,
): () => void {
  const handledSockets = new WeakSet<Socket>();
  const onClientError = (_error: Error, socket: Socket): void => {
    if (handledSockets.has(socket)) return;
    handledSockets.add(socket);

    const event = createSecurityDecisionEvent({
      requestId: randomUUID(),
      surface: 'transport',
      method: 'UNKNOWN',
      routeTemplate: '/transport',
      statusCode: 400,
      outcome: 'deny',
      decisionPoint: 'transport',
      reasonCode: 'transport-parse-failed',
    });
    void Promise.resolve(sink(event)).catch(recordSecurityDecisionSinkFailure);

    if (socket.writable && !socket.destroyed) socket.end(MINIMAL_BAD_REQUEST);
    else socket.destroy();
  };

  server.on('clientError', onClientError);
  return () => server.off('clientError', onClientError);
}
