/**
 * Type compatibility tests — verify SDK entity types stay in sync with server types.
 *
 * The server defines entity types with `Date` objects for timestamp fields.
 * When serialized to JSON (as API responses), these become ISO 8601 strings.
 * The SDK defines the same entities with `string` for timestamp fields.
 *
 * These tests verify that, after Date→string conversion, the server and SDK
 * entity types are structurally equivalent. If a field is added, removed, or
 * changed on either side without a matching update, TypeScript compilation fails.
 *
 * Strategy per entity type:
 *   1. DateToString<ServerType> → SdkType  (server response fits SDK shape)
 *   2. SdkType → DateToString<ServerType>  (SDK shape fits server response)
 * If both pass → types are structurally equivalent.
 *
 * @module tests/type-compatibility
 */
import { describe, it, expectTypeOf } from 'vitest';

// ─── Server types (source of truth) ────────────────────────────────────────
import type { Organization as ServerOrganization } from '../../../../src/organizations/types.js';
import type {
  Application as ServerApplication,
  ApplicationModule as ServerApplicationModule,
} from '../../../../src/applications/types.js';
import type {
  Client as ServerClient,
  ClientSecret as ServerClientSecret,
} from '../../../../src/clients/types.js';
import type { User as ServerUser } from '../../../../src/users/types.js';
import type {
  Role as ServerRole,
  Permission as ServerPermission,
} from '../../../../src/rbac/types.js';
import type { ClaimDefinition as ServerClaimDefinition } from '../../../../src/custom-claims/types.js';

// ─── SDK types (under test) ────────────────────────────────────────────────
import type {
  Organization,
  Application,
  ApplicationModule,
  Client,
  ClientSecret,
  User,
  Role,
  Permission,
  ClaimDefinition,
} from '../../src/types/index.js';

// ─── Date → String conversion helper ──────────────────────────────────────

/**
 * Converts Date fields to string in a type, simulating JSON.stringify().
 * If Date is part of a union (e.g. Date | null), it is replaced with string
 * while preserving the rest of the union (e.g. string | null).
 */
type DateToString<T> = {
  [K in keyof T]: Date extends T[K]
    ? Exclude<T[K], Date> | string
    : T[K];
};

// ─── Entity type compatibility tests ──────────────────────────────────────

describe('Type Compatibility: SDK ↔ Server entity types', () => {
  describe('Organization', () => {
    it('server → SDK: serialized server type is assignable to SDK type', () => {
      expectTypeOf<DateToString<ServerOrganization>>().toMatchTypeOf<Organization>();
    });

    it('SDK → server: SDK type is assignable to serialized server type', () => {
      expectTypeOf<Organization>().toMatchTypeOf<DateToString<ServerOrganization>>();
    });
  });

  describe('Application', () => {
    it('server → SDK: serialized server type is assignable to SDK type', () => {
      expectTypeOf<DateToString<ServerApplication>>().toMatchTypeOf<Application>();
    });

    it('SDK → server: SDK type is assignable to serialized server type', () => {
      expectTypeOf<Application>().toMatchTypeOf<DateToString<ServerApplication>>();
    });
  });

  describe('ApplicationModule', () => {
    it('server → SDK: serialized server type is assignable to SDK type', () => {
      expectTypeOf<DateToString<ServerApplicationModule>>().toMatchTypeOf<ApplicationModule>();
    });

    it('SDK → server: SDK type is assignable to serialized server type', () => {
      expectTypeOf<ApplicationModule>().toMatchTypeOf<DateToString<ServerApplicationModule>>();
    });
  });

  describe('Client', () => {
    it('server → SDK: serialized server type is assignable to SDK type', () => {
      expectTypeOf<DateToString<ServerClient>>().toMatchTypeOf<Client>();
    });

    it('SDK → server: SDK type is assignable to serialized server type', () => {
      expectTypeOf<Client>().toMatchTypeOf<DateToString<ServerClient>>();
    });
  });

  describe('ClientSecret', () => {
    it('server → SDK: serialized server type is assignable to SDK type', () => {
      expectTypeOf<DateToString<ServerClientSecret>>().toMatchTypeOf<ClientSecret>();
    });

    it('SDK → server: SDK type is assignable to serialized server type', () => {
      expectTypeOf<ClientSecret>().toMatchTypeOf<DateToString<ServerClientSecret>>();
    });
  });

  describe('User', () => {
    it('server → SDK: serialized server type is assignable to SDK type', () => {
      expectTypeOf<DateToString<ServerUser>>().toMatchTypeOf<User>();
    });

    it('SDK → server: SDK type is assignable to serialized server type', () => {
      expectTypeOf<User>().toMatchTypeOf<DateToString<ServerUser>>();
    });
  });

  describe('Role', () => {
    it('server → SDK: serialized server type is assignable to SDK type', () => {
      expectTypeOf<DateToString<ServerRole>>().toMatchTypeOf<Role>();
    });

    it('SDK → server: SDK type is assignable to serialized server type', () => {
      expectTypeOf<Role>().toMatchTypeOf<DateToString<ServerRole>>();
    });
  });

  describe('Permission', () => {
    it('server → SDK: serialized server type is assignable to SDK type', () => {
      expectTypeOf<DateToString<ServerPermission>>().toMatchTypeOf<Permission>();
    });

    it('SDK → server: SDK type is assignable to serialized server type', () => {
      expectTypeOf<Permission>().toMatchTypeOf<DateToString<ServerPermission>>();
    });
  });

  describe('ClaimDefinition', () => {
    it('server → SDK: serialized server type is assignable to SDK type', () => {
      expectTypeOf<DateToString<ServerClaimDefinition>>().toMatchTypeOf<ClaimDefinition>();
    });

    it('SDK → server: SDK type is assignable to serialized server type', () => {
      expectTypeOf<ClaimDefinition>().toMatchTypeOf<DateToString<ServerClaimDefinition>>();
    });
  });
});
