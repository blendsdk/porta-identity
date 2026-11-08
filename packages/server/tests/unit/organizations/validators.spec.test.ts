import { describe, expect, it } from 'vitest';

import { brandingCustomCssSchema } from '../../../src/organizations/validators.js';

// Custom CSS is presentation data. Allowing an HTML tag opener lets a style terminator expose the
// identity-origin authentication page to injected markup and same-page script.
describe('branding custom CSS validation', () => {
  it('should reject an HTML tag opener in custom CSS', () => {
    for (const value of [
      '</style><script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      'body { color: red; } <style>',
    ]) {
      expect(brandingCustomCssSchema.safeParse(value).success).toBe(false);
    }
  });

  it('should accept bounded CSS that cannot open an HTML element', () => {
    const value = '.login-card > button::after { content: "a > b"; color: #123456; }';

    expect(brandingCustomCssSchema.safeParse(value).success).toBe(true);
  });

  it('should preserve the existing length boundary', () => {
    expect(brandingCustomCssSchema.safeParse('a'.repeat(10_000)).success).toBe(true);
    expect(brandingCustomCssSchema.safeParse('a'.repeat(10_001)).success).toBe(false);
  });
});
