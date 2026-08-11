import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

import { z } from 'zod';

import { hasErrorCode } from './lifecycle-os-error.js';
import { readProcessStartFingerprint } from './lifecycle-system-probes.js';
export {
  LinuxProcessProbeAdapter,
  linuxProcessIdentity,
  LoopbackEndpointAvailabilityAdapter,
} from './lifecycle-system-probes.js';

import type {
  EndpointAvailabilityAdapter,
  EndpointManifest,
  EndpointName,
  DurableResetState,
  LeaseRecord,
  LeaseStateAdapter,
  LifecycleRecoveryLookup,
  ManifestConsumerAdapter,
  Presence,
  ProcessIdentity,
  ProcessProbeAdapter,
  ResetStateAdapter,
} from './lifecycle-planned.js';

/** Runtime validator for process identities crossing the durable lease boundary. */
const processIdentitySchema = z.object({
  pid: z.number().int().positive(),
  startedAtFingerprint: z.string().min(1),
});

/** Runtime validator for the immutable endpoint manifest stored in a lease. */
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

/** Runtime validator for every field that authorizes later cleanup or ownership transfer. */
const leaseRecordSchema = z.object({
  runId: z.uuid(),
  startupIntentId: z.uuid(),
  ownerProcess: processIdentitySchema,
  worktreePath: z.string().min(1),
  composeProject: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/u),
  containerIds: z.array(z.string().min(1)),
  networkIds: z.array(z.string().min(1)),
  hostProcesses: z.array(processIdentitySchema.extend({ role: z.enum(['spa', 'bff']) })),
  volumeNames: z.array(z.string().min(1)),
  ownedPaths: z.array(z.string().min(1)),
  certificatePath: z.string().min(1),
  manifest: manifestSchema,
});

