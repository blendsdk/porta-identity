import { describe, expect, it } from 'vitest';

import { JSON_LOG_FORMAT_VALUE, resolveJsonLogFormat } from '../../../src/lib/log-format.js';

describe('resolveJsonLogFormat', () => {
  it('requires structured JSON in production regardless of any override', () => {
    expect(resolveJsonLogFormat({ NODE_ENV: 'production' })).toBe(true);
    expect(resolveJsonLogFormat({ NODE_ENV: 'production', PORTA_LOG_FORMAT: 'pretty' })).toBe(true);
  });

  it('honours an explicit JSON request outside production', () => {
    expect(resolveJsonLogFormat({ NODE_ENV: 'development' })).toBe(false);
    expect(
      resolveJsonLogFormat({ NODE_ENV: 'development', PORTA_LOG_FORMAT: JSON_LOG_FORMAT_VALUE }),
    ).toBe(true);
    expect(resolveJsonLogFormat({ PORTA_LOG_FORMAT: JSON_LOG_FORMAT_VALUE })).toBe(true);
  });

  it('keeps human-readable logs for any other value outside production', () => {
    expect(resolveJsonLogFormat({ NODE_ENV: 'development', PORTA_LOG_FORMAT: 'pretty' })).toBe(
      false,
    );
    expect(resolveJsonLogFormat({ NODE_ENV: 'development', PORTA_LOG_FORMAT: 'JSON' })).toBe(false);
    expect(resolveJsonLogFormat({ NODE_ENV: 'development', PORTA_LOG_FORMAT: '' })).toBe(false);
  });
});
