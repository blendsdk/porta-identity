import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const portaHost = 'porta-harness.ci.portaidentity.com';
const appHost = 'app-harness.ci.portaidentity.com';

/**
 * Reads a repository file as UTF-8 text.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {string} File contents.
 */
function readRepositoryFile(repositoryPath) {
  return readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8');
}

// The black-box harness must use public loopback DNS instead of modifying a runner's hosts file.
test('should use the reserved CI loopback names throughout the OIDC harness', () => {
  const harnessFiles = [
    'test-harness/docker-compose.yml',
    'test-harness/nginx.conf',
    'test-harness/playwright.config.ts',
    'test-harness/scripts/seed.ts',
    'test-harness/scripts/start.sh',
    'test-harness/spa-server.ts',
    'test-harness/tests/bff-magic-link.spec.ts',
    'test-harness/tests/bff-refresh-logout.spec.ts',
    'test-harness/tests/helpers.ts',
    'test-harness/tests/spa-magic-link.spec.ts',
    'test-harness/tests/spa-refresh-logout.spec.ts',
  ];
  const activeHarness = harnessFiles.map(readRepositoryFile).join('\n');

  assert.match(activeHarness, new RegExp(portaHost.replaceAll('.', '\\.'), 'g'));
  assert.match(activeHarness, new RegExp(appHost.replaceAll('.', '\\.'), 'g'));
  assert.doesNotMatch(activeHarness, /\b(?:porta\.local|porta\.test|app\.test)\b/);
});

// DNS drift must fail before the harness starts containers or launches browsers.
test('should verify both harness names resolve only to IPv4 loopback before startup', () => {
  const startScript = readRepositoryFile('test-harness/scripts/start.sh');
  const preflightScript = readRepositoryFile('test-harness/scripts/check-loopback-dns.mjs');
  const preflightInvocation = 'node "$PROJECT_ROOT/test-harness/scripts/check-loopback-dns.mjs"';

  assert.ok(startScript.includes(preflightInvocation));
  assert.ok(
    startScript.indexOf(preflightInvocation) < startScript.indexOf('docker compose'),
    'DNS preflight must run before Docker Compose starts the harness',
  );
  assert.match(preflightScript, /resolve4/);
  assert.match(preflightScript, new RegExp(portaHost.replaceAll('.', '\\.'), 'g'));
  assert.match(preflightScript, new RegExp(appHost.replaceAll('.', '\\.'), 'g'));
  assert.match(preflightScript, /address !== '127\.0\.0\.1'/);
});

// The generated test certificate must name both browser-visible harness hosts.
test('should generate a TLS certificate for both CI loopback names', () => {
  const startScript = readRepositoryFile('test-harness/scripts/start.sh');

  assert.match(startScript, new RegExp(`DNS:${portaHost.replaceAll('.', '\\.')}`));
  assert.match(startScript, new RegExp(`DNS:${appHost.replaceAll('.', '\\.')}`));
});
