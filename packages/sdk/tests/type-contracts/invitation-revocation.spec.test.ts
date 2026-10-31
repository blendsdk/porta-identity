/** Both string identifiers are required and revocation returns no result document. */
import { describe, expectTypeOf, it } from 'vitest';
import type { RevokeInvitationInput as PublicInput } from '../../src/index.js';
import type { UsersDomain } from '../../src/domains/index.js';
import type { RevokeInvitationInput } from '../../src/types/index.js';
import type { RevokeInvitationInput as DeclaredInput } from '../../src/types/users.js';

/** Compile actual calls, including invalid inputs, without issuing requests at runtime. */
function checkCalls(users: UsersDomain, input: RevokeInvitationInput): void {
  const completion: Promise<void> = users.revokeInvitation(input);
  expectTypeOf(completion).toEqualTypeOf<Promise<void>>();

  // @ts-expect-error Revocation requires the organization boundary.
  void users.revokeInvitation({ invitationId: 'invitation-id' });
  // @ts-expect-error Revocation requires the target invitation identifier.
  void users.revokeInvitation({ organizationId: 'organization-id' });
  // @ts-expect-error Organization identifiers must be strings.
  void users.revokeInvitation({ organizationId: 42, invitationId: 'invitation-id' });
  // @ts-expect-error Invitation identifiers must be strings.
  void users.revokeInvitation({ organizationId: 'organization-id', invitationId: 42 });
  // @ts-expect-error The operation does not return an invitation or an existence classification.
  const document: Promise<{ invitationId: string }> = users.revokeInvitation(input);
  void document;
}

describe('invitation revocation type contract', () => {
  it('should export the same exact input shape from its declaration and public entry points', () => {
    expectTypeOf<RevokeInvitationInput>().toEqualTypeOf<{
      organizationId: string;
      invitationId: string;
    }>();
    expectTypeOf<DeclaredInput>().toEqualTypeOf<RevokeInvitationInput>();
    expectTypeOf<PublicInput>().toEqualTypeOf<RevokeInvitationInput>();

    const valid: RevokeInvitationInput = {
      organizationId: '8ca40477-c516-4cfa-bc14-c112aa2b9ca5',
      invitationId: 'b520414b-a3ca-4c02-a743-9f35baeb1cde',
    };
    expectTypeOf(valid).toEqualTypeOf<RevokeInvitationInput>();
  });

  it('should expose a transport-bound method with an exact Promise<void> result', () => {
    expectTypeOf<UsersDomain['revokeInvitation']>().toEqualTypeOf<
      (input: RevokeInvitationInput) => Promise<void>
    >();
    expectTypeOf(checkCalls).toBeFunction();
  });
});
