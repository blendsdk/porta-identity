import { expect, test } from '@playwright/test';
import { z } from 'zod';

/** Returns the active Porta origin supplied by the owner-fenced harness lifecycle. */
function portaOrigin(): string {
  const value = process.env.HARNESS_PORTA_URL;
  if (value === undefined) throw new Error('HARNESS_PORTA_URL is required');
  return new URL(value).origin;
}

test('publishes tenant-specific discovery with exact issuers', async ({ request }) => {
  const porta = portaOrigin();
  for (const tenant of ['alpha', 'bravo'] as const) {
    const response = await request.get(`${porta}/${tenant}/.well-known/openid-configuration`);
    expect(response.ok()).toBe(true);
    const discovery = z
      .object({
        issuer: z.string().url(),
        authorization_endpoint: z.string().url(),
        token_endpoint: z.string().url(),
      })
      .passthrough()
      .parse(await response.json());
    expect(discovery).toMatchObject({
      issuer: `${porta}/${tenant}`,
      authorization_endpoint: `${porta}/${tenant}/auth`,
      token_endpoint: `${porta}/${tenant}/token`,
    });
  }
});
