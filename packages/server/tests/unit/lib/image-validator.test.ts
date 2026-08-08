/**
 * Unit tests for image-validator module.
 *
 * Tests magic byte validation, size limits, SVG sanitization,
 * and content type verification for branding asset uploads.
 */

import { describe, it, expect } from 'vitest';
import { validateImage, getSizeLimit } from '../../../src/lib/image-validator.js';

// ============================================================================
// Test image buffers — real magic byte signatures
// ============================================================================

/** Valid PNG: magic bytes 0x89 0x50 0x4E 0x47 (‰PNG) */
const VALID_PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);

/** Valid JPEG: magic bytes 0xFF 0xD8 0xFF */
const VALID_JPEG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);

/** Valid WebP: magic bytes 0x52 0x49 0x46 0x46 (RIFF) */
const VALID_WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45]);

/** Valid ICO: magic bytes 0x00 0x00 0x01 0x00 */
const VALID_ICO = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10, 0x00, 0x00]);

/** Valid SVG content */
const VALID_SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>');

/** SVG with script tag (XSS attempt) */
const SVG_WITH_SCRIPT = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script><circle cx="50" cy="50" r="40"/></svg>',
);

/** SVG with event handler (XSS attempt) */
const SVG_WITH_EVENT = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40" onclick="alert(1)"/></svg>',
);

/** SVG with javascript: URI (XSS attempt) */
const SVG_WITH_JS_HREF = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><circle cx="50" cy="50" r="40"/></a></svg>',
);

/** SVG with data:text/html URI */
const SVG_WITH_DATA_URI = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><a href="data:text/html,<script>alert(1)</script>"><text>click</text></a></svg>',
);

/** SVG with onload event handler */
const SVG_WITH_ONLOAD = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle cx="50" cy="50" r="40"/></svg>',
);

/** Not an SVG — just text content */
const NOT_SVG = Buffer.from('This is not an SVG file at all');

/** Random bytes (not matching any known format) */
const RANDOM_BYTES = Buffer.from([0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0]);

// ============================================================================
// Tests
// ============================================================================

