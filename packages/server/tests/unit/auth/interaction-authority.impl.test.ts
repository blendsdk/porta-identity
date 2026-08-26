import { describe, expect, it, vi } from 'vitest';
import { createInteractionAuthorityResolver } from '../../../src/auth/interaction-authority.js';

describe('interaction authority resolver', () => {
  it('should return the exact live client when provider authority matches', async () => {
    const find = vi.fn().mockResolvedValue({
      uid: 'interaction-alpha',
      params: { client_id: 'client-alpha' },
    });
    const resolver = createInteractionAuthorityResolver({ Interaction: { find } });

    await expect(resolver.resolve('interaction-alpha')).resolves.toStrictEqual({
      interactionUid: 'interaction-alpha',
      clientId: 'client-alpha',
    });
    expect(find).toHaveBeenCalledWith('interaction-alpha');
  });

  it.each([
    ['missing record', undefined],
    [
      'different returned identifier',
      { uid: 'interaction-bravo', params: { client_id: 'client-alpha' } },
    ],
    ['missing client identifier', { uid: 'interaction-alpha', params: {} }],
  ])('should fail closed for %s', async (_caseName, record) => {
    const resolver = createInteractionAuthorityResolver({
      Interaction: { find: vi.fn().mockResolvedValue(record) },
    });

    await expect(resolver.resolve('interaction-alpha')).resolves.toBeNull();
  });

  it('should reject malformed identifiers without querying provider storage', async () => {
    const find = vi.fn();
    const resolver = createInteractionAuthorityResolver({ Interaction: { find } });

    await expect(resolver.resolve('')).resolves.toBeNull();
    expect(find).not.toHaveBeenCalled();
  });
});
