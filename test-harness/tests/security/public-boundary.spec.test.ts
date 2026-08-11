import { expect, test } from '@playwright/test';

/** Returns the active Porta origin supplied by the owner-fenced harness lifecycle. */
function portaOrigin(): string {
  const value = process.env.HARNESS_PORTA_URL;
  if (value === undefined) throw new Error('HARNESS_PORTA_URL is required');
  return new URL(value).origin;
}

test('keeps framework identity out of the public health response', async ({ request }) => {
  const response = await request.get(`${portaOrigin()}/health`);

  expect(response.ok()).toBe(true);
  expect(response.headers()['x-powered-by']).toBeUndefined();
  expect(await response.text()).not.toMatch(/(?:koa|express|node\.js)/iu);
});
