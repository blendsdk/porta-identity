/**
 * JWT Decode Helper
 *
 * Decodes JWT tokens for display purposes only — no signature verification.
 * Used by the dashboard to show decoded token headers and payloads.
 */

/** Decoded JWT with header and payload as plain objects */
export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
}

/**
 * Decode a JWT for display purposes (no verification).
 * Splits the token into parts and base64url-decodes the header and payload.
 *
 * @param token - The JWT string to decode
 * @returns Decoded header and payload, or null if the token is malformed
 */
export function decodeJwt(token: string): DecodedJwt | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return { header, payload };
  } catch {
    return null;
  }
}
