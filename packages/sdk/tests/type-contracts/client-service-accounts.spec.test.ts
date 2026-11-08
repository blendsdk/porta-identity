/**
 * Public type contract for client service-account management.
 *
 * The runtime oracle in `../domains/client-service-accounts.spec.test.ts`
 * pins transport behavior. This file pins the public names, the exact binding
 * and input shapes, and the three transport-bound method signatures so a
 * caller can rely on them at compile time.
 */

import { describe, expectTypeOf, it } from 'vitest';
import type {
  ClientServiceAccount,
  ClientsDomain,
  SetClientServiceAccountInput,
} from '../../src/index.js';
import type {
  ClientServiceAccount as BarrelledClientServiceAccount,
  SetClientServiceAccountInput as BarrelledSetClientServiceAccountInput,
} from '../../src/types/index.js';
import type {
  ClientServiceAccount as DeclaredClientServiceAccount,
  SetClientServiceAccountInput as DeclaredSetClientServiceAccountInput,
} from '../../src/types/client-service-accounts.js';

/** One organization-qualified policy target as exposed by the SDK. */
type ExpectedTarget = {
  organizationId: string;
  allowedRoles: Array<{ applicationId: string; roleId: string }>;
  allowedClaimDefinitions: Array<{ applicationId: string; claimDefinitionId: string }>;
};

/** Secret-free binding projection returned by reads and writes. */
type ExpectedClientServiceAccount = {
  id: string;
  clientId: string;
  serviceAccountId: string;
  accountEmail: string;
  status: 'active' | 'revoked';
  targets: ExpectedTarget[];
  createdAt: string;
  updatedAt: string;
};

/** Complete write body; the initial email is supplied by the caller. */
type ExpectedSetClientServiceAccountInput = {
  accountEmail?: string;
  targets: ExpectedTarget[];
};

/**
 * Compile valid and invalid calls without issuing any request.
 *
 * The `@ts-expect-error` lines fail typechecking when the implementation
 * becomes more permissive than the approved public contract.
 */
function checkCalls(clients: ClientsDomain, input: SetClientServiceAccountInput): void {
  const read: Promise<ClientServiceAccount> = clients.getServiceAccount('client-id');
  const write: Promise<ClientServiceAccount> = clients.setServiceAccount('client-id', input);
  const revoked: Promise<void> = clients.revokeServiceAccount('client-id');

  expectTypeOf(read).toEqualTypeOf<Promise<ClientServiceAccount>>();
  expectTypeOf(write).toEqualTypeOf<Promise<ClientServiceAccount>>();
  expectTypeOf(revoked).toEqualTypeOf<Promise<void>>();

  // @ts-expect-error The internal client identifier is required.
  void clients.getServiceAccount();
  // @ts-expect-error The write body is required.
  void clients.setServiceAccount('client-id');
  // @ts-expect-error A write body always carries its target collection.
  void clients.setServiceAccount('client-id', { accountEmail: 'service@example.test' });
  // @ts-expect-error The account email is optional but never nullable.
  void clients.setServiceAccount('client-id', { accountEmail: null, targets: [] });
  // @ts-expect-error Revocation returns no binding document.
  const wrongRevocation: Promise<ClientServiceAccount> = clients.revokeServiceAccount('client-id');
  void wrongRevocation;
}

describe('client service-account type contract', () => {
  it('should export the exact public binding shape from its file, barrel, and entrypoint', () => {
    expectTypeOf<ClientServiceAccount>().toEqualTypeOf<ExpectedClientServiceAccount>();
    expectTypeOf<DeclaredClientServiceAccount>().toEqualTypeOf<ClientServiceAccount>();
    expectTypeOf<BarrelledClientServiceAccount>().toEqualTypeOf<ClientServiceAccount>();

    expectTypeOf<ClientServiceAccount['status']>().toEqualTypeOf<'active' | 'revoked'>();
    expectTypeOf<ClientServiceAccount['targets']>().toEqualTypeOf<ExpectedTarget[]>();
    expectTypeOf<ClientServiceAccount['targets'][number]>().toEqualTypeOf<ExpectedTarget>();
    expectTypeOf<ExpectedTarget['allowedRoles'][number]>().toEqualTypeOf<{
      applicationId: string;
      roleId: string;
    }>();
    expectTypeOf<ExpectedTarget['allowedClaimDefinitions'][number]>().toEqualTypeOf<{
      applicationId: string;
      claimDefinitionId: string;
    }>();
  });

  it('should export the exact public write shape with an optional email', () => {
    expectTypeOf<SetClientServiceAccountInput>().toEqualTypeOf<
      ExpectedSetClientServiceAccountInput
    >();
    expectTypeOf<DeclaredSetClientServiceAccountInput>().toEqualTypeOf<
      SetClientServiceAccountInput
    >();
    expectTypeOf<BarrelledSetClientServiceAccountInput>().toEqualTypeOf<
      SetClientServiceAccountInput
    >();

    const withoutEmail: SetClientServiceAccountInput = { targets: [] };
    const withEmail: SetClientServiceAccountInput = {
      accountEmail: 'service@example.test',
      targets: [
        {
          organizationId: 'organization-id',
          allowedRoles: [{ applicationId: 'application-id', roleId: 'role-id' }],
          allowedClaimDefinitions: [
            { applicationId: 'application-id', claimDefinitionId: 'claim-definition-id' },
          ],
        },
      ],
    };

    expectTypeOf(withoutEmail).toEqualTypeOf<SetClientServiceAccountInput>();
    expectTypeOf(withEmail).toEqualTypeOf<SetClientServiceAccountInput>();
  });

  it('should expose the exact transport-bound method signatures', () => {
    expectTypeOf<ClientsDomain['getServiceAccount']>().toEqualTypeOf<
      (id: string) => Promise<ClientServiceAccount>
    >();
    expectTypeOf<ClientsDomain['setServiceAccount']>().toEqualTypeOf<
      (id: string, input: SetClientServiceAccountInput) => Promise<ClientServiceAccount>
    >();
    expectTypeOf<ClientsDomain['revokeServiceAccount']>().toEqualTypeOf<
      (id: string) => Promise<void>
    >();
    expectTypeOf(checkCalls).toBeFunction();
  });
});
