import { connect as tlsConnect } from 'node:tls';
import { connect as netConnect } from 'node:net';

import { renderRawHttpRequest, type MaterializedRawRequest } from './request-material.js';

/**
 * Raw HTTP/1.1 transport for the P1 live boundary.
 *
 * The P1 oracle must observe exact request bytes, including octets that a normalizing client
 * rewrites or rejects (for example CR/LF inside a header value). This module therefore owns a
 * socket directly: it frames an already materialized request with `renderRawHttpRequest`, writes
 * the bytes, and reads a bounded response. It never follows redirects and never reuses a
 * connection.
 *
 * The framing helper remains the single owner of request framing. This module adds only the
 * network and response-parsing mechanics, and the socket factory is injectable so the parser can
 * be tested without a network.
 *
 * @module p1/raw-http-transport
 */

/** Default maximum time to wait for a complete response, in milliseconds. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Default maximum number of response bytes retained, protecting the harness from a runaway body. */
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;

/** One bounded HTTP response observed over a raw socket. */
export interface RawHttpResponse {
  /** Numeric status code from the response status line. */
  readonly status: number;
  /** Response headers with lower-cased names; a repeated name keeps its last value. */
  readonly headers: Readonly<Record<string, string>>;
  /** Decoded response body. */
  readonly body: Buffer;
}

/** Inputs for sending one materialized request over a raw socket. */
export interface SendRawRequestOptions {
  /** Absolute `http` or `https` origin, for example `https://porta-harness.ci.portaidentity.com`. */
  readonly url: string;
  /** Maximum time to wait for a complete response. Defaults to 10 seconds. */
  readonly timeoutMs?: number;
  /** Maximum number of response bytes retained. Defaults to 1 MiB. */
  readonly maxBytes?: number;
  /**
   * Whether to verify the server certificate. Defaults to `true`.
   *
   * The owned harness serves a generated certificate that its own clients do not verify, so the
   * harness may pass `false` for its loopback endpoint only. Production callers must leave it
   * unset.
   */
  readonly rejectUnauthorized?: boolean;
  /** Optional abort signal. Aborting destroys the socket. */
  readonly signal?: AbortSignal;
}

/** A resolved origin plus the connection facts a socket needs. */
interface ParsedOrigin {
  /** Whether the origin uses TLS. */
  readonly secure: boolean;
  /** Host name without a port. */
  readonly host: string;
  /** Numeric port. */
  readonly port: number;
  /** `host:port` authority used for the Host header. */
  readonly authority: string;
}

/** Resolves and validates one absolute origin. */
function parseOrigin(url: string): ParsedOrigin {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('P1 raw transport URL is invalid');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('P1 raw transport URL must be http or https');
  }
  const secure = parsed.protocol === 'https:';
  const port = parsed.port === '' ? (secure ? 443 : 80) : Number(parsed.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('P1 raw transport port is invalid');
  }
  return { secure, host: parsed.hostname, port, authority: `${parsed.hostname}:${port}` };
}

/** Decodes an HTTP/1.1 chunked transfer body. */
function decodeChunkedBody(bytes: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let offset = 0;
  for (;;) {
    const lineEnd = bytes.indexOf('\r\n', offset);
    if (lineEnd < 0) throw new Error('P1 raw response chunk size is truncated');
    const sizeLine = bytes.subarray(offset, lineEnd).toString('latin1').split(';')[0] ?? '';
    const size = Number.parseInt(sizeLine.trim(), 16);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error('P1 raw response chunk size is invalid');
    }
    offset = lineEnd + 2;
    if (size === 0) break;
    if (offset + size > bytes.length) throw new Error('P1 raw response chunk is truncated');
    chunks.push(bytes.subarray(offset, offset + size));
    offset += size;
    if (bytes.subarray(offset, offset + 2).toString('latin1') !== '\r\n') {
      throw new Error('P1 raw response chunk terminator is missing');
    }
    offset += 2;
  }
  return Buffer.concat(chunks);
}

