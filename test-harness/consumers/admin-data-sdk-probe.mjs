import { readFile } from 'node:fs/promises';

import { createPortaClient, PortaHttpError } from '@portaidentity/sdk';
import { createNodeTransport, createTokenAuth } from '@portaidentity/sdk/node';

const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const client = createPortaClient({
  transport: createNodeTransport({
    baseUrl: input.server,
    auth: createTokenAuth({ token: input.token }),
  }),
});

try {
  let body;
  if (input.surface === 'bulk-duplicate-rejection') {
    body = await client.bulk.userStatus(input.request);
  } else if (input.surface === 'import-dry-run') {
    body = await client.imports.provision(input.request);
  } else if (input.surface === 'export-users-json') {
    const response = await client.exports.download(input.request);
    body = JSON.parse(await response.raw.text());
    process.stdout.write(`${JSON.stringify({ status: response.status, body })}\n`);
    process.exit(0);
  } else {
    throw new Error('unsupported packed administrative-data SDK surface');
  }
  process.stdout.write(`${JSON.stringify({ status: 200, body })}\n`);
} catch (error) {
  if (error instanceof PortaHttpError) {
    process.stdout.write(`${JSON.stringify({ status: error.status, body: error.body })}\n`);
    process.exit(0);
  }
  throw error;
}
