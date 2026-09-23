/** Display specifications for administrative timestamps. */

import { describe, expect, it } from 'vitest';

import { formatAdminDateTime, formatOptionalAdminDateTime } from '../../src/admin/admin-date-time.js';

describe('administrative date and time display', () => {
  // Administrative timestamps use one concise UTC format without seconds or milliseconds.
  it('formats an ISO timestamp for quick human reading', () => {
    expect(formatAdminDateTime('2026-09-08T16:24:33.812Z')).toBe('08 Sep 2026, 16:24 UTC');
  });

  // Missing optional timestamps keep the context-specific label instead of resembling a date.
  it('uses the requested fallback when an optional timestamp is absent', () => {
    expect(formatOptionalAdminDateTime(null, 'Never')).toBe('Never');
  });

  // Malformed values are never repeated verbatim on the administrative surface.
  it('uses a safe fallback for an invalid timestamp', () => {
    expect(formatAdminDateTime('not-a-date')).toBe('Unknown');
  });
});
