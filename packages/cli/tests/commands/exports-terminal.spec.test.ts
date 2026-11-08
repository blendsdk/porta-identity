/**
 * Tests for safe interactive export output.
 */

import { describe, expect, it } from 'vitest';

import { sanitizeInteractiveExport } from '../../src/terminal-export.js';

// Export bytes are untrusted. A terminal must not receive active control sequences, while CSV
// structure and machine-consumed file/pipeline bytes must remain exact.
describe('interactive export sanitization', () => {
  it('should replace active terminal controls when stdout is interactive', () => {
    const content = 'id,name\n1,\u001b]52;c;Y2xpcGJvYXJk\u0007\n2,\u009b31mred';

    const sanitized = sanitizeInteractiveExport(content, true);

    expect(sanitized).not.toContain('\u001b');
    expect(sanitized).not.toContain('\u0007');
    expect(sanitized).not.toContain('\u009b');
    expect(sanitized).toContain('\ufffd');
  });

  it('should preserve CSV structure and printable content when stdout is interactive', () => {
    const content = 'id,name\r\n1,"Acme, Inc."\n2,\tTabbed\n';

    expect(sanitizeInteractiveExport(content, true)).toBe(content);
  });

  it('should preserve exact bytes for files and noninteractive pipelines', () => {
    const content = 'id,name\n1,\u001b[31mAcme\u001b[0m\n';

    expect(sanitizeInteractiveExport(content, false)).toBe(content);
  });
});
