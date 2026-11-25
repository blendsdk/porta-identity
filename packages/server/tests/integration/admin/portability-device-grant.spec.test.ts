/**
 * Portability specification for device-only clients.
 *
 * The manifest schema is a closed wire contract. A device-only client must
 * round-trip its full URN, empty redirects and empty response types, while an
 * older reader or an invalid mixed client must be rejected rather than having
 * the grant silently dropped.
 */

import { describe, expect, it } from 'vitest';
import {
  importManifestRequestSchema,
  portabilityManifestSchema,
} from '../../../src/portability/index.js';

/** Full RFC 8628 grant value. */
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

/** A valid device-only portable client record. */
const deviceClient = {
  client_id: 'device-portable-client',
  organization_slug: 'acme-org',
  application_slug: 'device-app',
  name: 'Device-only portable client',
  client_type: 'public',
  application_type: 'native',
  status: 'active',
  grant_types: [DEVICE_GRANT],
  response_types: [],
  scope: 'openid profile',
  login_methods: null,
  token_endpoint_auth_method: 'none',
  redirect_uris: [],
  post_logout_redirect_uris: [],
  allowed_origins: [],
  require_pkce: true,
  require_consent: false,
} as const;

/** Build a complete manifest containing one client record. */
function manifest(client: Record<string, unknown>) {
  return {
    version: '1.0',
    exported_at: new Date().toISOString(),
    scope: { kind: 'organization', organization_slug: 'acme-org' },
    categories: ['oidc_clients'],
    application_selection: { all_applications: true, application_slugs: [] },
    organizations: [],
    applications: [],
    application_modules: [],
    roles: [],
    permissions: [],
    claim_definitions: [],
    role_permission_mappings: [],
    users: [],
    user_role_assignments: [],
    user_claim_values: [],
    clients: [client],
  };
}

describe('portability device client contract', () => {
  it('round-trips a device-only client with the full URN and empty collections', () => {
    const first = portabilityManifestSchema.safeParse(manifest(deviceClient));
    expect(first.success).toBe(true);
    if (!first.success) return;

    const serialized = JSON.parse(JSON.stringify(first.data)) as unknown;
    const second = portabilityManifestSchema.safeParse(serialized);
    expect(second.success).toBe(true);
    if (!second.success) return;

    expect(second.data.clients).toHaveLength(1);
    expect(second.data.clients[0]?.grant_types).toEqual([DEVICE_GRANT]);
    expect(second.data.clients[0]?.redirect_uris).toEqual([]);
    expect(second.data.clients[0]?.response_types).toEqual([]);
  });

  it('rejects an unknown grant and an empty authorization-code collection', () => {
    expect(
      portabilityManifestSchema.safeParse(
        manifest({ ...deviceClient, grant_types: ['urn:example:unknown'] }),
      ).success,
    ).toBe(false);

    expect(
      portabilityManifestSchema.safeParse(
        manifest({
          ...deviceClient,
          grant_types: ['authorization_code'],
          response_types: ['code'],
        }),
      ).success,
    ).toBe(false);
  });

  it('accepts the device manifest in a dry-run import request', () => {
    const result = importManifestRequestSchema.safeParse({
      manifest: manifest(deviceClient),
      mode: 'dry-run',
    });
    expect(result.success).toBe(true);
  });
});