/** Closed durable reset-state vocabulary. */
const durableResetStateSchema = z.enum(['ready', 'resetting-poisoned']);

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
  public async tryAcquire(
    record: LeaseRecord,
  ): Promise<'acquired' | 'worktree-occupied' | 'block-occupied'> {
    if (!this.acquireWorktreeClaim(record)) return 'worktree-occupied';
    const blockDirectory = this.blockDirectory(record.manifest.ports.porta);
    const candidateDirectory = resolve(this.root, `.candidate-${record.runId}-${randomUUID()}`);
    const ownerDirectory = resolve(candidateDirectory, `owner-${record.runId}`);
    try {
      mkdirSync(candidateDirectory, { mode: 0o700 });
      mkdirSync(ownerDirectory, { mode: 0o700 });
      writeDurableJson(resolve(ownerDirectory, 'lease.json'), record);
      syncDirectory(candidateDirectory);
      renameSync(candidateDirectory, blockDirectory);
      syncDirectory(this.root);
      return 'acquired';
    } catch (error) {
      rmSync(candidateDirectory, { recursive: true, force: true });
      if (hasErrorCode(error, 'EEXIST') || hasErrorCode(error, 'ENOTEMPTY')) {
        return 'block-occupied';
      }
      throw error;
    }
  }

  /** Releases only an exact worktree intent when no block lease exists for that run. */
  public async releaseIntent(record: LeaseRecord): Promise<void> {
    if (this.ownerDirectories(record.runId).length !== 0) {
      throw new Error('cannot release intent while a lease exists');
    }
    this.releaseWorktreeClaim(record);
    syncDirectory(resolve(this.root, 'worktrees'));
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

  /** Finds every valid lease for a worktree without treating malformed shared state as clean. */
  public async findByWorktree(
    worktreePath: string,
  ): Promise<readonly LeaseRecord[] | 'unreadable'> {
    const records: LeaseRecord[] = [];
    const claimPath = this.worktreeClaimPath(worktreePath);
    const claim = existsSync(claimPath) ? readWorktreeClaim(claimPath) : undefined;
    if (existsSync(claimPath) && claim === undefined) return 'unreadable';
    for (const block of readdirSync(this.root, { withFileTypes: true })) {
      if (!block.isDirectory() || !/^block-\d{4,5}$/u.test(block.name)) continue;
      const blockPath = resolve(this.root, block.name);
      const tombstonePath = resolve(blockPath, 'quarantined.json');
      if (existsSync(tombstonePath)) {
        const tombstone = readQuarantineTombstone(tombstonePath);
        if (tombstone === undefined) return 'unreadable';
        if (tombstone.worktreePath === worktreePath) return 'unreadable';
      }
      for (const owner of readdirSync(blockPath, { withFileTypes: true })) {
        if (!owner.isDirectory() || !owner.name.startsWith('owner-')) continue;
        try {
          const record = freezeLeaseRecord(
            leaseRecordSchema.parse(
              JSON.parse(readFileSync(resolve(blockPath, owner.name, 'lease.json'), 'utf8')),
            ),
          );
          if (record.worktreePath === worktreePath) records.push(record);
        } catch {
          return 'unreadable';
        }
      }
    }
    if (
      claim !== undefined &&
      !records.some(
        (record) =>
          record.runId === claim.runId &&
          record.startupIntentId === claim.startupIntentId &&
          record.worktreePath === claim.worktreePath,
      )
    ) {
      return 'unreadable';
    }
    return Object.freeze(records);
  }

  /** Atomically changes only process ownership when the complete prior lease still matches. */
  public async transferOwner(
    expected: LeaseRecord,
    newOwner: ProcessIdentity,
  ): Promise<LeaseRecord | 'mismatch'> {
    processIdentitySchema.parse(newOwner);
    const ownerDirectories = this.ownerDirectories(expected.runId);
    if (ownerDirectories.length !== 1) return 'mismatch';
    const ownerDirectory = ownerDirectories[0] ?? '';
    const claim = this.acquireTakeoverClaim(ownerDirectory, newOwner);
    if (claim === undefined) return 'mismatch';

    try {
      const leasePath = resolve(ownerDirectory, 'lease.json');
      const persisted = leaseRecordSchema.parse(JSON.parse(readFileSync(leasePath, 'utf8')));
      if (stableJson(persisted) !== stableJson(expected)) return 'mismatch';
      const replacement = freezeLeaseRecord(
        leaseRecordSchema.parse({ ...persisted, ownerProcess: newOwner }),
      );
      const replacementPath = resolve(ownerDirectory, `.lease-replacement-${randomUUID()}.json`);
      writeDurableJson(replacementPath, replacement);
      renameSync(replacementPath, leasePath);
      syncDirectory(ownerDirectory);
      return replacement;
    } finally {
      unlinkIfPresent(claim.claimPath);
      unlinkIfPresent(claim.candidatePath);
      syncDirectory(ownerDirectory);
    }
  }

  /** Atomically finalizes only discovered resource fields while all authority fields stay fixed. */
  public async finalizeResources(
    expected: LeaseRecord,
    discovered: LeaseRecord,
  ): Promise<LeaseRecord | 'mismatch'> {
    const ownerDirectories = this.ownerDirectories(expected.runId);
    if (
      ownerDirectories.length !== 1 ||
      !sameLeaseAuthority(expected, discovered) ||
      !resourceDiscoveryCanAdvance(expected, discovered)
    ) {
      return 'mismatch';
    }
    const ownerDirectory = ownerDirectories[0] ?? '';
    const leasePath = resolve(ownerDirectory, 'lease.json');
    const persisted = freezeLeaseRecord(
      leaseRecordSchema.parse(JSON.parse(readFileSync(leasePath, 'utf8'))),
    );
    if (stableJson(persisted) !== stableJson(expected)) return 'mismatch';
    const finalized = freezeLeaseRecord(leaseRecordSchema.parse(discovered));
    const replacementPath = resolve(ownerDirectory, `.lease-replacement-${randomUUID()}.json`);
    writeDurableJson(replacementPath, finalized);
    renameSync(replacementPath, leasePath);
    syncDirectory(ownerDirectory);
    return finalized;
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
    this.releaseWorktreeClaim(record);
    syncDirectory(this.root);
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
      writeDurableJson(resolve(blockDirectory, 'quarantined.json'), {
        runId: lookup.runId,
        worktreePath: lookup.worktreePath,
        quarantinedAt: new Date().toISOString(),
      });
      syncDirectory(blockDirectory);
    }
    return Object.freeze([`lease:${lookup.runId}`]);
  }

  /** Returns the collision domain for one complete endpoint block. */
  protected blockDirectory(basePort: number): string {
    return resolve(this.root, `block-${basePort}`);
  }

  /** Atomically excludes a second startup in the same canonical worktree before port mutation. */
  protected acquireWorktreeClaim(record: LeaseRecord): boolean {
    const claimsRoot = resolve(this.root, 'worktrees');
    mkdirSync(claimsRoot, { recursive: true, mode: 0o700 });
    const claimPath = this.worktreeClaimPath(record.worktreePath);
    const candidatePath = resolve(claimsRoot, `.candidate-${record.runId}-${randomUUID()}`);
    mkdirSync(candidatePath, { mode: 0o700 });
    writeDurableJson(resolve(candidatePath, 'claim.json'), {
      runId: record.runId,
      startupIntentId: record.startupIntentId,
      worktreePath: record.worktreePath,
      ownerProcess: record.ownerProcess,
    });
    syncDirectory(candidatePath);
    try {
      renameSync(candidatePath, claimPath);
      syncDirectory(claimsRoot);
      return true;
    } catch (error) {
      rmSync(candidatePath, { recursive: true, force: true });
      if (!hasErrorCode(error, 'EEXIST') && !hasErrorCode(error, 'ENOTEMPTY')) throw error;
      const existing = readWorktreeClaim(claimPath);
      if (
        existing !== undefined &&
        existing.runId === record.runId &&
        existing.startupIntentId === record.startupIntentId &&
        existing.worktreePath === record.worktreePath &&
        processPresence(existing.ownerProcess) === 'present'
      ) {
        return true;
      }
      if (
        existing !== undefined &&
        processPresence(existing.ownerProcess) === 'absent' &&
        this.ownerDirectories(existing.runId).length === 0
      ) {
        rmSync(claimPath, { recursive: true, force: true });
        syncDirectory(claimsRoot);
        return this.acquireWorktreeClaim(record);
      }
      return false;
    }
  }

  /** Releases only the exact worktree claim paired with the verified lease. */
  protected releaseWorktreeClaim(record: LeaseRecord): void {
    const claimPath = this.worktreeClaimPath(record.worktreePath);
    const existing = readWorktreeClaim(claimPath);
    if (
      existing === undefined ||
      existing.runId !== record.runId ||
      existing.startupIntentId !== record.startupIntentId ||
      existing.worktreePath !== record.worktreePath
    ) {
      throw new Error('worktree startup claim changed');
    }
    rmSync(claimPath, { recursive: true });
  }

  /** Returns the non-reversible digest path for one canonical worktree claim. */
  protected worktreeClaimPath(worktreePath: string): string {
    const digest = createHash('sha256').update(worktreePath).digest('hex');
    return resolve(this.root, 'worktrees', digest);
  }

  /** Finds only exact owner directories beneath validated block-directory names. */
  protected ownerDirectories(runId: string): readonly string[] {
    const ownerName = `owner-${runId}`;
    return readdirSync(this.root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^block-\d{4,5}$/u.test(entry.name))
      .map((entry) => resolve(this.root, entry.name, ownerName))
      .filter((path) => existsSync(path));
  }

  /**
   * Acquires one complete, atomically linked takeover claim.
   *
   * The candidate file is fully durable before `link` publishes it as the shared claim, so a
   * competing process never observes a partially written claimant identity. A dead claimant may
   * be removed; a live or unreadable claimant always blocks takeover.
   */
  protected acquireTakeoverClaim(
    ownerDirectory: string,
    newOwner: ProcessIdentity,
  ): { readonly claimPath: string; readonly candidatePath: string } | undefined {
    const claimPath = resolve(ownerDirectory, 'takeover.claim');
    const candidatePath = resolve(ownerDirectory, `.takeover-candidate-${randomUUID()}.json`);
    writeDurableJson(candidatePath, newOwner);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        linkSync(candidatePath, claimPath);
        syncDirectory(ownerDirectory);
        this.removeOrphanedTakeoverFiles(ownerDirectory, candidatePath);
        return { claimPath, candidatePath };
      } catch (error) {
        if (!hasErrorCode(error, 'EEXIST')) {
          unlinkIfPresent(candidatePath);
          throw error;
        }
        const claimant = readClaimant(claimPath);
        if (claimant === undefined || processPresence(claimant) !== 'absent') {
          unlinkIfPresent(candidatePath);
          return undefined;
        }
        unlinkSync(claimPath);
        syncDirectory(ownerDirectory);
      }
    }
    unlinkIfPresent(candidatePath);
    return undefined;
  }

  /** Removes only abandoned, allowlisted takeover temporaries after exclusive claim ownership. */
  protected removeOrphanedTakeoverFiles(ownerDirectory: string, currentCandidate: string): void {
    for (const entry of readdirSync(ownerDirectory, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const path = resolve(ownerDirectory, entry.name);
      if (path === currentCandidate) continue;
      if (/^\.(?:takeover-candidate|lease-replacement)-[0-9a-f-]+\.json$/u.test(entry.name)) {
        unlinkSync(path);
      }
    }
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

/** Filesystem-backed poison state whose pending transitions become visible only after flush. */
export class FileResetStateAdapter implements ResetStateAdapter {
  /** Pending transitions scoped to the current lifecycle supervisor process. */
  protected readonly pending = new Map<string, DurableResetState>();

  /** Stages one exact state transition without claiming it is durable yet. */
  public async persist(record: LeaseRecord, state: DurableResetState): Promise<void> {
    durableResetStateSchema.parse(state);
    this.pending.set(record.runId, state);
  }

  /** Atomically replaces and flushes the state file plus its owning directory. */
  public async flush(record: LeaseRecord): Promise<void> {
    const state = this.pending.get(record.runId);
    if (state === undefined) throw new Error('reset state has no pending transition');
    const statePath = resetStatePath(record);
    mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 });
    const replacementPath = resolve(dirname(statePath), `.reset-state-${randomUUID()}.json`);
    writeDurableJson(replacementPath, { runId: record.runId, state });
    renameSync(replacementPath, statePath);
    syncDirectory(dirname(statePath));
    this.pending.delete(record.runId);
  }

  /** Reads only the committed state file; pending process memory never counts as durability. */
  public async read(record: LeaseRecord): Promise<DurableResetState | 'unreadable'> {
    try {
      const parsed = z
        .object({ runId: z.uuid(), state: durableResetStateSchema })
        .parse(JSON.parse(readFileSync(resetStatePath(record), 'utf8')));
      return parsed.runId === record.runId ? parsed.state : 'unreadable';
    } catch {
      return 'unreadable';
    }
  }
}

