import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(
  await readFile(
    new URL('./node_modules/@portaidentity/sdk/package.json', import.meta.url),
    'utf8',
  ),
);
const exportNames = Object.keys(manifest.exports ?? {});
const observations = [];
for (const exportName of exportNames) {
  const specifier =
    exportName === '.' ? '@portaidentity/sdk' : `@portaidentity/sdk${exportName.slice(1)}`;
  await import(specifier);
  observations.push({ exportName, url: import.meta.resolve(specifier) });
}
process.stdout.write(`${JSON.stringify(observations)}\n`);
