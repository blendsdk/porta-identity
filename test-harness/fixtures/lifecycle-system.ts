import { createServer } from 'node:net';
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

import { z } from 'zod';

import type {
  EndpointAvailabilityAdapter,
  EndpointManifest,
  EndpointName,
  LeaseRecord,
  LeaseStateAdapter,
  LifecycleRecoveryLookup,
  ManifestConsumerAdapter,
  Presence,
  ProcessIdentity,
  ProcessProbeAdapter,
} from './lifecycle-planned.js';

const endpointNames = ['porta', 'app', 'bff', 'postgres', 'redis', 'mailhog'] as const;
const processIdentitySchema = z.object({
  pid: z.number().int().positive(),
  startedAtFingerprint: z.string().min(1),
});
const manifestSchema = z.object({
  runId: z.uuid(),
  scenarioId: z.string().regex(/^[a-z][a-z0-9-]{0,62}$/u),
  composeProject: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/u),
  worktreePath: z.string().min(1),
  environmentName: z.string().regex(/^[a-z][a-z0-9-]{0,62}$/u),
  ports: z.object({
    porta: z.number().int().min(1024).max(65_535),
    app: z.number().int().min(1024).max(65_535),
    bff: z.number().int().min(1024).max(65_535),
    postgres: z.number().int().min(1024).max(65_535),
    redis: z.number().int().min(1024).max(65_535),
    mailhog: z.number().int().min(1024).max(65_535),
  }),
  urls: z.object({
    porta: z.url(),
    app: z.url(),
    bff: z.url(),
    postgres: z.url(),
    redis: z.url(),
    mailhog: z.url(),
  }),
  certificatePath: z.string().min(1),
});
const leaseRecordSchema = z.object({
  runId: z.uuid(),
  ownerProcess: processIdentitySchema,
  worktreePath: z.string().min(1),
  composeProject: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/u),
  containerIds: z.array(z.string().min(1)),
  volumeNames: z.array(z.string().min(1)),
  ownedPaths: z.array(z.string().min(1)),
  certificatePath: z.string().min(1),
  manifest: manifestSchema,
});

/** Filesystem-backed lease store shared by concurrent repository worktrees. */
export class FileLeaseStateAdapter implements LeaseStateAdapter {
  /** Canonical directory containing atomic block leases. */
  public readonly root: string;

  /** Creates or opens the owner-only shared lease directory. */
  public constructor(root = resolve(tmpdir(), 'porta-assurance-leases-v1')) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
    this.root = root;
  }

  /** Atomically owns a complete port block and durably records its exact owner. */
  public async tryAcquire(record: LeaseRecord): Promise<'acquired' | 'occupied'> {
    const blockDirectory = this.blockDirectory(record.manifest.ports.porta);
    try {
      mkdirSync(blockDirectory, { mode: 0o700 });
    } catch (error) {
      if (hasErrorCode(error, 'EEXIST')) return 'occupied';
      throw error;
    }
    const ownerDirectory = resolve(blockDirectory, `owner-${record.runId}`);
    mkdirSync(ownerDirectory, { mode: 0o700 });
    writeDurableJson(resolve(ownerDirectory, 'lease.json'), record);
    return 'acquired';
  }

  /** Finds and validates one persisted lease without treating malformed state as absence. */
  public async read(
    lookup: LifecycleRecoveryLookup,
  ): Promise<LeaseRecord | 'missing' | 'malformed' | 'incomplete'> {
    const ownerDirectories = this.ownerDirectories(lookup.runId);
    if (ownerDirectories.length === 0) return 'missing';
    if (ownerDirectories.length !== 1) return 'incomplete';
    const leasePath = resolve(ownerDirectories[0] ?? '', 'lease.json');
    if (!existsSync(leasePath)) return 'incomplete';
    try {
      const record = freezeLeaseRecord(
        leaseRecordSchema.parse(JSON.parse(readFileSync(leasePath, 'utf8'))),
      );
      if (record.runId !== lookup.runId || record.worktreePath !== lookup.worktreePath) {
        return 'incomplete';
      }
      return record;
    } catch {
      return 'malformed';
    }
  }

  /** Releases only the lease whose complete persisted identity still matches. */
  public async release(record: LeaseRecord): Promise<void> {
    const ownerDirectories = this.ownerDirectories(record.runId);
    if (ownerDirectories.length !== 1) throw new Error('owned lease directory is not unique');
    const ownerDirectory = ownerDirectories[0] ?? '';
    const leasePath = resolve(ownerDirectory, 'lease.json');
    const persisted = leaseRecordSchema.parse(JSON.parse(readFileSync(leasePath, 'utf8')));
    if (stableJson(persisted) !== stableJson(record)) throw new Error('lease identity changed');
    unlinkSync(leasePath);
    rmdirSync(ownerDirectory);
    rmdirSync(dirname(ownerDirectory));
  }

  /** Quarantines the exact owner directory so malformed state cannot be reclaimed automatically. */
  public async quarantine(lookup: LifecycleRecoveryLookup): Promise<readonly string[]> {
    const ownerDirectories = this.ownerDirectories(lookup.runId);
    const quarantineRoot = resolve(this.root, 'quarantine');
    mkdirSync(quarantineRoot, { recursive: true, mode: 0o700 });
    for (const [index, ownerDirectory] of ownerDirectories.entries()) {
      const destination = resolve(quarantineRoot, `${lookup.runId}-${process.pid}-${index}`);
      renameSync(ownerDirectory, destination);
      const blockDirectory = dirname(ownerDirectory);
      if (readdirSync(blockDirectory).length === 0) rmdirSync(blockDirectory);
    }
    return Object.freeze([`lease:${lookup.runId}`]);
  }

  /** Returns the collision domain for one complete endpoint block. */
  protected blockDirectory(basePort: number): string {
    return resolve(this.root, `block-${basePort}`);
  }

  /** Finds only exact owner directories beneath validated block-directory names. */
  protected ownerDirectories(runId: string): readonly string[] {
    const ownerName = `owner-${runId}`;
    return readdirSync(this.root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^block-\d{4,5}$/u.test(entry.name))
      .map((entry) => resolve(this.root, entry.name, ownerName))
      .filter((path) => existsSync(path));
  }
}

