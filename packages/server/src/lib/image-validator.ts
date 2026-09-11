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
 */

// ============================================================================
// Types
// ============================================================================

/** Branding image slot whose size limit should be enforced. */
export type AssetType = 'logo' | 'favicon';

/** Result of image validation — either valid or contains an error message */
export interface ImageValidationResult {
  /** Whether the supplied bytes satisfy every validation rule. */
  valid: boolean;
  /** Human-readable validation failure for trusted internal callers. */
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
const SIZE_LIMITS: Readonly<Record<AssetType, number>> = {
  logo: 2 * 1024 * 1024,
  favicon: 512 * 1024,
};

interface SignatureSegment {
  /** Byte offset at which this signature segment begins. */
  readonly offset: number;
  /** Exact bytes required at the offset. */
  readonly bytes: readonly number[];
}

interface ImageSignature {
  /** Media type recognized by this signature. */
  readonly type: string;
  /** Segments that together identify the image container. */
  readonly segments: readonly SignatureSegment[];
}

/**
 * Magic byte signatures for supported image formats.
 * Each entry maps a content type to its expected leading bytes.
 * SVG is XML-based and has no magic bytes — validated separately.
 */
const MAGIC_SIGNATURES: readonly ImageSignature[] = [
  {
    type: 'image/png',
    segments: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  },
  { type: 'image/jpeg', segments: [{ offset: 0, bytes: [0xff, 0xd8] }] },
  {
    type: 'image/webp',
    segments: [
      { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
      { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
    ],
  },
  { type: 'image/x-icon', segments: [{ offset: 0, bytes: [0x00, 0x00, 0x01, 0x00] }] },
  {
    type: 'image/vnd.microsoft.icon',
    segments: [{ offset: 0, bytes: [0x00, 0x00, 0x01, 0x00] }],
  },
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

  const requiredLength = Math.max(
    ...signature.segments.map((segment) => segment.offset + segment.bytes.length),
  );
  if (buffer.length < requiredLength) {
    return {
      valid: false,
      error: `File too small to be a valid ${contentType} image`,
    };
  }

  if (!matchesSignature(buffer, signature)) {
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
    return {
      valid: false,
      error: 'File does not appear to be a valid SVG (no <svg> element found)',
    };
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
    if (matchesSignature(buffer, sig)) return sig.type;
  }
  return null;
}

/** Return whether every required segment is present at its exact byte offset. */
function matchesSignature(buffer: Buffer, signature: ImageSignature): boolean {
  return signature.segments.every((segment) =>
    segment.bytes.every((byte, index) => buffer[segment.offset + index] === byte),
  );
}

/**
 * Format bytes into a human-readable string (e.g., "512 KB", "2 MB").
 */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} bytes`;
}