/**
 * Parses raw HTTP/1.1 response bytes into a status, header map, and decoded body.
 *
 * Supports both `Content-Length` and `chunked` framing. A response with no length framing keeps a
 * body that spans to the end of the buffer, which is correct for a `Connection: close` response.
 *
 * @param bytes - Complete raw response bytes.
 * @returns The parsed status, headers, and body.
 * @throws {Error} When the header block or framing is malformed.
 */
export function parseRawHttpResponse(bytes: Buffer): RawHttpResponse {
  const boundary = bytes.indexOf('\r\n\r\n');
  if (boundary < 0) throw new Error('P1 raw response has no header terminator');
  const lines = bytes.subarray(0, boundary).toString('latin1').split('\r\n');
  const statusLine = lines.shift() ?? '';
  const statusMatch = /^HTTP\/1\.[01] (\d{3})(?: .*)?$/u.exec(statusLine);
  if (statusMatch?.[1] === undefined) throw new Error('P1 raw response status line is invalid');
  const status = Number.parseInt(statusMatch[1], 10);

  const headers: Record<string, string> = {};
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator <= 0) throw new Error('P1 raw response header line is invalid');
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    headers[name] = value;
  }

  const rawBody = bytes.subarray(boundary + 4);
  const transferEncoding = headers['transfer-encoding'];
  let body: Buffer;
  if (transferEncoding !== undefined && transferEncoding.toLowerCase().includes('chunked')) {
    body = decodeChunkedBody(rawBody);
  } else if (headers['content-length'] !== undefined) {
    const declared = Number.parseInt(headers['content-length'], 10);
    if (!Number.isSafeInteger(declared) || declared < 0) {
      throw new Error('P1 raw response content length is invalid');
    }
    body = rawBody.subarray(0, declared);
  } else {
    body = rawBody;
  }
  return { status, headers: Object.freeze(headers), body };
}

/** Writes the payload and resolves with every response byte until the peer closes the connection. */
function readResponseBytes(
  payload: Buffer,
  origin: ParsedOrigin,
  options: Required<Pick<SendRawRequestOptions, 'timeoutMs' | 'maxBytes' | 'rejectUnauthorized'>>,
  signal: AbortSignal | undefined,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const socket = origin.secure
      ? tlsConnect({
          host: origin.host,
          port: origin.port,
          servername: origin.host,
          rejectUnauthorized: options.rejectUnauthorized,
        })
      : netConnect({ host: origin.host, port: origin.port });

    const settle = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      socket.destroy();
      if (error === undefined) resolve(Buffer.concat(chunks));
      else reject(error);
    };
    const onAbort = (): void => settle(new Error('P1 raw transport request was aborted'));
    const timer = setTimeout(
      () => settle(new Error('P1 raw transport request timed out')),
      options.timeoutMs,
    );

    if (signal?.aborted === true) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });

    socket.on(origin.secure ? 'secureConnect' : 'connect', () => socket.write(payload));
    socket.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > options.maxBytes) {
        settle(new Error('P1 raw transport response exceeded the byte bound'));
        return;
      }
      chunks.push(chunk);
    });
    socket.on('end', () => settle());
    socket.on('error', (error: Error) => settle(error));
  });
}

/**
 * Sends one materialized request over a raw socket and returns the bounded parsed response.
 *
 * @param request - Exact request material, framed by `renderRawHttpRequest`.
 * @param options - Destination origin and bounds.
 * @returns The parsed status, headers, and body.
 */
export async function sendRawRequest(
  request: MaterializedRawRequest,
  options: SendRawRequestOptions,
): Promise<RawHttpResponse> {
  const origin = parseOrigin(options.url);
  const payload = renderRawHttpRequest(request, origin.authority);
  const bytes = await readResponseBytes(
    payload,
    origin,
    {
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBytes: options.maxBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      rejectUnauthorized: options.rejectUnauthorized ?? true,
    },
    options.signal,
  );
  return parseRawHttpResponse(bytes);
}
