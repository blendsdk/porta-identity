import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, relative, resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');

/**
 * Recursively lists Markdown files below a directory.
 *
 * @param {string} directory Absolute directory path.
 * @returns {string[]} Absolute Markdown file paths in stable order.
 */
function findMarkdownFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...findMarkdownFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

/**
 * Converts a Markdown heading to the anchor form used by repository renderers.
 * Punctuation is removed before whitespace becomes hyphens, preserving repeated
 * hyphens such as the anchor generated from "Redis + PostgreSQL".
 *
 * @param {string} heading Visible Markdown heading text.
 * @returns {string} Anchor without the leading hash.
 */
function headingAnchor(heading) {
  return heading
    .replace(/\s+\{#[a-z0-9_-]+\}\s*$/i, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[`*_~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

/**
 * Collects explicit and heading-derived anchors from a Markdown document.
 * Duplicate headings receive the numeric suffix used by common renderers.
 *
 * @param {string} markdown Markdown source.
 * @returns {Set<string>} Available anchors without leading hashes.
 */
function collectAnchors(markdown) {
  const anchors = new Set();
  const occurrences = new Map();

  for (const line of markdown.split('\n')) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/)?.[1];
    if (!heading) continue;

    const explicitAnchor = heading.match(/\s+\{#([a-z0-9_-]+)\}\s*$/i)?.[1];
    if (explicitAnchor) anchors.add(explicitAnchor);

    const baseAnchor = headingAnchor(heading);
    const occurrence = occurrences.get(baseAnchor) ?? 0;
    anchors.add(occurrence === 0 ? baseAnchor : `${baseAnchor}-${occurrence}`);
    occurrences.set(baseAnchor, occurrence + 1);
  }

  return anchors;
}

/**
 * Extracts local Markdown links with their one-based source line numbers.
 * Remote URLs and non-navigation schemes are intentionally outside this local
 * repository integrity check.
 *
 * @param {string} markdown Markdown source.
 * @returns {{ line: number, target: string }[]} Local link records.
 */
function extractLocalLinks(markdown) {
  const links = [];
  const pattern = /!?\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+[^)]*)?\)/g;

  for (const match of markdown.matchAll(pattern)) {
    const target = match[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) continue;

    const line = markdown.slice(0, match.index).split('\n').length;
    links.push({ line, target });
  }

  return links;
}

/**
 * Resolves a local Markdown target, including directory index files and
 * extensionless Markdown links.
 *
 * @param {string} sourceFile Absolute source Markdown path.
 * @param {string} pathPart Link path before any anchor.
 * @returns {string} Absolute target path.
 */
function resolveMarkdownTarget(sourceFile, pathPart) {
  let targetPath = resolve(dirname(sourceFile), decodeURIComponent(pathPart || '.'));

  try {
    if (statSync(targetPath).isDirectory()) targetPath = resolve(targetPath, 'index.md');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  if (!extname(targetPath)) {
    try {
      statSync(`${targetPath}.md`);
      targetPath = `${targetPath}.md`;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  return targetPath;
}

/**
 * Reports broken local files and anchors below a technical-document root.
 * Diagnostics use paths relative to that root so failures are actionable in
 * local runs and CI regardless of checkout location.
 *
 * @param {string} technicalRoot Absolute technical-document root.
 * @returns {string[]} Stable human-readable diagnostics.
 */
function inspectTechnicalLinks(technicalRoot) {
  const diagnostics = [];

  for (const sourceFile of findMarkdownFiles(technicalRoot)) {
    const markdown = readFileSync(sourceFile, 'utf8');
    for (const { line, target } of extractLocalLinks(markdown)) {
      const [pathPart, rawAnchor] = target.split('#', 2);
      const targetFile = resolveMarkdownTarget(sourceFile, pathPart);
      const sourceLabel = relative(technicalRoot, sourceFile);

      let targetMarkdown;
      try {
        targetMarkdown = readFileSync(targetFile, 'utf8');
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        diagnostics.push(`${sourceLabel}:${line}: missing local target ${target}`);
        continue;
      }

      if (rawAnchor && !collectAnchors(targetMarkdown).has(decodeURIComponent(rawAnchor))) {
        diagnostics.push(`${sourceLabel}:${line}: missing anchor #${rawAnchor} in ${target}`);
      }
    }
  }

  return diagnostics;
}

test('should resolve every local technical-document file and anchor', () => {
  assert.deepEqual(inspectTechnicalLinks(resolve(repositoryRoot, 'techdocs')), []);
});

test('should report the source line and target when a local document is missing', () => {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'porta-techdocs-missing-file-'));
  try {
    writeFileSync(resolve(fixtureRoot, 'guide.md'), 'See [missing](./missing.md).\n');
    assert.deepEqual(inspectTechnicalLinks(fixtureRoot), [
      'guide.md:1: missing local target ./missing.md',
    ]);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('should report a missing anchor in an existing document', () => {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'porta-techdocs-missing-anchor-'));
  try {
    writeFileSync(resolve(fixtureRoot, 'index.md'), '[Details](details.md#missing-section)\n');
    writeFileSync(resolve(fixtureRoot, 'details.md'), '# Present Section\n');
    assert.deepEqual(inspectTechnicalLinks(fixtureRoot), [
      'index.md:1: missing anchor #missing-section in details.md#missing-section',
    ]);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
