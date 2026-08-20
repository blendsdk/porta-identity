import { readFile } from 'node:fs/promises';

import { createPortaClient } from '@portaidentity/sdk';
import { createNodeTransport, createTokenAuth } from '@portaidentity/sdk/node';

const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const client = createPortaClient({
  transport: createNodeTransport({
    baseUrl: input.server,
    auth: createTokenAuth({ token: input.token }),
  }),
});

let result;
if (input.surface === 'tenant-users-page') {
  result = await client.users.list(input.organizationId, input.query);
} else if (input.surface === 'signing-key-list') {
  result = { data: await client.keys.list() };
} else if (input.surface === 'tenant-session-page') {
  result = await client.sessions.list(input.query);
} else {
  throw new Error('unsupported packed P1 SDK surface');
}
process.stdout.write(`${JSON.stringify(result)}\n`);
