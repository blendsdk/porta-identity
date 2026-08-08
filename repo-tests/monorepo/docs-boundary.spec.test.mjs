import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const movedTechnicalDocuments = [
  'architecture/api-design.md',
  'architecture/data-model.md',
  'architecture/infrastructure.md',
  'architecture/security.md',
  'architecture/system-overview.md',
  'decisions/index.md',
  'guides/deployment.md',
  'guides/development.md',
  'guides/getting-started.md',
  'guides/sdk-cli-migration.md',
  'index.md',
  'reference/configuration.md',
  'reference/integrations.md',
];

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
 * Reports whether a repository-relative path exists with the expected filesystem kind.
 * Missing paths return false so assertions can provide a precise contract failure.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @param {'directory' | 'file'} expectedKind Required filesystem kind.
 * @returns {boolean} Whether the required path exists with the expected kind.
 */
function isRepositoryPath(repositoryPath, expectedKind) {
  try {
    const stats = statSync(resolve(repositoryRoot, repositoryPath));
    return expectedKind === 'directory' ? stats.isDirectory() : stats.isFile();
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

/**
 * Recursively collects physical files below a repository directory.
 * Excluded directory names keep generated output and technical docs out of public-source scans.
 *
 * @param {string} repositoryPath Directory relative to the repository root.
 * @param {(name: string) => boolean} includeFile Determines which file names are retained.
 * @param {Set<string>} excludedDirectories Directory names that must not be traversed.
 * @returns {string[]} Repository-relative file paths.
 */
function findPhysicalFiles(repositoryPath, includeFile, excludedDirectories = new Set()) {
  const files = [];

  for (const entry of readdirSync(resolve(repositoryRoot, repositoryPath), {
    withFileTypes: true,
  })) {
    const entryPath = `${repositoryPath}/${entry.name}`;
    if (entry.isDirectory() && !excludedDirectories.has(entry.name)) {
      files.push(...findPhysicalFiles(entryPath, includeFile, excludedDirectories));
    } else if (entry.isFile() && includeFile(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

/**
 * Extracts inline and reference-style Markdown link targets without treating ordinary prose as links.
 *
 * @param {string} markdown Markdown source text.
 * @returns {string[]} Link targets found in the document.
 */
function extractMarkdownLinkTargets(markdown) {
  const inlineTargets = [
    ...markdown.matchAll(/!?\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+[^)]*)?\)/g),
  ].map((match) => match[1]);
  const referenceTargets = [...markdown.matchAll(/^\s*\[[^\]]+\]:\s*<?([^\s>]+)>?/gm)].map(
    (match) => match[1],
  );

  return [...inlineTargets, ...referenceTargets];
}

/**
 * Runs the existing local documentation build and captures its output for actionable failures.
 *
 * @param {string} command Executable available on the current PATH.
 * @param {string[]} arguments Command arguments.
 */
function runRepositoryCommand(command, arguments_) {
  try {
    execFileSync(command, arguments_, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const output = [error?.stdout, error?.stderr].filter(Boolean).join('\n');
    throw new Error(`${command} ${arguments_.join(' ')} failed\n${output}`, { cause: error });
  }
}

// Technical architecture documents move as one preserved set outside the public VitePress source.
test('should keep the moved technical document set only under top-level techdocs', () => {
  assert.equal(
    isRepositoryPath('docs/implementation-details', 'directory'),
    false,
    'docs/implementation-details/ must be absent from the public documentation source',
  );
  assert.equal(
    isRepositoryPath('techdocs', 'directory'),
    true,
    'top-level techdocs/ must contain the moved technical documentation',
  );

  for (const technicalDocument of movedTechnicalDocuments) {
    assert.equal(
      isRepositoryPath(`techdocs/${technicalDocument}`, 'file'),
      true,
      `techdocs/${technicalDocument} must be preserved from the moved technical set`,
    );
  }
});

// Public navigation, sidebars, and Markdown links never expose the separate technical documentation tree.
test('should keep technical documentation out of public navigation and links', () => {
  const vitePressConfigPath = 'docs/.vitepress/config.ts';
  const vitePressConfig = readRepositoryFile(vitePressConfigPath);
  assert.doesNotMatch(
    vitePressConfig,
    /(['"`])\/?(?:implementation-details|techdocs)(?:\/[^'"`]*)?\1/i,
    `${vitePressConfigPath} must not define a technical-doc navigation or sidebar route`,
  );

  const publicMarkdownFiles = findPhysicalFiles(
    'docs',
    (name) => name.endsWith('.md'),
    new Set(['.vitepress', 'implementation-details']),
  );
  for (const markdownPath of publicMarkdownFiles) {
    const markdown = readRepositoryFile(markdownPath);
    const technicalTargets = extractMarkdownLinkTargets(markdown).filter((target) =>
      /(?:^|\/)(?:implementation-details|techdocs)(?:\/|$)/i.test(target),
    );
    assert.deepEqual(
      technicalTargets,
      [],
      `${markdownPath} must not link public readers to implementation-details or techdocs`,
    );
    assert.doesNotMatch(
      markdown,
      /future migration strategy|^## Implementation Files\s*$|^src\//im,
      `${markdownPath} must not publish maintainer migration plans or source inventories`,
    );
  }

  assert.equal(
    isRepositoryPath('docs/guide/sdk-cli-migration.md', 'file'),
    false,
    'the SDK-to-CLI implementation plan must not remain in the public documentation source',
  );
});

// Every literal public navigation route resolves to a Markdown page in the VitePress source.
test('should keep VitePress navigation and sidebar routes resolvable', () => {
  const configPath = 'docs/.vitepress/config.ts';
  const config = readRepositoryFile(configPath);
  const routes = [...config.matchAll(/\blink:\s*['"](\/[^'"]*)['"]/g)].map(
    (match) => match[1].split('#')[0],
  );

  for (const route of routes) {
    const routePath = route === '/' ? 'index' : route.replace(/^\//, '').replace(/\/$/, '/index');
    assert.equal(
      isRepositoryPath(`docs/${routePath}.md`, 'file'),
      true,
      `${configPath} route ${route} must resolve to docs/${routePath}.md`,
    );
  }
});

// Public package examples use only retained package identities and current monorepo package paths.
test('should document only the retained public packages and current package paths', () => {
  const publicMarkdownFiles = findPhysicalFiles(
    'docs',
    (name) => name.endsWith('.md'),
    new Set(['.vitepress', 'implementation-details']),
  );
  const publicMarkdown = publicMarkdownFiles
    .map((filePath) => readRepositoryFile(filePath))
    .join('\n');
  const approvedPackageNames = new Set(['server', 'sdk', 'cli']);
  const referencedPackageNames = [...publicMarkdown.matchAll(/@portaidentity\/([a-z0-9-]+)/gi)].map(
    (match) => match[1],
  );
  const referencedPackagePaths = [...publicMarkdown.matchAll(/\bpackages\/([a-z0-9-]+)\b/gi)].map(
    (match) => match[1],
  );

  for (const packageName of referencedPackageNames) {
    assert.ok(
      approvedPackageNames.has(packageName),
      `public docs must not reference unapproved package @portaidentity/${packageName}`,
    );
  }
  for (const packageName of approvedPackageNames) {
    assert.match(
      publicMarkdown,
      new RegExp(`@portaidentity/${packageName}\\b`),
      `public docs must include the approved @portaidentity/${packageName} package`,
    );
  }
  for (const packagePath of referencedPackagePaths) {
    assert.ok(
      approvedPackageNames.has(packagePath),
      `public docs must not reference unapproved workspace path packages/${packagePath}`,
    );
  }
});

// Existing porta gui guidance remains factual and does not promise the deferred terminal interface.
test('should retain porta gui documentation without inventing future TUI behavior', () => {
  const publicMarkdownFiles = findPhysicalFiles(
    'docs',
    (name) => name.endsWith('.md'),
    new Set(['.vitepress', 'implementation-details']),
  );
  const publicMarkdown = publicMarkdownFiles
    .map((filePath) => readRepositoryFile(filePath))
    .join('\n');
  const compatibilityGuide = readRepositoryFile('docs/guide/admin-gui.md');
  const otherPublicMarkdown = publicMarkdownFiles
    .filter((filePath) => filePath !== 'docs/guide/admin-gui.md')
    .map((filePath) => readRepositoryFile(filePath))
    .join('\n');

  assert.match(
    publicMarkdown,
    /\bporta\s+gui\b/i,
    'public docs must retain guidance for the existing porta gui command',
  );
  assert.doesNotMatch(
    publicMarkdown,
    /\bTUI\b|terminal[- ](?:based[- ]?)?(?:user interface|UI)\b|\bjsvision\b/i,
    'public docs must not invent behavior for the deferred terminal admin interface',
  );
  assert.match(
    compatibilityGuide,
    /former Admin GUI source workspace[\s\S]*optional GUI is unavailable/i,
    'the compatibility guide must explain that the removed GUI workspace may be unavailable',
  );
  assert.doesNotMatch(
    otherPublicMarkdown,
    /\bAdmin GUI\b|@portaidentity\/admin-gui|packages\/porta-admin-gui/i,
    'public pages outside the compatibility guide must not present the removed Admin GUI as current',
  );
});

// The public VitePress build remains local-only and emits no route for technical documentation.
test('should build only public documentation without publishing technical routes', () => {
  const rootManifest = JSON.parse(readRepositoryFile('package.json'));
  const docsBuildCommand = rootManifest.scripts?.['docs:build'] ?? '';

  assert.match(
    docsBuildCommand,
    /\bvitepress\s+build\s+docs\b/,
    'docs:build must build docs/ with VitePress',
  );
  assert.doesNotMatch(
    docsBuildCommand,
    /\b(?:deploy|publish|gh-pages)\b|git\s+push/i,
    'docs:build must not publish or deploy documentation',
  );

  runRepositoryCommand('yarn', ['docs:build']);

  const outputRoot = 'docs/.vitepress/dist';
  assert.equal(
    isRepositoryPath(`${outputRoot}/index.html`, 'file'),
    true,
    `${outputRoot}/index.html must be emitted`,
  );
  const outputFiles = findPhysicalFiles(outputRoot, () => true);
  const technicalOutputPaths = outputFiles.filter((filePath) =>
    /(?:^|\/)(?:implementation-details|techdocs)(?:\/|$)/i.test(relative(outputRoot, filePath)),
  );
  assert.deepEqual(
    technicalOutputPaths,
    [],
    'the public VitePress output must not contain implementation-details or techdocs routes',
  );
});
