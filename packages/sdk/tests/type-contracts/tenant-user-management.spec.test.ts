/**
 * Implementation-level SDK contract checks for additive verification fields.
 */

import { expectTypeOf, it } from 'vitest';
import type { CreateUserInput, UpdateUserInput, User } from '../../src/types/index.js';

it('accepts verification fields without changing the Admin profile shape', () => {
  const create: CreateUserInput = {
    organizationId: 'org-1',
    email: 'user@example.test',
    password: 'admin-only',
    phoneNumber: '+15555550123',
    phoneNumberVerified: true,
    emailVerified: true,
  };
  const update: UpdateUserInput = {
    nickname: 'newbie',
    phoneNumberVerified: false,
    emailVerified: false,
  };

  expectTypeOf(create).toMatchTypeOf<CreateUserInput>();
  expectTypeOf(update).toMatchTypeOf<UpdateUserInput>();
  expectTypeOf<User>().toHaveProperty('emailVerified');
});
