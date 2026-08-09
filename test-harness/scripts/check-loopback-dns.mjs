import { resolve4 } from 'node:dns/promises';

/** Hosts reserved for the browser-facing OIDC test harness. */
const harnessHosts = ['porta-harness.ci.portaidentity.com', 'app-harness.ci.portaidentity.com'];

for (const host of harnessHosts) {
  let addresses;

  try {
    addresses = await resolve4(host);
  } catch (error) {
    throw new Error(`Harness DNS preflight could not resolve ${host}`, { cause: error });
  }

  if (addresses.length === 0 || addresses.some((address) => address !== '127.0.0.1')) {
    throw new Error(
      `Harness DNS preflight expected ${host} to resolve only to 127.0.0.1, received: ${addresses.join(', ') || 'no addresses'}`,
    );
  }

  console.log(`  ${host} -> ${addresses.join(', ')}`);
}
