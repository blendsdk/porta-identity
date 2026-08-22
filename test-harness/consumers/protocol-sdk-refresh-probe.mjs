import { readFile } from 'node:fs/promises';

import { createCliAuth } from '@portaidentity/sdk/node';

const [inputPath] = process.argv.slice(2);
if (inputPath === undefined) process.exit(30);

const input = JSON.parse(await readFile(inputPath, 'utf8'));
const credentials = JSON.parse(await readFile(input.credentialsPath, 'utf8'));
const auth = createCliAuth({ credentialsPath: input.credentialsPath });
const refreshedAccess = await auth.refreshToken();
const observer = await fetch(input.observerUrl, {
  headers: { Authorization: `Bearer ${refreshedAccess}` },
});

process.stdout.write(
  JSON.stringify({
    sdkEntry: '@portaidentity/sdk/node',
    refreshedAccessTokenChanged: refreshedAccess !== credentials.accessToken,
    refreshedAccessTokenAcceptedByRawObserver: observer.status === 200,
  }),
);
