/**
 * Tests for the SDK client factory module.
 *
 * Verifies that createClient correctly resolves the server URL,
 * creates the SDK client, and handles the --insecure flag.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the SDK modules to avoid real network calls
vi.mock('@portaidentity/sdk', () => ({
  createPortaClient: vi.fn(() => ({ organizations: {}, users: {} })),
}));

vi.mock('@portaidentity/sdk/node', () => ({
  createNodeTransport: vi.fn(() => ({})),
  createCliAuth: vi.fn(() => ({})),
}));

// Mock global-options to control server URL resolution
vi.mock('../src/global-options.js', () => ({
  resolveServerUrl: vi.fn(() => 'https://porta.example.com'),
}));

import { createPortaClient } from '@portaidentity/sdk';
import { createNodeTransport, createCliAuth } from '@portaidentity/sdk/node';
import { createClient } from '../src/client-factory.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('client-factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  });

  afterEach(() => {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  });

  it('creates a PortaClient with resolved server URL', () => {
    const options = { json: false, verbose: false, insecure: false, force: false };
    const client = createClient(options);

    expect(createCliAuth).toHaveBeenCalledOnce();
    expect(createNodeTransport).toHaveBeenCalledWith({
      baseUrl: 'https://porta.example.com',
      auth: expect.anything(),
    });
    expect(createPortaClient).toHaveBeenCalledWith({ transport: expect.anything() });
    expect(client).toBeDefined();
  });

  it('sets NODE_TLS_REJECT_UNAUTHORIZED=0 when --insecure is true', () => {
    const options = { json: false, verbose: false, insecure: true, force: false };
    createClient(options);
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe('0');
  });

  it('does not set NODE_TLS_REJECT_UNAUTHORIZED when --insecure is false', () => {
    const options = { json: false, verbose: false, insecure: false, force: false };
    createClient(options);
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
  });
});
