/** Post-green filesystem faults, runtime flag guards and report classification edges. */
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { PortaHttpError } from '@portaidentity/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalInputError } from '../src/error-format.js';
import {
  parseBulkRecipients,
  prepareBulkInvitations,
  readBulkRecipients,
} from '../src/bulk-invite-input.js';
import { getBulkInviteExitCode, runBulkInvitations } from '../src/bulk-invite.js';
import { createEmptyHome, removeEmptyHome } from './helpers/json-error-contract.js';

const org = '11111111-1111-4111-8111-111111111111';
let root: string;
beforeEach(async () => {
  root = await createEmptyHome();
});
afterEach(async () => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  await removeEmptyHome(root);
});

describe('regular descriptor failures', () => {
  it.each(['stat', 'read', 'close'] as const)(
    'should classify a %s fault locally and close the real descriptor',
    async (fault) => {
      const path = join(root, 'recipients.txt');
      await fs.writeFile(path, 'alice@example.com');
      const open = fs.open.bind(fs);
      const closes: ReturnType<typeof vi.fn>[] = [];
      vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
        const handle = await open(...args);
        const close = handle.close.bind(handle);
        const observer = vi.fn(async () => {
          await close();
          if (fault === 'close') throw new Error('SYNTHETIC_PRIVATE_DIAGNOSTIC');
        });
        closes.push(observer);
        vi.spyOn(handle, 'close').mockImplementation(observer);
        if (fault === 'read')
          vi.spyOn(handle, 'read').mockRejectedValue(new Error('SYNTHETIC_PRIVATE_DIAGNOSTIC'));
        if (fault === 'stat')
          vi.spyOn(handle, 'stat').mockRejectedValue(new Error('SYNTHETIC_PRIVATE_DIAGNOSTIC'));
        return handle;
      });
      syncBuiltinESMExports();
      await expect(readBulkRecipients(path)).rejects.toThrow(LocalInputError);
      expect(closes).toHaveLength(1);
      expect(closes[0]).toHaveBeenCalledOnce();
    },
  );
});

describe('runtime shared flag guards', () => {
  it.each([
    { org, locale: false },
    { org, 'personal-message': false },
    { org, role: false },
    { org, role: [false] },
    { org, claim: [false] },
  ])('should reject non-string parsed input without leaking native diagnostics: %j', (options) => {
    expect(() =>
      Reflect.apply(prepareBulkInvitations, undefined, [
        parseBulkRecipients('alice@example.com'),
        options,
      ]),
    ).toThrow(LocalInputError);
  });

  it('should reject a second leading BOM rather than silently trim it', () => {
    expect(() => parseBulkRecipients('\uFEFF\uFEFFalice@example.com')).toThrow(LocalInputError);
  });

  it('should preserve the exact raw-size limit in the pure parser as well as the reader', () => {
    const prefix = 'alice@example.com\n';
    const atLimit = prefix + ' '.repeat(1_048_576 - Buffer.byteLength(prefix));
    expect(parseBulkRecipients(atLimit).recipients).toHaveLength(1);
    expect(() => parseBulkRecipients(atLimit + ' ')).toThrow(LocalInputError);
  });
});

describe('opaque acknowledgement and HTTP edges', () => {
  it('should reject an actually observed generic HTTP401 while preserving its status', async () => {
    const prepared = prepareBulkInvitations(
      parseBulkRecipients('alice@example.com\nbob@example.com'),
      { org },
    );
    const report = await runBulkInvitations(
      prepared,
      vi.fn().mockRejectedValue(new PortaHttpError(401, 'private')),
    );
    expect(report.results[0]).toMatchObject({ outcome: 'rejected', error: { status: 401 } });
    expect(report.results[1]?.outcome).toBe('unattempted');
    expect(getBulkInviteExitCode(report)).toBe(2);
  });

  it('should keep an acknowledgement property failure unknown rather than inventing a rejection', async () => {
    const prepared = prepareBulkInvitations(
      parseBulkRecipients('alice@example.com\nbob@example.com'),
      { org },
    );
    const invite = vi.fn().mockResolvedValue(
      Object.defineProperty({}, 'invitationId', {
        get() {
          throw new Error('SYNTHETIC_PRIVATE_DIAGNOSTIC');
        },
      }),
    );
    const report = await runBulkInvitations(prepared, invite);
    expect(report.summary).toMatchObject({ attempted: 1, unknown: 1, rejected: 0, unattempted: 1 });
    expect(JSON.stringify(report)).not.toContain('SYNTHETIC_PRIVATE_DIAGNOSTIC');
    expect(getBulkInviteExitCode(report)).toBe(1);
  });
});