/** Linux process probe that includes the kernel start tick to reject PID reuse. */
export class LinuxProcessProbeAdapter implements ProcessProbeAdapter {
  /** Returns the identity of the process executing the lifecycle command. */
  public async currentIdentity(): Promise<ProcessIdentity> {
    return { pid: process.pid, startedAtFingerprint: readProcessStartFingerprint(process.pid) };
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

/** Writes the single immutable endpoint manifest consumed by every harness component. */
export class EndpointManifestFileAdapter implements ManifestConsumerAdapter {
  /** Persists or verifies the canonical manifest without allowing divergent copies. */
  public async apply(manifest: EndpointManifest): Promise<void> {
    const manifestPath = resolve(
      manifest.worktreePath,
      'test-harness/.assurance-runtime',
      manifest.runId,
      'endpoint-manifest.json',
    );
    const rendered = `${stableJson(manifest)}\n`;
    if (existsSync(manifestPath)) {
      if (readFileSync(manifestPath, 'utf8') !== rendered) {
        throw new Error('endpoint manifest identity changed');
      }
      return;
    }
    mkdirSync(dirname(manifestPath), { recursive: true, mode: 0o700 });
    writeDurableText(manifestPath, rendered);
  }
}

/** Converts a validated persisted record into deeply immutable lifecycle identity. */
function freezeLeaseRecord(record: z.infer<typeof leaseRecordSchema>): LeaseRecord {
  return Object.freeze({
    ...record,
    ownerProcess: Object.freeze(record.ownerProcess),
    containerIds: Object.freeze(record.containerIds),
    volumeNames: Object.freeze(record.volumeNames),
    ownedPaths: Object.freeze(record.ownedPaths),
    manifest: Object.freeze({
      ...record.manifest,
      ports: Object.freeze(record.manifest.ports),
      urls: Object.freeze(record.manifest.urls),
    }),
  });
}

/** Returns a deterministic JSON representation used only for exact identity comparison. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    return Object.fromEntries(
      Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)),
    );
  });
}

/** Writes one owner-only JSON record and flushes both file contents and its parent directory. */
function writeDurableJson(path: string, value: unknown): void {
  writeDurableText(path, `${stableJson(value)}\n`);
}

/** Writes one owner-only file and flushes it before returning. */
function writeDurableText(path: string, value: string): void {
  const file = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(file, value, 'utf8');
    fsyncSync(file);
  } finally {
    closeSync(file);
  }
  const directory = openSync(dirname(path), 'r');
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
}

/** Reads the Linux kernel start-tick identity for one process. */
function readProcessStartFingerprint(pid: number): string {
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

/** Narrows an unknown operating-system error to one exact code. */
function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}
