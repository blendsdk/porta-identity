import { pathToFileURL } from 'node:url';

const [outcome, cliBinPath] = process.argv.slice(2);
if (cliBinPath === undefined) throw new Error('packed CLI probe requires a compiled bin path');

if (outcome === 'success') {
  process.argv = [process.execPath, cliBinPath, 'completion'];
} else if (outcome === 'failure') {
  process.argv = [process.execPath, cliBinPath, 'not-a-porta-command'];
} else {
  globalThis.fetch = () => new Promise(() => undefined);
  process.argv = [
    process.execPath,
    cliBinPath,
    'health',
    '--server',
    'https://porta-harness.ci.portaidentity.com',
  ];
}

await import(pathToFileURL(cliBinPath).href);
