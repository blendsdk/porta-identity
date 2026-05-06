import { describe, it, expect, vi } from 'vitest';
import type { HttpTransport, TransportResponse } from '../../src/transport/types.js';
import { createBrandingDomain } from '../../src/domains/branding.js';

function mockTransport(response: Partial<TransportResponse> = {}): HttpTransport {
  return {
    request: vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: {},
      ...response,
    }),
  };
}

describe('domains/branding', () => {
  let transport: ReturnType<typeof mockTransport>;
  const orgId = 'org-1';

  // ── getSettings ─────────────────────────────────────────────
  describe('getSettings', () => {
    it('calls GET /organizations/:orgId/branding', async () => {
      transport = mockTransport({ body: { data: { primaryColor: '#000', companyName: 'Acme' } } });
      const branding = createBrandingDomain(transport);
      const result = await branding.getSettings(orgId);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/organizations/org-1/branding',
      });
      expect(result).toEqual({ primaryColor: '#000', companyName: 'Acme' });
    });
  });

  // ── updateSettings ──────────────────────────────────────────
  describe('updateSettings', () => {
    it('calls PUT /organizations/:orgId/branding with input', async () => {
      const input = { brandingPrimaryColor: '#fff', brandingCompanyName: 'New Acme' };
      transport = mockTransport({ body: { data: { primaryColor: '#fff', companyName: 'New Acme' } } });
      const branding = createBrandingDomain(transport);
      const result = await branding.updateSettings(orgId, input);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT', path: '/organizations/org-1/branding', body: input,
      });
      expect(result).toEqual({ primaryColor: '#fff', companyName: 'New Acme' });
    });
  });

  // ── getAsset ────────────────────────────────────────────────
  describe('getAsset', () => {
    it('calls GET /organizations/:orgId/branding/:assetType', async () => {
      transport = mockTransport({ status: 200, body: Buffer.from('png-data'), headers: { 'content-type': 'image/png' } });
      const branding = createBrandingDomain(transport);
      const result = await branding.getAsset(orgId, 'logo');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'GET', path: '/organizations/org-1/branding/logo', responseType: 'raw',
      });
      expect(result).toBeDefined();
    });
  });

  // ── uploadAsset ─────────────────────────────────────────────
  describe('uploadAsset', () => {
    it('calls PUT /organizations/:orgId/branding/:assetType with data', async () => {
      transport = mockTransport();
      const branding = createBrandingDomain(transport);
      const data = Buffer.from('png-data');
      await branding.uploadAsset(orgId, 'favicon', data);
      expect(transport.request).toHaveBeenCalledWith({
        method: 'PUT', path: '/organizations/org-1/branding/favicon', body: data, contentType: null,
      });
    });
  });

  // ── deleteAsset ─────────────────────────────────────────────
  describe('deleteAsset', () => {
    it('calls DELETE /organizations/:orgId/branding/:assetType', async () => {
      transport = mockTransport();
      const branding = createBrandingDomain(transport);
      await branding.deleteAsset(orgId, 'logo');
      expect(transport.request).toHaveBeenCalledWith({
        method: 'DELETE', path: '/organizations/org-1/branding/logo',
      });
    });
  });
});
