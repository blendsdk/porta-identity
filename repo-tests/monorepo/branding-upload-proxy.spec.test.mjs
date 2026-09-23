import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const proxyFiles = ['docker/nginx-dev.conf', 'docker/admin-playground/nginx.conf'];

/** Read one bundled proxy configuration from the repository. */
function readProxy(repositoryPath) {
  return readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8');
}

/** Remove comments so examples cannot satisfy executable configuration assertions. */
function executableConfiguration(source) {
  return source.replace(/#[^\n]*/g, '');
}

/** Return the body of the one location carrying the expanded upload allowance. */
function brandingUploadLocation(repositoryPath, source) {
  const configuration = executableConfiguration(source);
  const locations = [
    ...configuration.matchAll(/location\s+(?<selector>[^\n{]+)\s*\{(?<body>[^{}]*)\}/g),
  ].filter((match) => /client_max_body_size\s+3m\s*;/.test(match.groups?.body ?? ''));

  assert.equal(
    locations.length,
    1,
    `${repositoryPath} must contain one location with the 3 MiB upload allowance`,
  );
  const location = locations[0];
  assert.match(
    (location.groups?.selector ?? '').trim(),
    /^~\s+\^\/api\/admin\/organizations\/\[\^\/\]\+\/branding\/\(\?:logo\|favicon\)\$$/,
    `${repositoryPath} must anchor the allowance to exact logo and favicon asset paths`,
  );
  return location.groups?.body ?? '';
}

// The expanded body limit is path-local; ordinary proxy traffic retains the established default.
for (const repositoryPath of proxyFiles) {
  test(`should bound the branding upload allowance when inspecting ${repositoryPath}`, () => {
    const source = readProxy(repositoryPath);
    const configuration = executableConfiguration(source);
    const locationBody = brandingUploadLocation(repositoryPath, source);

    assert.match(
      locationBody,
      /client_max_body_size\s+3m\s*;/,
      `${repositoryPath} must admit the bounded base64 logo request`,
    );
    assert.equal(
      (configuration.match(/client_max_body_size\s+3m\s*;/g) ?? []).length,
      1,
      `${repositoryPath} must not broaden the 3 MiB allowance to another location`,
    );

    const defaultLocation = configuration.match(/location\s+\/\s*\{(?<body>[^{}]*)\}/);
    assert.ok(defaultLocation, `${repositoryPath} must retain its ordinary default location`);
    assert.doesNotMatch(
      defaultLocation.groups?.body ?? '',
      /client_max_body_size/,
      `${repositoryPath} default location must retain the existing request-size behavior`,
    );
  });
}
