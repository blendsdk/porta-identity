/** Focused regressions retained from the retired provisioning import schema. */

import { describe, expect, it } from 'vitest';
import { portabilityManifestSchema } from '../../../src/portability/index.js';
import { importManifest } from '../portability/portability-import-fixtures.js';

describe('strict portability manifest regressions', () => {
  it('preserves free-form role and permission claim values after outer trimming', () => {
    const result = portabilityManifestSchema.parse(
      importManifest({
        categories: ['applications_authorization'],
        application_selection: { all_applications: true, application_slugs: [] },
        roles: [
          {
            application_slug: 'app',
            slug: '  GROUP_ADMIN  ',
            name: 'Administrator',
            description: null,
          },
        ],
        permissions: [
          {
            application_slug: 'app',
            slug: '  CAN_ADD_ORDER  ',
            module_slug: null,
            name: 'Add order',
            description: null,
          },
        ],
        role_permission_mappings: [
          {
            application_slug: 'app',
            role_slug: '  GROUP_ADMIN  ',
            permission_slugs: ['  CAN_ADD_ORDER  '],
          },
        ],
      }),
    );

    expect(result.roles[0]?.slug).toBe('GROUP_ADMIN');
    expect(result.permissions[0]?.slug).toBe('CAN_ADD_ORDER');
    expect(result.role_permission_mappings[0]).toMatchObject({
      role_slug: 'GROUP_ADMIN',
      permission_slugs: ['CAN_ADD_ORDER'],
    });
  });

  it('rejects retired global configuration instead of silently importing it', () => {
    expect(
      portabilityManifestSchema.safeParse({
        ...importManifest({}),
        config: { access_token_ttl: 7200 },
      }).success,
    ).toBe(false);
  });

  it('rejects credential-equivalent fields anywhere in the strict manifest', () => {
    expect(
      portabilityManifestSchema.safeParse({
        ...importManifest({}),
        client_secret: 'must-not-be-imported',
      }).success,
    ).toBe(false);
  });
});
