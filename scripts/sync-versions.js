#!/usr/bin/env node
/**
 * Version sync script — stamps a single version across all packages.
 *
 * Called by semantic-release during the prepare step:
 *   node scripts/sync-versions.js <version>
 *
 * Updates:
 *   - package.json (root)
 *   - packages/porta-sdk/package.json
 *   - packages/porta-cli/package.json
 *   - packages/porta-admin-gui/package.json
 *   - packages/porta-sdk/src/version.ts  (SDK_VERSION constant)
 *   - packages/porta-cli/src/commands/version.ts  (CLI_VERSION constant)
 *   - packages/porta-admin-gui/src/version.ts  (GUI_VERSION constant)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/sync-versions.js <version>');
  process.exit(1);
}

console.log(`📦 Syncing version → ${version}`);

// ---------------------------------------------------------------------------
// 1. Update package.json files
// ---------------------------------------------------------------------------

const packageJsonPaths = [
  'package.json',
  'packages/porta-sdk/package.json',
  'packages/porta-cli/package.json',
  'packages/porta-admin-gui/package.json',
];

for (const relPath of packageJsonPaths) {
  const absPath = resolve(ROOT, relPath);
  const pkg = JSON.parse(readFileSync(absPath, 'utf-8'));
  pkg.version = version;
  writeFileSync(absPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`  ✅ ${relPath} → ${version}`);
}

// ---------------------------------------------------------------------------
// 2. Update version constants in TypeScript source
// ---------------------------------------------------------------------------

const versionFiles = [
  {
    path: 'packages/porta-sdk/src/version.ts',
    pattern: /export const SDK_VERSION = '[^']+'/,
    replacement: `export const SDK_VERSION = '${version}'`,
  },
  {
    path: 'packages/porta-cli/src/commands/version.ts',
    pattern: /export const CLI_VERSION = '[^']+'/,
    replacement: `export const CLI_VERSION = '${version}'`,
  },
  {
    path: 'packages/porta-admin-gui/src/version.ts',
    pattern: /export const GUI_VERSION = '[^']+'/,
    replacement: `export const GUI_VERSION = '${version}'`,
  },
];

for (const { path: relPath, pattern, replacement } of versionFiles) {
  const absPath = resolve(ROOT, relPath);
  const content = readFileSync(absPath, 'utf-8');
  const updated = content.replace(pattern, replacement);

  if (content === updated) {
    console.error(`  ⚠️  No match found in ${relPath} — version not updated`);
  } else {
    writeFileSync(absPath, updated);
    console.log(`  ✅ ${relPath} → ${version}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Update inter-package @portaidentity/* dependency versions
// ---------------------------------------------------------------------------

const workspacePackages = [
  'packages/porta-cli/package.json',
  'packages/porta-admin-gui/package.json',
];

for (const relPath of workspacePackages) {
  const absPath = resolve(ROOT, relPath);
  const pkg = JSON.parse(readFileSync(absPath, 'utf-8'));
  let updated = false;

  for (const depField of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (!pkg[depField]) continue;
    for (const [name, currentVer] of Object.entries(pkg[depField])) {
      if (name.startsWith('@portaidentity/') && currentVer !== version) {
        pkg[depField][name] = version;
        updated = true;
        console.log(`  🔗 ${relPath}: ${name} ${currentVer} → ${version}`);
      }
    }
  }

  if (updated) {
    writeFileSync(absPath, JSON.stringify(pkg, null, 2) + '\n');
  }
}

console.log(`\n✅ All versions synced to ${version}`);
