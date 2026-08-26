import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies — vi.mock factories are hoisted, use inline objects
vi.mock('../../../src/users/service.js', () => ({
  findUserForOidc: vi.fn(),
}));

vi.mock('../../../src/users/claims.js', () => ({
  buildUserClaims: vi.fn(),
}));

vi.mock('../../../src/rbac/user-role-service.js', () => ({
  buildRoleClaims: vi.fn(),
  buildPermissionClaims: vi.fn(),
}));

vi.mock('../../../src/custom-claims/service.js', () => ({
  buildCustomClaims: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { findUserForOidc } from '../../../src/users/service.js';
import { buildUserClaims } from '../../../src/users/claims.js';
import { buildRoleClaims, buildPermissionClaims } from '../../../src/rbac/user-role-service.js';
import { buildCustomClaims } from '../../../src/custom-claims/service.js';
import { findAccount } from '../../../src/oidc/account-finder.js';
import type { User } from '../../../src/users/types.js';

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleUser: User = {
  id: 'user-uuid-123',
  organizationId: 'org-uuid-1',
  email: 'john@example.com',
  emailVerified: true,
  status: 'active',
  givenName: 'John',
  familyName: 'Doe',
  middleName: null,
  nickname: null,
  preferredUsername: null,
  profileUrl: null,
  pictureUrl: null,
  websiteUrl: null,
  gender: null,
  birthdate: null,
  zoneinfo: null,
  locale: null,
  phoneNumber: '+31612345678',
  phoneNumberVerified: false,
  addressStreet: null,
  addressLocality: null,
  addressRegion: null,
  addressPostalCode: null,
  addressCountry: null,
  loginCount: 0,
  lastLoginAt: null,
  lockedAt: null,
  lockedReason: null,
  passwordChangedAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

/** Helper to create a context with applicationId in OIDC client metadata */
function createCtxWithApp(applicationId: string) {
  return { oidc: { client: { applicationId } } };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Reset default mock return values
  vi.mocked(findUserForOidc).mockResolvedValue(null);
  vi.mocked(buildUserClaims).mockReturnValue({ sub: 'user-uuid-123' });
  vi.mocked(buildRoleClaims).mockResolvedValue(['admin', 'editor']);
  vi.mocked(buildPermissionClaims).mockResolvedValue(['docs:articles:read', 'docs:articles:write']);
  vi.mocked(buildCustomClaims).mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// findAccount basics
// ---------------------------------------------------------------------------

describe('findAccount', () => {
  it('should return account for active user', async () => {
    vi.mocked(findUserForOidc).mockResolvedValue(sampleUser);

    const result = await findAccount(null, 'user-uuid-123');

    expect(result).toBeDefined();
    expect(result!.accountId).toBe('user-uuid-123');
  });

  it('should return undefined for missing user', async () => {
    vi.mocked(findUserForOidc).mockResolvedValue(null);

    const result = await findAccount(null, 'nonexistent');
    expect(result).toBeUndefined();
  });

  it('should return undefined on service error', async () => {
    vi.mocked(findUserForOidc).mockRejectedValue(new Error('service error'));

    const result = await findAccount(null, 'user-uuid-123');
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// claims() — standard OIDC claims
// ---------------------------------------------------------------------------

describe('claims() — standard claims', () => {
  it('should return standard OIDC claims with RBAC', async () => {
    vi.mocked(findUserForOidc).mockResolvedValue(sampleUser);
    vi.mocked(buildUserClaims).mockReturnValue({
      sub: 'user-uuid-123',
      email: 'john@example.com',
      email_verified: true,
      name: 'John Doe',
      given_name: 'John',
      family_name: 'Doe',
      phone_number: '+31612345678',
    });

    const account = await findAccount(null, 'user-uuid-123');
    const claims = await account!.claims('id_token', 'openid profile email');

    expect(claims.sub).toBe('user-uuid-123');
    expect(claims.email).toBe('john@example.com');
    expect(claims.name).toBe('John Doe');
    expect(buildUserClaims).toHaveBeenCalledWith(sampleUser, ['openid', 'profile', 'email']);
  });

  it('should parse space-separated scope string', async () => {
    vi.mocked(findUserForOidc).mockResolvedValue(sampleUser);

    const account = await findAccount(null, 'user-uuid-123');
    await account!.claims('id_token', 'openid profile email phone');

    expect(buildUserClaims).toHaveBeenCalledWith(
      sampleUser,
      ['openid', 'profile', 'email', 'phone'],
    );
  });

  it('should handle empty scope string', async () => {
    vi.mocked(findUserForOidc).mockResolvedValue(sampleUser);

    const account = await findAccount(null, 'user-uuid-123');
    await account!.claims('id_token', '');

    expect(buildUserClaims).toHaveBeenCalledWith(sampleUser, []);
  });
});

// ---------------------------------------------------------------------------
// claims() — RBAC claims
// ---------------------------------------------------------------------------

describe('claims() — RBAC claims', () => {
  it('should include roles and permissions arrays', async () => {
    vi.mocked(findUserForOidc).mockResolvedValue(sampleUser);

    const account = await findAccount(null, 'user-uuid-123');
    const claims = await account!.claims('id_token', 'openid');

    expect(claims.roles).toEqual(['admin', 'editor']);
    expect(claims.permissions).toEqual(['docs:articles:read', 'docs:articles:write']);
  });

  it('should call RBAC builders with user ID', async () => {
    vi.mocked(findUserForOidc).mockResolvedValue(sampleUser);

    const account = await findAccount(null, 'user-uuid-123');
    await account!.claims('id_token', 'openid');

    expect(buildRoleClaims).toHaveBeenCalledWith('user-uuid-123');
    expect(buildPermissionClaims).toHaveBeenCalledWith('user-uuid-123');
  });

  it('should include empty arrays when user has no roles/permissions', async () => {
    vi.mocked(findUserForOidc).mockResolvedValue(sampleUser);
    vi.mocked(buildRoleClaims).mockResolvedValue([]);
    vi.mocked(buildPermissionClaims).mockResolvedValue([]);

    const account = await findAccount(null, 'user-uuid-123');
    const claims = await account!.claims('id_token', 'openid');

    expect(claims.roles).toEqual([]);
    expect(claims.permissions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// claims() — custom claims
// ---------------------------------------------------------------------------

describe('claims() — custom claims', () => {
  it('should include custom claims when applicationId is available', async () => {
    vi.mocked(findUserForOidc).mockResolvedValue(sampleUser);
    vi.mocked(buildCustomClaims).mockResolvedValue({ department: 'Engineering', level: 5 });

    const ctx = createCtxWithApp('app-uuid-1');
    const account = await findAccount(ctx, 'user-uuid-123');
    const claims = await account!.claims('id_token', 'openid');

    expect(claims.department).toBe('Engineering');
    expect(claims.level).toBe(5);
    expect(buildCustomClaims).toHaveBeenCalledWith('user-uuid-123', 'app-uuid-1', 'id_token');
  });

  it('should skip custom claims when no applicationId in context', async () => {
    vi.mocked(findUserForOidc).mockResolvedValue(sampleUser);

    const account = await findAccount(null, 'user-uuid-123');
    const claims = await account!.claims('id_token', 'openid');

    expect(buildCustomClaims).not.toHaveBeenCalled();
    // Should still have standard + RBAC claims
    expect(claims.roles).toBeDefined();
  });

  it('should skip custom claims when ctx has no oidc property', async () => {
    vi.mocked(findUserForOidc).mockResolvedValue(sampleUser);

    const account = await findAccount({}, 'user-uuid-123');
    await account!.claims('id_token', 'openid');

    expect(buildCustomClaims).not.toHaveBeenCalled();
  });

  it('should map "id_token" use to id_token token type', async () => {
    vi.mocked(findUserForOidc).mockResolvedValue(sampleUser);
    vi.mocked(buildCustomClaims).mockResolvedValue({});

    const ctx = createCtxWithApp('app-uuid-1');
    const account = await findAccount(ctx, 'user-uuid-123');
    await account!.claims('id_token', 'openid');

    expect(buildCustomClaims).toHaveBeenCalledWith('user-uuid-123', 'app-uuid-1', 'id_token');
  });

  it('should map "userinfo" use to userinfo token type', async () => {
    vi.mocked(findUserForOidc).mockResolvedValue(sampleUser);
    vi.mocked(buildCustomClaims).mockResolvedValue({});

    const ctx = createCtxWithApp('app-uuid-1');
    const account = await findAccount(ctx, 'user-uuid-123');
    await account!.claims('userinfo', 'openid profile');

    expect(buildCustomClaims).toHaveBeenCalledWith('user-uuid-123', 'app-uuid-1', 'userinfo');
  });

  it('should default to access_token for unknown use values', async () => {
    vi.mocked(findUserForOidc).mockResolvedValue(sampleUser);
    vi.mocked(buildCustomClaims).mockResolvedValue({});

    const ctx = createCtxWithApp('app-uuid-1');
    const account = await findAccount(ctx, 'user-uuid-123');
    await account!.claims('introspection', 'openid');

    expect(buildCustomClaims).toHaveBeenCalledWith('user-uuid-123', 'app-uuid-1', 'access_token');
  });
});

// ---------------------------------------------------------------------------
// claims() — merged output
// ---------------------------------------------------------------------------

describe('claims() — merged output', () => {
  it('should merge standard, RBAC, and custom claims', async () => {
    vi.mocked(findUserForOidc).mockResolvedValue(sampleUser);
    vi.mocked(buildUserClaims).mockReturnValue({
      sub: 'user-uuid-123',
      email: 'john@example.com',
    });
    vi.mocked(buildRoleClaims).mockResolvedValue(['admin']);
    vi.mocked(buildPermissionClaims).mockResolvedValue(['docs:read']);
    vi.mocked(buildCustomClaims).mockResolvedValue({ department: 'Engineering' });

    const ctx = createCtxWithApp('app-uuid-1');
    const account = await findAccount(ctx, 'user-uuid-123');
    const claims = await account!.claims('id_token', 'openid email');

    // Standard
    expect(claims.sub).toBe('user-uuid-123');
    expect(claims.email).toBe('john@example.com');
    // RBAC
    expect(claims.roles).toEqual(['admin']);
    expect(claims.permissions).toEqual(['docs:read']);
    // Custom
    expect(claims.department).toBe('Engineering');
  });
});
