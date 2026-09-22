import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:net';
import test from 'node:test';

import { materializeRawRequest, type MaterializedRawRequest } from '../p1/request-material.js';
import { parseRawHttpResponse, sendRawRequest } from '../p1/raw-http-transport.js';

/** One exact raw request whose header value deliberately carries CR/LF octets. */
const crlfRequest: MaterializedRawRequest = materializeRawRequest(
  {
    transport: 'raw-http',
    method: 'GET',
    path: '/api/admin/organizations/alpha/users',
    headers: { 'x-request-id': 'synthetic\r\nX-Assurance-Injected: true' },
    body: null,
    clientNormalization: 'forbidden',
  },
  {},
  1_024,
);

/** Starts a loopback server that records the first request and returns fixed bytes. */
function startServer(response: Buffer | null): Promise<{
  readonly port: number;
  readonly received: () => Buffer;
  readonly close: () => Promise<void>;
}> {
  return new Promise((resolve) => {
    let received = Buffer.alloc(0);
    const server: Server = createServer((socket) => {
      socket.on('data', (chunk: Buffer) => {
        received = Buffer.concat([received, chunk]);
        if (received.includes('\r\n\r\n') && response !== null) socket.end(response);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('server did not bind');
      resolve({
        port: address.port,
        received: () => received,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

test('parses a content-length response into status, headers, and body', () => {
  const response = parseRawHttpResponse(
    Buffer.from(
      'HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}',
    ),
  );
  assert.equal(response.status, 400);
  assert.equal(response.headers['content-type'], 'application/json');
  assert.equal(response.body.toString('utf8'), '{}');
});

test('decodes a chunked response body', () => {
  const response = parseRawHttpResponse(
    Buffer.from('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2\r\n{}\r\n0\r\n\r\n'),
  );
  assert.equal(response.status, 200);
  assert.equal(response.body.toString('utf8'), '{}');
});

test('rejects a malformed status line', () => {
  assert.throws(
    () => parseRawHttpResponse(Buffer.from('not-http\r\n\r\n')),
    /status line is invalid/u,
  );
});

test('sends exact raw octets, including a CR/LF-carrying header value', async () => {
  const server = await startServer(
    Buffer.from('HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}'),
  );
  try {
    const response = await sendRawRequest(crlfRequest, {
      url: `http://127.0.0.1:${server.port}`,
    });
    assert.equal(response.status, 200);
    const received = server.received().toString('latin1');
    assert.ok(received.includes('x-request-id: synthetic\r\nX-Assurance-Injected: true'));
    assert.match(received, /^GET \/api\/admin\/organizations\/alpha\/users HTTP\/1\.1\r\n/u);
  } finally {
    await server.close();
  }
});

test('rejects a response that exceeds the byte bound', async () => {
  const server = await startServer(
    Buffer.from(
      `HTTP/1.1 200 OK\r\nContent-Length: 100\r\nConnection: close\r\n\r\n${'x'.repeat(100)}`,
    ),
  );
  try {
    await assert.rejects(
      sendRawRequest(crlfRequest, { url: `http://127.0.0.1:${server.port}`, maxBytes: 10 }),
      /exceeded the byte bound/u,
    );
  } finally {
    await server.close();
  }
});

test('rejects when the response does not arrive in time', async () => {
  const server = await startServer(null);
  try {
    await assert.rejects(
      sendRawRequest(crlfRequest, { url: `http://127.0.0.1:${server.port}`, timeoutMs: 50 }),
      /timed out/u,
    );
  } finally {
    await server.close();
  }
});
