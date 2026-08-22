import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';

import type {
  EndpointAvailabilityAdapter,
  EndpointManifest,
  EndpointName,
  Presence,
  ProcessIdentity,
  ProcessProbeAdapter,
} from './lifecycle-planned.js';
import { hasErrorCode } from './lifecycle-os-error.js';

/** Complete endpoint set used by loopback availability checks. */
const endpointNames = ['porta', 'app', 'bff', 'postgres', 'redis', 'mailhog'] as const;

/** Linux process probe that includes the kernel start tick to reject PID reuse. */
export class LinuxProcessProbeAdapter implements ProcessProbeAdapter {
  /** Returns the identity of the process executing the lifecycle command. */
  public async currentIdentity(): Promise<ProcessIdentity> {
    return linuxProcessIdentity(process.pid);
  }

  /** Distinguishes the exact recorded process from a reused PID or unreadable process table. */
  public async presence(identity: ProcessIdentity): Promise<Presence> {
    try {
      return readProcessStartFingerprint(identity.pid) === identity.startedAtFingerprint
        ? 'present'
        : 'absent';
    } catch (error) {
      return hasErrorCode(error, 'ENOENT') ? 'absent' : 'unreadable';
    }
  }
}

/** Returns one PID-reuse-resistant Linux process identity for durable child ownership. */
export function linuxProcessIdentity(pid: number): ProcessIdentity {
  return { pid, startedAtFingerprint: readProcessStartFingerprint(pid) };
}

/** Loopback availability probe used before an atomic harness lease is accepted. */
export class LoopbackEndpointAvailabilityAdapter implements EndpointAvailabilityAdapter {
  /** Returns every endpoint that cannot currently bind on IPv4 loopback. */
  public async occupiedEndpoints(manifest: EndpointManifest): Promise<readonly EndpointName[]> {
    const occupied: EndpointName[] = [];
    for (const name of endpointNames) {
      if (await isPortOccupied(manifest.ports[name])) occupied.push(name);
    }
    return Object.freeze(occupied);
  }
}

/** Reads the Linux kernel start-tick identity for one process. */
export function readProcessStartFingerprint(pid: number): string {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
  const commandEnd = stat.lastIndexOf(')');
  const fields = stat
    .slice(commandEnd + 2)
    .trim()
    .split(/\s+/u);
  const startTick = fields[19];
  if (commandEnd < 0 || startTick === undefined) throw new Error('process identity is unreadable');
  return `${pid}:${startTick}`;
}

/** Checks one port using a temporary loopback listener and always closes it. */
function isPortOccupied(port: number): Promise<boolean> {
  return new Promise((resolveOccupied, rejectOccupied) => {
    const server = createServer();
    server.once('error', (error) => {
      if (hasErrorCode(error, 'EADDRINUSE') || hasErrorCode(error, 'EACCES')) {
        resolveOccupied(true);
      } else {
        rejectOccupied(error);
      }
    });
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.close((error) => {
        if (error === undefined) resolveOccupied(false);
        else rejectOccupied(error);
      });
    });
  });
}
