/** Fail-closed local prerequisites for the administration playground. */

import { execFile as execFileCallback } from 'node:child_process';
import { X509Certificate, createPrivateKey, createPublicKey } from 'node:crypto';
import { resolve4, resolve6 } from 'node:dns/promises';
import { chmod, mkdir, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

/** Fixed loopback-only hostname reserved for this local test environment. */
export const PLAYGROUND_HOSTNAME = 'porta-admin-playground.ci.portaidentity.com';

const execFile = promisify(execFileCallback);

/** Converts an environment port to a validated unprivileged TCP port. */
export function validatePlaygroundPort(value, fallback, name) {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`${name} must be an unprivileged TCP port between 1024 and 65535.`);
  }
  return port;
}

/** Requires the complete DNS result to be one IPv4 loopback and no IPv6 answers. */
export async function verifyPlaygroundDns(dependencies = {}) {
  const resolveIpv4 = dependencies.resolve4 ?? resolve4;
  const resolveIpv6 = dependencies.resolve6 ?? resolve6;
  const ipv4 = [...new Set(await resolveIpv4(PLAYGROUND_HOSTNAME))].sort();
  let ipv6 = [];
  try {
    ipv6 = [...new Set(await resolveIpv6(PLAYGROUND_HOSTNAME))].sort();
  } catch (error) {
    if (!error || !['ENODATA', 'ENOTFOUND'].includes(error.code)) throw error;
  }
  if (ipv4.length !== 1 || ipv4[0] !== '127.0.0.1' || ipv6.length !== 0) {
    throw new Error(
      `Playground DNS is unsafe: expected A=127.0.0.1 and no AAAA; observed A=${ipv4.join(',') || 'none'} AAAA=${ipv6.join(',') || 'none'}.`,
    );
  }
}

/** Proves a loopback port can be bound without terminating its current owner. */
export async function verifyLoopbackPortAvailable(
  port,
  create = createServer,
  occupiedByPlayground = false,
) {
  await new Promise((resolveCheck, rejectCheck) => {
    const server = create();
    server.once('error', () =>
      occupiedByPlayground
        ? resolveCheck()
        : rejectCheck(new Error(`Loopback port ${port} is unavailable.`)),
    );
    server.listen(port, '127.0.0.1', () => server.close(resolveCheck));
  });
}

/** Requires a command to be available without invoking a shell. */
export async function requireTool(
  command,
  runner = execFile,
  arguments_ = ['--version'],
  label = command,
) {
  try {
    await runner(command, arguments_, { timeout: 10_000 });
  } catch {
    throw new Error(`Required tool is unavailable: ${label}.`);
  }
}

/** Creates the ignored runtime directories and enforces owner-only permissions. */
export async function ensureRuntimePermissions(runtimeDirectory) {
  await mkdir(resolve(runtimeDirectory, 'tls'), { recursive: true, mode: 0o700 });
  await chmod(runtimeDirectory, 0o700);
  await chmod(resolve(runtimeDirectory, 'tls'), 0o700);
  for (const path of [runtimeDirectory, resolve(runtimeDirectory, 'tls')]) {
    const metadata = await stat(path);
    if ((metadata.mode & 0o077) !== 0) {
      throw new Error(`Playground runtime permissions are unsafe: ${path}.`);
    }
  }
}

/** Generates or validates the exact-host certificate through the trusted local mkcert CA. */
export async function ensureTrustedCertificate(runtimeDirectory, runner = execFile) {
  const certificatePath = resolve(runtimeDirectory, 'tls/server.pem');
  const keyPath = resolve(runtimeDirectory, 'tls/server-key.pem');
  let caRoot;
  let certificateAuthority;
  try {
    ({ stdout: caRoot } = await runner('mkcert', ['-CAROOT'], { timeout: 10_000 }));
    certificateAuthority = new X509Certificate(
      await readFile(resolve(caRoot.trim(), 'rootCA.pem')),
    );
  } catch {
    throw new Error('mkcert local CA is unavailable or untrusted. Run mkcert -install first.');
  }

  const certificateIsUsable = async () => {
    const certificate = new X509Certificate(await readFile(certificatePath));
    const privateKey = createPrivateKey(await readFile(keyPath));
    const certificatePublicKey = certificate.publicKey.export({ format: 'der', type: 'spki' });
    const privatePublicKey = createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
    const now = Date.now();
    return (
      certificate.checkHost(PLAYGROUND_HOSTNAME) !== undefined &&
      Date.parse(certificate.validFrom) <= now &&
      Date.parse(certificate.validTo) >= now &&
      certificatePublicKey.equals(privatePublicKey) &&
      certificate.verify(certificateAuthority.publicKey)
    );
  };

  try {
    if (!(await certificateIsUsable())) throw new Error('certificate is unusable');
    await chmod(keyPath, 0o600);
    return { certificatePath, keyPath };
  } catch {
    await mkdir(dirname(certificatePath), { recursive: true, mode: 0o700 });
    await runner(
      'mkcert',
      ['-cert-file', certificatePath, '-key-file', keyPath, PLAYGROUND_HOSTNAME],
      { timeout: 30_000 },
    );
    await chmod(keyPath, 0o600);
    if (!(await certificateIsUsable())) {
      throw new Error('mkcert did not generate the exact playground certificate.');
    }
    return { certificatePath, keyPath };
  }
}

/** Runs every local check needed before a lifecycle command may mutate Docker state. */
export async function runPreflight(options = {}) {
  const environment = options.environment ?? process.env;
  const runtimeDirectory = options.runtimeDirectory;
  if (!runtimeDirectory) throw new Error('Playground runtime directory is required.');
  const httpsPort = validatePlaygroundPort(
    environment.PORTA_ADMIN_HTTPS_PORT,
    3543,
    'PORTA_ADMIN_HTTPS_PORT',
  );
  const mailhogPort = validatePlaygroundPort(
    environment.PORTA_ADMIN_MAILHOG_PORT,
    8026,
    'PORTA_ADMIN_MAILHOG_PORT',
  );
  if (httpsPort === mailhogPort) throw new Error('Playground host ports must be distinct.');

  const runner = options.execFile ?? execFile;
  await requireTool('docker', runner);
  await requireTool('docker', runner, ['compose', 'version'], 'docker compose');
  await requireTool('mkcert', runner);
  await verifyPlaygroundDns(options);
  await ensureRuntimePermissions(runtimeDirectory);
  const allowedOccupiedPorts = new Set(options.allowedOccupiedPorts ?? []);
  await verifyLoopbackPortAvailable(
    httpsPort,
    options.createServer,
    allowedOccupiedPorts.has(httpsPort),
  );
  await verifyLoopbackPortAvailable(
    mailhogPort,
    options.createServer,
    allowedOccupiedPorts.has(mailhogPort),
  );
  const certificate = await ensureTrustedCertificate(runtimeDirectory, runner);
  return { httpsPort, mailhogPort, ...certificate };
}
