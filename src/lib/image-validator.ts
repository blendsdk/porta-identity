/**
 * Image validation for branding asset uploads.
 *
 * Validates uploaded images using magic byte signature detection, size limits,
 * and SVG sanitization. This prevents:
 * - Disguised file uploads (wrong content-type vs actual content)
 * - Oversized files
 * - SVG-based XSS via embedded scripts or event handlers
 *
 * @module image-validator
 * @see 06-bulk-operations-branding.md
 */

// ============================================================================
// Types
// ============================================================================

export type AssetType = 'logo' | 'favicon';

/** Result of image validation — either valid or contains an error message */
export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  /** The detected content type from magic bytes (may differ from declared) */
  detectedType?: string;
  /** True if SVG was sanitized (scripts removed) */
  sanitized?: boolean;
  /** Sanitized buffer (only for SVG; otherwise same as input) */
  data?: Buffer;
}

// ============================================================================
// Constants
// ============================================================================

/** Size limits per asset type (in bytes) */
const SIZE_LIMITS: Record<AssetType, number> = {
  logo: 2 * 1024 * 1024,    // 2 MB — logos can be larger for hi-DPI
  favicon: 512 * 1024,       // 512 KB — favicons should be small
};

/**
 * Magic byte signatures for supported image formats.
 * Each entry maps a content type to its expected leading bytes.
 * SVG is XML-based and has no magic bytes — validated separately.
 */
const MAGIC_SIGNATURES: Array<{ type: string; bytes: number[] }> = [
  { type: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47] },
  { type: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { type: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
  { type: 'image/x-icon', bytes: [0x00, 0x00, 0x01, 0x00] },
  { type: 'image/vnd.microsoft.icon', bytes: [0x00, 0x00, 0x01, 0x00] },
];

/** Content types that are allowed for upload */
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

/**
 * Dangerous SVG elements and attributes that could enable XSS.
 * These are stripped during sanitization to prevent stored XSS attacks.
 */
const SVG_DANGEROUS_ELEMENTS = /(<script[\s>][\s\S]*?<\/script>|<script[\s>][\s\S]*?\/>)/gi;
const SVG_EVENT_HANDLERS = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;
const SVG_JAVASCRIPT_HREFS = /\s+(href|xlink:href)\s*=\s*["']javascript:[^"']*["']/gi;
const SVG_DATA_URIS_SCRIPT = /\s+(href|xlink:href)\s*=\s*["']data:text\/html[^"']*["']/gi;

// ============================================================================
// Public API
// ============================================================================

/**
 * Validate an uploaded image buffer against content type, size, and content rules.
 *
 * For binary formats (PNG, JPEG, WebP, ICO), validates magic byte signatures.
 * For SVG, validates XML structure and sanitizes dangerous content (scripts,
 * event handlers, javascript: URIs).
 *
 * @param buffer - Raw file data
 * @param contentType - Declared content type from the upload
 * @param assetType - Whether this is a logo or favicon (determines size limit)
 * @returns Validation result with optional sanitized data for SVGs
 */
export function validateImage(
  buffer: Buffer,
  contentType: string,
  assetType: AssetType,
): ImageValidationResult {
  // Check content type is allowed
  if (!ALLOWED_TYPES.has(contentType)) {
    return {
      valid: false,
      error: `Unsupported content type: ${contentType}. Allowed: ${[...ALLOWED_TYPES].join(', ')}`,
    };
  }

  // Check buffer is not empty
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'Image data cannot be empty' };
  }

  // Check size limit for the asset type
  const sizeLimit = SIZE_LIMITS[assetType];
  if (buffer.length > sizeLimit) {
    return {
      valid: false,
      error: `File too large: ${buffer.length} bytes. Maximum for ${assetType}: ${sizeLimit} bytes (${formatBytes(sizeLimit)})`,
    };
  }

  // SVG validation is content-based (no magic bytes)
  if (contentType === 'image/svg+xml') {
    return validateAndSanitizeSvg(buffer);
  }

  // Binary image format — validate magic bytes
  return validateMagicBytes(buffer, contentType);
}

