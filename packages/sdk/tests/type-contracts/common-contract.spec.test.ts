import { describe, expectTypeOf, it } from 'vitest';
import { createOrganizationsDomain } from '../../src/domains/organizations.js';
import type {
  ETagResponse,
  HistoryParams,
  HistoryResult,
  ListParams,
  Organization,
  SlugValidationResult,
  UpdateOrganizationInput,
} from '../../src/types/index.js';

type ExpectedSlugValidationResult = {
  isValid: boolean;
  error?: string;
};

type ExpectedHistoryParams = {
  limit?: number;
  after?: string;
  eventType?: string;
};

type OrganizationsDomain = ReturnType<typeof createOrganizationsDomain>;

describe('common type contracts', () => {
  it('exposes the exact slug validation result shape', () => {
    expectTypeOf<SlugValidationResult>().toEqualTypeOf<ExpectedSlugValidationResult>();
  });

  it('exposes the exact history parameter shape', () => {
    expectTypeOf<HistoryParams>().toEqualTypeOf<ExpectedHistoryParams>();
  });

  it('exposes the exact shared sort parameter keys', () => {
    expectTypeOf<ListParams['sortBy']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<ListParams['sortOrder']>().toEqualTypeOf<'asc' | 'desc' | undefined>();
  });

  it('exposes organization method signatures that preserve the server contract', () => {
    expectTypeOf<OrganizationsDomain['update']>().toEqualTypeOf<
      (
        idOrSlug: string,
        input: UpdateOrganizationInput,
        etag?: string,
      ) => Promise<ETagResponse<Organization>>
    >();
    expectTypeOf<OrganizationsDomain['validateSlug']>().toEqualTypeOf<
      (slug: string) => Promise<SlugValidationResult>
    >();
    expectTypeOf<OrganizationsDomain['getHistory']>().toEqualTypeOf<
      (idOrSlug: string, params?: HistoryParams) => Promise<HistoryResult>
    >();
  });
});
