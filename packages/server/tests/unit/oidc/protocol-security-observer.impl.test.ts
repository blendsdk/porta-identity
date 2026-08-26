import type { IncomingMessage } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

import { logger } from '../../../src/lib/logger.js';
import {
  digestProtocolClientId,
  observeProtocolSecurityRejection,
  registerProtocolRequestCorrelation,
} from '../../../src/oidc/protocol-security-observer.js';

describe('protocol security observer implementation', () => {
  beforeEach(() => {
    vi.mocked(logger.warn).mockReset();
  });

  it('accepts only bounded non-empty client identifiers', () => {
    expect(digestProtocolClientId('client')).toMatch(/^[a-f0-9]{64}$/);
    expect(digestProtocolClientId('client')).toBe(digestProtocolClientId('client'));
    expect(digestProtocolClientId('other')).not.toBe(digestProtocolClientId('client'));
    expect(digestProtocolClientId('')).toBeNull();
    expect(digestProtocolClientId('x'.repeat(256))).toBeNull();
    expect(digestProtocolClientId({ clientId: 'client' })).toBeNull();
  });

  it('suppresses duplicate request and event-class observations', () => {
    const request = {} as IncomingMessage;
    registerProtocolRequestCorrelation(request, 'request-1');

    observeProtocolSecurityRejection({
      request,
      eventClass: 'authorization-rejected',
      clientId: 'client',
    });
    observeProtocolSecurityRejection({
      request,
      eventClass: 'authorization-rejected',
      clientId: 'client',
    });

    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('keeps distinct rejection classes on the same request observable', () => {
    const request = {} as IncomingMessage;
    registerProtocolRequestCorrelation(request, 'request-2');

    observeProtocolSecurityRejection({ request, eventClass: 'authorization-rejected' });
    observeProtocolSecurityRejection({ request, eventClass: 'interaction-context-rejected' });

    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('does not emit an uncorrelated event or propagate a logger failure', () => {
    observeProtocolSecurityRejection({
      request: {} as IncomingMessage,
      eventClass: 'authorization-rejected',
      clientId: 'client',
    });
    expect(logger.warn).not.toHaveBeenCalled();

    const request = {} as IncomingMessage;
    registerProtocolRequestCorrelation(request, 'request-3');
    vi.mocked(logger.warn).mockImplementationOnce(() => {
      throw new Error('logger unavailable');
    });
    expect(() =>
      observeProtocolSecurityRejection({
        request,
        eventClass: 'authorization-rejected',
        clientId: 'client',
      }),
    ).not.toThrow();
  });
});
