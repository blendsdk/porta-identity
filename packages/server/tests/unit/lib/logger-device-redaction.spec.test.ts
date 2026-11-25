/**
 * Specification tests for device-code log redaction.
 *
 * Pino redaction happens before serialization, so the assertion must read the
 * actual destination stream rather than the in-process operational observer.
 * Both device codes and user codes are bearer-like secrets for the lifetime of
 * the authorization and must never reach a structured log sink.
 */

import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../../../src/lib/logger.js';

/** Collect serialized log lines written to one destination stream. */
function captureDestination(): { destination: Writable; read(): string } {
  const chunks: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { destination, read: () => chunks.join('') };
}

describe('device log redaction', () => {
  it('redacts every supported top-level and nested code field at the destination', () => {
    const capture = captureDestination();
    const testLogger = createLogger({ destination: capture.destination, level: 'info' });

    testLogger.info(
      {
        device_code: 'device-secret',
        user_code: 'user-secret',
        deviceCode: 'camel-device-secret',
        userCode: 'camel-user-secret',
        nested: {
          device_code: 'nested-device-secret',
          user_code: 'nested-user-secret',
          deviceCode: 'nested-camel-device',
          userCode: 'nested-camel-user',
        },
        req: {
          body: {
            device_code: 'body-device-secret',
            user_code: 'body-user-secret',
          },
        },
      },
      'device redaction probe',
    );
    testLogger.flush();

    const output = capture.read();
    for (const secret of [
      'device-secret',
      'user-secret',
      'camel-device-secret',
      'camel-user-secret',
      'nested-device-secret',
      'nested-user-secret',
      'nested-camel-device',
      'nested-camel-user',
      'body-device-secret',
      'body-user-secret',
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain('[Redacted]');
  });

});
