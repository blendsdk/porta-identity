import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');

/** Tracked reverse-proxy configurations that terminate TLS for Porta. */
const proxyFiles = ['docker/nginx-dev.conf', 'docker/admin-playground/nginx.conf'];

/** Deployment documentation that publishes the recommended production proxy example. */
const documentationFiles = ['docs/guide/deployment.md', 'techdocs/guides/deployment.md'];

/** Read one tracked file from the repository. */
function readRepositoryFile(repositoryPath) {
  return readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8');
}

/** Remove comments so a commented example cannot satisfy an executable assertion. */
function executableConfiguration(source) {
  return source.replace(/#[^\n]*/g, '');
}

/** Extract every ```nginx fenced example from a Markdown document. */
function nginxExamples(markdown) {
  return [...markdown.matchAll(/```nginx\s*\n(?<body>[\s\S]*?)```/g)].map(
    (match) => match.groups?.body ?? '',
  );
}

// A reverse proxy that emits its own product version fingerprints the deployment.
// The production ingress was already fixed; the development and playground proxies
// and the published deployment examples must not regress that property.
for (const repositoryPath of proxyFiles) {
  test(`should suppress version tokens in ${repositoryPath}`, () => {
    const configuration = executableConfiguration(readRepositoryFile(repositoryPath));
    assert.match(
      configuration,
      /server_tokens\s+off\s*;/,
      `${repositoryPath} must set server_tokens off`,
    );
  });
}

for (const repositoryPath of documentationFiles) {
  test(`should suppress version tokens in the nginx example in ${repositoryPath}`, () => {
    const examples = nginxExamples(readRepositoryFile(repositoryPath));
    assert.ok(examples.length > 0, `${repositoryPath} must publish an nginx example`);
    for (const [index, example] of examples.entries()) {
      assert.match(
        example,
        /server_tokens\s+off\s*;/,
        `${repositoryPath} nginx example ${index + 1} must set server_tokens off`,
      );
    }
  });
}
