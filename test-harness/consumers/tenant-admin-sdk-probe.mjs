import { readFile } from 'node:fs/promises';

import { createPortaClient, PortaHttpError } from '@portaidentity/sdk';
import { createNodeTransport, createTokenAuth } from '@portaidentity/sdk/node';

const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const transport = createNodeTransport({
  baseUrl: input.server,
  auth: createTokenAuth(input.token),
});
const client = createPortaClient({ transport });

try {
  let targetIds = [];
  if (input.operation === 'list') {
    const result = await client.users.list(input.organizationId, { pageSize: 100 });
    targetIds = result.data.map((user) => user.id);
  } else if (input.operation === 'read') {
    const result = await client.users.get(input.organizationId, input.userId);
    targetIds = [result.data.id];
  } else {
    const updated = await client.users.update(input.organizationId, input.userId, {
      givenName: input.givenName,
    });
    targetIds = [updated.id];
  }
  process.stdout.write(`${JSON.stringify({ status: 200, targetIds })}\n`);
} catch (error) {
  if (error instanceof PortaHttpError) {
    process.stdout.write(`${JSON.stringify({ status: error.status, targetIds: [] })}\n`);
  } else {
    throw error;
  }
}