/**
 * Get the size limit for an asset type.
 * @param assetType - The asset type
 * @returns Size limit in bytes
 */
export function getSizeLimit(assetType: AssetType): number {
  return SIZE_LIMITS[assetType];
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Validate a binary image by checking its magic byte signature matches
 * the declared content type. Prevents uploading a PNG disguised as a JPEG, etc.
 */
function validateMagicBytes(buffer: Buffer, contentType: string): ImageValidationResult {
  const signature = MAGIC_SIGNATURES.find((sig) => sig.type === contentType);

  if (!signature) {
    // No signature defined for this type — allow it (shouldn't happen due to ALLOWED_TYPES check)
    return { valid: true, detectedType: contentType, data: buffer };
  }

  // Check that buffer is at least long enough for the signature
  if (buffer.length < signature.bytes.length) {
    return {
      valid: false,
      error: `File too small to be a valid ${contentType} image`,
    };
  }

  // Compare magic bytes
  const matches = signature.bytes.every((byte, i) => buffer[i] === byte);
  if (!matches) {
    // Try to detect what the file actually is
    const detected = detectContentType(buffer);
    return {
      valid: false,
      error: `File content does not match declared type ${contentType}${detected ? `. Detected: ${detected}` : ''}`,
      detectedType: detected ?? undefined,
    };
  }

  return { valid: true, detectedType: contentType, data: buffer };
}

/**
 * Validate SVG content and sanitize dangerous elements.
 * SVGs are XML-based, so we check for script tags, event handlers,
 * and javascript: URIs that could enable stored XSS.
 */
function validateAndSanitizeSvg(buffer: Buffer): ImageValidationResult {
  let content: string;
  try {
    content = buffer.toString('utf-8');
  } catch {
    return { valid: false, error: 'SVG file contains invalid UTF-8 encoding' };
  }

  // Basic SVG structure check — must contain an <svg element
  if (!/<svg[\s>]/i.test(content)) {
    return { valid: false, error: 'File does not appear to be a valid SVG (no <svg> element found)' };
  }

  // Sanitize: strip dangerous elements and attributes
  let sanitized = content;
  let wasSanitized = false;

  // Remove <script> tags and their content
  if (SVG_DANGEROUS_ELEMENTS.test(sanitized)) {
    sanitized = sanitized.replace(SVG_DANGEROUS_ELEMENTS, '');
    wasSanitized = true;
  }

  // Remove on* event handler attributes (onclick, onload, onerror, etc.)
  if (SVG_EVENT_HANDLERS.test(sanitized)) {
    sanitized = sanitized.replace(SVG_EVENT_HANDLERS, '');
    wasSanitized = true;
  }

  // Remove javascript: URIs in href/xlink:href attributes
  if (SVG_JAVASCRIPT_HREFS.test(sanitized)) {
    sanitized = sanitized.replace(SVG_JAVASCRIPT_HREFS, '');
    wasSanitized = true;
  }

  // Remove data:text/html URIs (can embed scripts)
  if (SVG_DATA_URIS_SCRIPT.test(sanitized)) {
    sanitized = sanitized.replace(SVG_DATA_URIS_SCRIPT, '');
    wasSanitized = true;
  }

  return {
    valid: true,
    detectedType: 'image/svg+xml',
    sanitized: wasSanitized,
    data: Buffer.from(sanitized, 'utf-8'),
  };
}

/**
 * Attempt to detect the actual content type of a buffer by its magic bytes.
 * Returns null if no known format is detected.
 */
function detectContentType(buffer: Buffer): string | null {
  for (const sig of MAGIC_SIGNATURES) {
    if (buffer.length >= sig.bytes.length) {
      const matches = sig.bytes.every((byte, i) => buffer[i] === byte);
      if (matches) return sig.type;
    }
  }
  return null;
}

/**
 * Format bytes into a human-readable string (e.g., "512 KB", "2 MB").
 */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} bytes`;
}
