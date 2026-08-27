import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(repositoryRoot, path), 'utf8');

test('should keep runtime state ignored and absent from tracked repository files', () => {
  const tracked = execFileSync('git', ['ls-files', '--', 'docker/admin-playground/runtime'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.equal(tracked.trim(), '');
  assert.match(read('docker/admin-playground/.gitignore'), /^runtime\/$/m);
});

test('should avoid broad Docker deletion and shell command execution', () => {
  const source = read('docker/admin-playground/scripts/admin-env.mjs');
  assert.doesNotMatch(source, /shell\s*:\s*true|docker\s+(?:system|volume)\s+prune|rm\s+-rf/i);
  assert.match(source, /\['postgres_data', 'redis_data'\]/);
});

test('should keep every non-public service free of host port mappings', () => {
  const compose = parse(read('docker/admin-playground/compose.yml'));
  for (const service of ['porta', 'postgres', 'redis']) {
    assert.equal(compose.services[service].ports, undefined);
  }
  assert.deepEqual(Object.keys(compose.volumes).sort(), ['postgres_data', 'redis_data']);
});

test('should preserve the developer-selected HTTPS port through nginx', () => {
  const nginx = readFileSync('docker/admin-playground/nginx.conf', 'utf8');
  assert.match(nginx, /proxy_set_header Host \$http_host;/u);
  assert.match(nginx, /proxy_set_header X-Forwarded-Host \$http_host;/u);
});

test('should pin Compose identity against environment overrides', () => {
  const rendered = JSON.parse(
    execFileSync(
      'docker',
      [
        'compose',
        '--project-name',
        'porta-admin-playground',
        '-f',
        'docker/admin-playground/compose.yml',
        'config',
        '--format',
        'json',
      ],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: { ...process.env, COMPOSE_PROJECT_NAME: 'unsafe-override' },
      },
    ),
  );
  assert.equal(rendered.name, 'porta-admin-playground');
});

test('should keep the packed journey on trusted TLS', () => {
  const journey = read('docker/admin-playground/tests/support/admin-cli-journey.mjs');
  assert.doesNotMatch(journey, /--insecure|ignoreHTTPSErrors|['"]--ignore-certificate-errors['"]/u);
  assert.match(journey, /NODE_USE_SYSTEM_CA/);
  assert.match(journey, /ignore-certificate-errors-spki-list=.*trustedSpki/);
});