describe('image-validator', () => {
  // --------------------------------------------------------------------------
  // Content type validation
  // --------------------------------------------------------------------------

  describe('content type validation', () => {
    it('rejects unsupported content types', () => {
      const result = validateImage(VALID_PNG, 'application/pdf', 'logo');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported content type');
      expect(result.error).toContain('application/pdf');
    });

    it('rejects text/plain content type', () => {
      const result = validateImage(VALID_PNG, 'text/plain', 'logo');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported content type');
    });

    it('rejects application/octet-stream', () => {
      const result = validateImage(VALID_PNG, 'application/octet-stream', 'favicon');
      expect(result.valid).toBe(false);
    });

    it('lists allowed types in error message', () => {
      const result = validateImage(VALID_PNG, 'image/gif', 'logo');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('image/png');
      expect(result.error).toContain('image/svg+xml');
    });
  });

  // --------------------------------------------------------------------------
  // Empty data validation
  // --------------------------------------------------------------------------

  describe('empty data validation', () => {
    it('rejects empty buffer', () => {
      const result = validateImage(Buffer.alloc(0), 'image/png', 'logo');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });
  });

  // --------------------------------------------------------------------------
  // Size limit validation
  // --------------------------------------------------------------------------

  describe('size limits', () => {
    it('rejects logo larger than 2 MB', () => {
      const oversized = Buffer.alloc(2 * 1024 * 1024 + 1);
      // Set PNG magic bytes so it passes type check
      oversized[0] = 0x89;
      oversized[1] = 0x50;
      oversized[2] = 0x4E;
      oversized[3] = 0x47;
      const result = validateImage(oversized, 'image/png', 'logo');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('File too large');
      expect(result.error).toContain('2 MB');
    });

    it('accepts logo at exactly 2 MB', () => {
      const exact = Buffer.alloc(2 * 1024 * 1024);
      exact[0] = 0x89;
      exact[1] = 0x50;
      exact[2] = 0x4E;
      exact[3] = 0x47;
      const result = validateImage(exact, 'image/png', 'logo');
      expect(result.valid).toBe(true);
    });

    it('rejects favicon larger than 512 KB', () => {
      const oversized = Buffer.alloc(512 * 1024 + 1);
      oversized[0] = 0x89;
      oversized[1] = 0x50;
      oversized[2] = 0x4E;
      oversized[3] = 0x47;
      const result = validateImage(oversized, 'image/png', 'favicon');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('File too large');
      expect(result.error).toContain('512 KB');
    });

    it('accepts favicon at exactly 512 KB', () => {
      const exact = Buffer.alloc(512 * 1024);
      exact[0] = 0x89;
      exact[1] = 0x50;
      exact[2] = 0x4E;
      exact[3] = 0x47;
      const result = validateImage(exact, 'image/png', 'favicon');
      expect(result.valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // PNG validation
  // --------------------------------------------------------------------------

  describe('PNG validation', () => {
    it('accepts valid PNG with correct magic bytes', () => {
      const result = validateImage(VALID_PNG, 'image/png', 'logo');
      expect(result.valid).toBe(true);
      expect(result.detectedType).toBe('image/png');
      expect(result.data).toEqual(VALID_PNG);
    });

    it('rejects file declared as PNG but with JPEG magic bytes', () => {
      const result = validateImage(VALID_JPEG, 'image/png', 'logo');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not match declared type');
      expect(result.detectedType).toBe('image/jpeg');
    });

    it('rejects file declared as PNG with random bytes', () => {
      const result = validateImage(RANDOM_BYTES, 'image/png', 'logo');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not match declared type');
    });

    it('rejects too-small buffer for PNG', () => {
      const tiny = Buffer.from([0x89, 0x50]);
      const result = validateImage(tiny, 'image/png', 'logo');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too small');
    });
  });

  // --------------------------------------------------------------------------
  // JPEG validation
  // --------------------------------------------------------------------------

  describe('JPEG validation', () => {
    it('accepts valid JPEG with correct magic bytes', () => {
      const result = validateImage(VALID_JPEG, 'image/jpeg', 'logo');
      expect(result.valid).toBe(true);
      expect(result.detectedType).toBe('image/jpeg');
    });

    it('rejects file declared as JPEG with PNG magic bytes', () => {
      const result = validateImage(VALID_PNG, 'image/jpeg', 'logo');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not match');
      expect(result.detectedType).toBe('image/png');
    });
  });

  // --------------------------------------------------------------------------
  // WebP validation
  // --------------------------------------------------------------------------

  describe('WebP validation', () => {
    it('accepts valid WebP with correct magic bytes', () => {
      const result = validateImage(VALID_WEBP, 'image/webp', 'logo');
      expect(result.valid).toBe(true);
      expect(result.detectedType).toBe('image/webp');
    });

    it('rejects file declared as WebP with wrong bytes', () => {
      const result = validateImage(VALID_PNG, 'image/webp', 'logo');
      expect(result.valid).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // ICO validation
  // --------------------------------------------------------------------------

  describe('ICO validation', () => {
    it('accepts valid ICO with image/x-icon', () => {
      const result = validateImage(VALID_ICO, 'image/x-icon', 'favicon');
      expect(result.valid).toBe(true);
      expect(result.detectedType).toBe('image/x-icon');
    });

    it('accepts valid ICO with image/vnd.microsoft.icon', () => {
      const result = validateImage(VALID_ICO, 'image/vnd.microsoft.icon', 'favicon');
      expect(result.valid).toBe(true);
      expect(result.detectedType).toBe('image/vnd.microsoft.icon');
    });
  });

  // --------------------------------------------------------------------------
  // SVG validation
  // --------------------------------------------------------------------------

  describe('SVG validation', () => {
    it('accepts clean SVG without sanitization', () => {
      const result = validateImage(VALID_SVG, 'image/svg+xml', 'logo');
      expect(result.valid).toBe(true);
      expect(result.detectedType).toBe('image/svg+xml');
      expect(result.sanitized).toBe(false);
    });

    it('rejects non-SVG content declared as SVG', () => {
      const result = validateImage(NOT_SVG, 'image/svg+xml', 'logo');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid SVG');
      expect(result.error).toContain('no <svg> element');
    });

    it('rejects binary data declared as SVG', () => {
      const result = validateImage(VALID_PNG, 'image/svg+xml', 'logo');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid SVG');
    });
  });

  // --------------------------------------------------------------------------
  // SVG sanitization (XSS prevention)
  // --------------------------------------------------------------------------

  describe('SVG sanitization', () => {
    it('strips <script> tags from SVG', () => {
      const result = validateImage(SVG_WITH_SCRIPT, 'image/svg+xml', 'logo');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe(true);
      const output = result.data!.toString('utf-8');
      expect(output).not.toContain('<script');
      expect(output).not.toContain('alert');
      // Should still contain the circle element
      expect(output).toContain('<circle');
    });

    it('strips onclick event handlers from SVG', () => {
      const result = validateImage(SVG_WITH_EVENT, 'image/svg+xml', 'logo');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe(true);
      const output = result.data!.toString('utf-8');
      expect(output).not.toContain('onclick');
      expect(output).not.toContain('alert');
      expect(output).toContain('<circle');
    });

    it('strips onload event handlers from SVG', () => {
      const result = validateImage(SVG_WITH_ONLOAD, 'image/svg+xml', 'logo');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe(true);
      const output = result.data!.toString('utf-8');
      expect(output).not.toContain('onload');
      expect(output).not.toContain('alert');
    });

    it('strips javascript: URIs from SVG', () => {
      const result = validateImage(SVG_WITH_JS_HREF, 'image/svg+xml', 'logo');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe(true);
      const output = result.data!.toString('utf-8');
      expect(output).not.toContain('javascript:');
    });

    it('strips data:text/html URIs from SVG', () => {
      const result = validateImage(SVG_WITH_DATA_URI, 'image/svg+xml', 'logo');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe(true);
      const output = result.data!.toString('utf-8');
      expect(output).not.toContain('data:text/html');
    });

    it('preserves valid SVG structure after sanitization', () => {
      const result = validateImage(SVG_WITH_SCRIPT, 'image/svg+xml', 'logo');
      expect(result.valid).toBe(true);
      const output = result.data!.toString('utf-8');
      // SVG root element should be preserved
      expect(output).toContain('<svg');
      expect(output).toContain('</svg>');
      expect(output).toContain('xmlns="http://www.w3.org/2000/svg"');
    });
  });

  // --------------------------------------------------------------------------
  // Cross-format detection
  // --------------------------------------------------------------------------

  describe('cross-format detection', () => {
    it('detects JPEG when PNG is declared', () => {
      const result = validateImage(VALID_JPEG, 'image/png', 'logo');
      expect(result.valid).toBe(false);
      expect(result.detectedType).toBe('image/jpeg');
    });

    it('detects PNG when JPEG is declared', () => {
      const result = validateImage(VALID_PNG, 'image/jpeg', 'logo');
      expect(result.valid).toBe(false);
      expect(result.detectedType).toBe('image/png');
    });

    it('returns no detected type for unknown bytes', () => {
      const unknown = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x00, 0x00, 0x00]);
      const result = validateImage(unknown, 'image/png', 'logo');
      expect(result.valid).toBe(false);
      expect(result.detectedType).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // getSizeLimit
  // --------------------------------------------------------------------------

  describe('getSizeLimit', () => {
    it('returns 2 MB for logo', () => {
      expect(getSizeLimit('logo')).toBe(2 * 1024 * 1024);
    });

    it('returns 512 KB for favicon', () => {
      expect(getSizeLimit('favicon')).toBe(512 * 1024);
    });
  });

  // --------------------------------------------------------------------------
  // Both asset types work with all formats
  // --------------------------------------------------------------------------

  describe('asset type compatibility', () => {
    it('accepts PNG as logo', () => {
      expect(validateImage(VALID_PNG, 'image/png', 'logo').valid).toBe(true);
    });

    it('accepts PNG as favicon', () => {
      expect(validateImage(VALID_PNG, 'image/png', 'favicon').valid).toBe(true);
    });

    it('accepts SVG as logo', () => {
      expect(validateImage(VALID_SVG, 'image/svg+xml', 'logo').valid).toBe(true);
    });

    it('accepts SVG as favicon', () => {
      expect(validateImage(VALID_SVG, 'image/svg+xml', 'favicon').valid).toBe(true);
    });

    it('accepts ICO as favicon', () => {
      expect(validateImage(VALID_ICO, 'image/x-icon', 'favicon').valid).toBe(true);
    });
  });
});
