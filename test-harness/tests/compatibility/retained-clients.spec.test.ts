import { expect, test } from '@playwright/test';

/** Reads one exact lifecycle-owned client URL from the environment. */
function clientUrl(name: 'HARNESS_APP_URL' | 'HARNESS_BFF_URL'): string {
  const value = process.env[name];
  if (value === undefined) throw new Error(`${name} is required`);
  return new URL(value).toString();
}

test('serves both retained public client entry points', async ({ request }) => {
  for (const url of [clientUrl('HARNESS_APP_URL'), clientUrl('HARNESS_BFF_URL')]) {
    const response = await request.get(url);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('text/html');
  }
});
