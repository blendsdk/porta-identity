import { describe, expect, it } from 'vitest';

import { createUserRoleRouter } from '../../../src/routes/user-roles.js';
import { createStandaloneUserRouter, createUserRouter } from '../../../src/routes/users.js';

const organizationPrefix = '/api/admin/organizations/:orgId/users';
const scopeMiddlewareName = 'requireUserOrganizationMiddleware';

/** Returns every organization-prefixed route that targets one concrete user. */
function scopedUserLayers(): ReturnType<typeof createUserRouter>['stack'] {
  return [...createUserRouter().stack, ...createUserRoleRouter().stack].filter(
    (layer) =>
      layer.methods.length > 0 &&
      layer.path.startsWith(organizationPrefix) &&
      layer.path.includes(':userId'),
  );
}

describe('organization-scoped user route registration', () => {
  it('should guard every user-specific organization route after permission middleware', () => {
    const layers = scopedUserLayers();
    expect(layers.length).toBeGreaterThan(0);

    for (const layer of layers) {
      const guardIndex = layer.stack.findIndex(
        (middleware) => middleware.name === scopeMiddlewareName,
      );
      expect(guardIndex, `${layer.methods.join(',')} ${layer.path}`).toBe(layer.stack.length - 2);
      expect(guardIndex).toBeGreaterThan(0);
    }
  });

  it('should keep intentionally global standalone user routes outside organization scoping', () => {
    const standaloneUserLayers = createStandaloneUserRouter().stack.filter((layer) =>
      layer.path.includes(':userId'),
    );
    expect(standaloneUserLayers.length).toBeGreaterThan(0);

    for (const layer of standaloneUserLayers) {
      expect(layer.stack.some((middleware) => middleware.name === scopeMiddlewareName)).toBe(false);
    }
  });
});