/** Converts a validated persisted record into deeply immutable lifecycle identity. */
function freezeLeaseRecord(record: z.infer<typeof leaseRecordSchema>): LeaseRecord {
  return Object.freeze({
    ...record,
    ownerProcess: Object.freeze(record.ownerProcess),
    containerIds: Object.freeze(record.containerIds),
    networkIds: Object.freeze(record.networkIds),
    hostProcesses: Object.freeze(record.hostProcesses.map((identity) => Object.freeze(identity))),
    volumeNames: Object.freeze(record.volumeNames),
    ownedPaths: Object.freeze(record.ownedPaths),
    manifest: Object.freeze({
      ...record.manifest,
      ports: Object.freeze(record.manifest.ports),
      urls: Object.freeze(record.manifest.urls),
    }),
  });
}

/** Compares every non-resource field before a provisional lease may be finalized. */
function sameLeaseAuthority(left: LeaseRecord, right: LeaseRecord): boolean {
  return (
    stableJson({
      ...left,
      containerIds: [],
      networkIds: [],
      hostProcesses: [],
    }) ===
    stableJson({
      ...right,
      containerIds: [],
      networkIds: [],
      hostProcesses: [],
    })
  );
}

/** Allows only previously empty discovered-resource fields to gain exact runtime identities. */
function resourceDiscoveryCanAdvance(expected: LeaseRecord, discovered: LeaseRecord): boolean {
  const unchangedOrEmpty = (left: readonly unknown[], right: readonly unknown[]): boolean =>
    left.length === 0 || stableJson(left) === stableJson(right);
  const hostProcessesAdvanceSafely =
    expected.hostProcesses.length <= discovered.hostProcesses.length &&
    expected.hostProcesses.every(
      (identity, index) => stableJson(identity) === stableJson(discovered.hostProcesses[index]),
    );
  return (
    unchangedOrEmpty(expected.containerIds, discovered.containerIds) &&
    unchangedOrEmpty(expected.networkIds, discovered.networkIds) &&
    hostProcessesAdvanceSafely &&
    unchangedOrEmpty(expected.volumeNames, discovered.volumeNames)
  );
}

