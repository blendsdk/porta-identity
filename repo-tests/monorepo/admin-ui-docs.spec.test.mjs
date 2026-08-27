import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');

/**
 * Reads a repository file as UTF-8 text.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {string} File contents.
 */
function readRepositoryFile(repositoryPath) {
  return readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8');
}

/**
 * Recursively collects Markdown files beneath a repository directory.
 *
 * @param {string} repositoryPath Directory relative to the repository root.
 * @returns {string[]} Repository-relative Markdown paths.
 */
function findMarkdownFiles(repositoryPath) {
  const files = [];

  for (const entry of readdirSync(resolve(repositoryRoot, repositoryPath), {
    withFileTypes: true,
  })) {
    const entryPath = `${repositoryPath}/${entry.name}`;

    if (entry.isDirectory()) {
      files.push(...findMarkdownFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entryPath);
    }
  }

  return files;
}

test('should use generic HTTPS guidance without playground details when public CLI docs are read', () => {
  const publicPaths = ['packages/cli/README.md', ...findMarkdownFiles('docs/cli')];
  const publicDocumentation = publicPaths.map(readRepositoryFile).join('\n');

  assert.equal(
    /\bporta admin\b/.test(publicDocumentation),
    true,
    'public docs must list porta admin',
  );
  assert.equal(
    /porta admin[^\n]*--server https:\/\/[a-z0-9.-]*example\.(?:com|net|org)/i.test(
      publicDocumentation,
    ),
    true,
    'public docs must show a generic operator-owned HTTPS server',
  );
  assert.equal(
    /\bporta gui\b|ci\.portaidentity\.com|porta-admin-playground|admin@playground\.porta\.test|docker\/admin-playground|\bmkcert\b/i.test(
      publicDocumentation,
    ),
    false,
    'public CLI docs must omit the retired command and maintainer-only playground details',
  );
});

test('should link exact playground guidance when technical docs are read', () => {
  const technicalPaths = findMarkdownFiles('techdocs');
  const playgroundGuides = technicalPaths.filter((repositoryPath) => {
    const contents = readRepositoryFile(repositoryPath);
    return (
      contents.includes('porta-admin-playground.ci.portaidentity.com') &&
      contents.includes('yarn admin:env')
    );
  });

  assert.equal(
    playgroundGuides.length,
    1,
    'techdocs must contain one focused admin playground guide',
  );

  const guidePath = playgroundGuides[0];
  const guide = readRepositoryFile(guidePath);

  for (const requiredPattern of [
    /porta-admin-playground\.ci\.portaidentity\.com/i,
    /yarn admin:env up/,
    /yarn admin:env stop/,
    /yarn admin:env reset/,
    /yarn admin:env status/,
    /MailHog/i,
    /reset porta-admin-playground/,
    /non-production|not for production/i,
  ]) {
    assert.equal(
      requiredPattern.test(guide),
      true,
      `${guidePath} must contain guidance matched by ${requiredPattern}`,
    );
  }

  const technicalIndexes = [
    'techdocs/index.md',
    'techdocs/guides/development.md',
    'techdocs/architecture/infrastructure.md',
  ]
    .map(readRepositoryFile)
    .join('\n');
  assert.equal(
    technicalIndexes.includes(basename(guidePath)),
    true,
    'the focused playground guide must be linked from technical documentation',
  );
});
