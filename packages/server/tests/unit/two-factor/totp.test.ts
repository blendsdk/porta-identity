/**
 * Unit tests for TOTP (Time-based One-Time Password) utilities.
 *
 * Tests secret generation, URI construction, QR code generation,
 * and code verification. Uses real otpauth and qrcode libraries
 * since they are core dependencies (not external services).
 */

import { describe, it, expect } from 'vitest';
import { TOTP, Secret } from 'otpauth';
import {
  generateTotpSecret,
  generateTotpUri,
  generateQrCodeDataUri,
  verifyTotpCode,
} from '../../../src/two-factor/totp.js';

const TOTP_PARAMETERS = { algorithm: 'SHA1', digits: 6, period: 30 };

describe('two-factor totp', () => {
  // -------------------------------------------------------------------------
  // generateTotpSecret
  // -------------------------------------------------------------------------

  describe('generateTotpSecret', () => {
    it('should return a base32-encoded string', () => {
      const secret = generateTotpSecret();
      // Base32 characters: A-Z and 2-7
      expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    });

    it('should generate a secret of appropriate length (20 bytes = 32 base32 chars)', () => {
      const secret = generateTotpSecret();
      // 20 bytes → 32 base32 characters (ceil(20*8/5) = 32)
      expect(secret).toHaveLength(32);
    });

    it('should generate unique secrets on successive calls', () => {
      const secrets = new Set(Array.from({ length: 10 }, () => generateTotpSecret()));
      expect(secrets.size).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // generateTotpUri
  // -------------------------------------------------------------------------

  describe('generateTotpUri', () => {
    it('should return a valid otpauth:// URI', () => {
      const secret = generateTotpSecret();
      const uri = generateTotpUri(secret, 'user@example.com', 'Porta (acme)');

      expect(uri).toMatch(/^otpauth:\/\/totp\//);
    });

    it('should include the email as the label', () => {
      const secret = generateTotpSecret();
      const uri = generateTotpUri(secret, 'user@example.com', 'Porta');

      // The email should be encoded in the URI
      expect(uri).toContain('user%40example.com');
    });

    it('should include the issuer parameter', () => {
      const secret = generateTotpSecret();
      const uri = generateTotpUri(secret, 'user@example.com', 'MyIssuer');

      expect(uri).toContain('issuer=MyIssuer');
    });

    it('should include the secret parameter', () => {
      const secret = generateTotpSecret();
      const uri = generateTotpUri(secret, 'user@example.com', 'Porta');

      expect(uri).toContain(`secret=${secret}`);
    });

    it('should include default TOTP parameters', () => {
      const secret = generateTotpSecret();
      const uri = generateTotpUri(secret, 'user@example.com', 'Porta');

      // Default parameters: SHA1, 6 digits, 30 seconds
      expect(uri).toContain('algorithm=SHA1');
      expect(uri).toContain('digits=6');
      expect(uri).toContain('period=30');
    });
  });

  // -------------------------------------------------------------------------
  // generateQrCodeDataUri
  // -------------------------------------------------------------------------

  describe('generateQrCodeDataUri', () => {
    it('should return a data URI string', async () => {
      const uri = 'otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP&issuer=Porta';
      const dataUri = await generateQrCodeDataUri(uri);

      // Should be a PNG data URI
      expect(dataUri).toMatch(/^data:image\/png;base64,/);
    });

    it('should produce non-empty image data', async () => {
      const uri = 'otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP';
      const dataUri = await generateQrCodeDataUri(uri);

      // The base64 portion should have meaningful length
      const base64Part = dataUri.split(',')[1];
      expect(base64Part.length).toBeGreaterThan(100);
    });
  });

  // -------------------------------------------------------------------------
  // verifyTotpCode
  // -------------------------------------------------------------------------

  describe('verifyTotpCode', () => {
    it('should return the matched step for a valid current TOTP code', () => {
      const secret = generateTotpSecret();
      const validationTime = Date.now();

      // Generate the current valid code using the same library
      const totp = new TOTP({
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(secret),
      });
      const validCode = totp.generate({ timestamp: validationTime });

      expect(verifyTotpCode(validCode, secret, TOTP_PARAMETERS, validationTime)).toEqual({
        timeStep: Math.floor(validationTime / 30_000),
      });
    });

    it('should return null for an incorrect code', () => {
      const secret = generateTotpSecret();
      // A code that is extremely unlikely to be valid
      expect(verifyTotpCode('000000', secret, TOTP_PARAMETERS, Date.now())).toBeNull();
    });

    it('should accept codes within the ±1 step time window', () => {
      const secret = generateTotpSecret();
      const validationTime = Date.now();

      // Generate code for the current time step
      const totp = new TOTP({
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(secret),
      });
      const priorTime = validationTime - 30_000;
      const priorCode = totp.generate({ timestamp: priorTime });

      const result = verifyTotpCode(priorCode, secret, TOTP_PARAMETERS, validationTime);
      expect(result).toEqual({ timeStep: Math.floor(priorTime / 30_000) });
    });

    it('should reject codes that are too far from current time', () => {
      const secret = generateTotpSecret();

      // Generate code for a time far in the future (100 steps ahead)
      const totp = new TOTP({
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(secret),
      });
      // Generate at a time 100 periods in the future
      const validationTime = Date.now();
      const futureTime = validationTime + 30_000 * 100;
      const futureCode = totp.generate({ timestamp: futureTime });

      expect(verifyTotpCode(futureCode, secret, TOTP_PARAMETERS, validationTime)).toBeNull();
    });
  });
});