/** Returns the canonical poison-state path already covered by the lease's owned runtime path. */
function resetStatePath(record: LeaseRecord): string {
  return resolve(
    record.worktreePath,
    'test-harness/.assurance-runtime',
    record.runId,
    'reset-state.json',
  );
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
  syncDirectory(dirname(path));
}

/** Flushes directory metadata after a file create, rename, or removal. */
function syncDirectory(path: string): void {
  const directory = openSync(path, 'r');
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
}

/** Reads one complete claimant identity, treating malformed state as unsafe. */
function readClaimant(path: string): ProcessIdentity | undefined {
  try {
    return processIdentitySchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return undefined;
  }
}

/** Reads one atomic worktree startup claim, treating malformed state as unsafe. */
function readWorktreeClaim(path: string):
  | {
      readonly runId: string;
      readonly startupIntentId: string;
      readonly worktreePath: string;
      readonly ownerProcess: ProcessIdentity;
    }
  | undefined {
  try {
    return z
      .object({
        runId: z.uuid(),
        startupIntentId: z.uuid(),
        worktreePath: z.string().min(1),
        ownerProcess: processIdentitySchema,
      })
      .parse(JSON.parse(readFileSync(resolve(path, 'claim.json'), 'utf8')));
  } catch {
    return undefined;
  }
}

/** Reads one retained collision tombstone without treating malformed state as unrelated. */
function readQuarantineTombstone(
  path: string,
): { readonly runId: string; readonly worktreePath: string } | undefined {
  try {
    return z
      .object({
        runId: z.uuid(),
        worktreePath: z.string().min(1),
        quarantinedAt: z.iso.datetime(),
      })
      .parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return undefined;
  }
}

/** Checks one exact process identity synchronously for takeover fencing. */
function processPresence(identity: ProcessIdentity): Presence {
  try {
    return readProcessStartFingerprint(identity.pid) === identity.startedAtFingerprint
      ? 'present'
      : 'absent';
  } catch (error) {
    return hasErrorCode(error, 'ENOENT') ? 'absent' : 'unreadable';
  }
}

/** Removes an owned temporary file when it still exists. */
function unlinkIfPresent(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if (!hasErrorCode(error, 'ENOENT')) throw error;
  }
}
