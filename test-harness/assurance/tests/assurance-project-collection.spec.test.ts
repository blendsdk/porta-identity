import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import test from 'node:test';

import type { AssuranceProjectDefinition } from '../../fixtures/fixture-assurance.js';
import { loadFixtureAssuranceSurface } from '../../fixtures/fixture-assurance.js';
import { uniqueSorted } from './fixture-spec-helpers.js';

const expectedProjects = [
  { id: 'spa', pattern: 'spa-.*\\.spec\\.ts' },
  { id: 'bff', pattern: 'bff-.*\\.spec\\.ts' },
  { id: 'protocol', pattern: 'protocol\\/.+\\.spec\\.test\\.ts' },
  { id: 'security', pattern: 'security\\/.+\\.spec\\.test\\.ts' },
  { id: 'compatibility', pattern: 'compatibility\\/.+\\.spec\\.test\\.ts' },
] as const;
const harnessRoot = resolve(import.meta.dirname, '../..');

/** Returns which exact project patterns own one repository-relative harness test file. */
function matchingProjectIds(
  file: string,
  projects: readonly AssuranceProjectDefinition[],
): readonly AssuranceProjectDefinition['id'][] {
  const relativeTestPath = file.replace(/^tests\//u, '');
  return projects
    .filter((project) => new RegExp(project.pattern, 'u').test(relativeTestPath))
    .map((project) => project.id);
}

/** Lists every harness test file owned by at least one required project pattern. */
function projectTestFiles(): readonly string[] {
  const pending = [resolve(harnessRoot, 'tests')];
  const matches: string[] = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (directory === undefined) break;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absoluteEntry = resolve(directory, entry.name);
      if (entry.isDirectory()) pending.push(absoluteEntry);
      if (entry.isFile()) {
        const harnessPath = relative(harnessRoot, absoluteEntry).split(sep).join('/');
        if (/\.spec(?:\.test)?\.ts$/u.test(harnessPath)) matches.push(harnessPath);
      }
    }
  }
  return matches.sort();
}

// Collection has exactly five projects with exact patterns and one deterministic worker each.
test('should expose the exact deterministic five-project collection', async () => {
  const { projects } = await loadFixtureAssuranceSurface();

  assert.deepEqual(
    projects.map(({ id, pattern }) => ({ id, pattern })),
    expectedProjects,
  );
  assert.equal(projects.length, expectedProjects.length);
  assert.ok(projects.every((project) => project.workers === 1));
  assert.ok(projects.every((project) => project.files.length > 0));
});

// Every collected file belongs to exactly one project and appears exactly once in the complete
// collection, preventing silent duplication or gaps between Playwright and Node projects.
test('should assign every collected test file to exactly one project', async () => {
  const { projects } = await loadFixtureAssuranceSurface();
  const collectedFiles = projects.flatMap((project) =>
    project.files.map((file) => ({ file, projectId: project.id })),
  );

  assert.equal(uniqueSorted(collectedFiles.map(({ file }) => file)).length, collectedFiles.length);
  assert.deepEqual(uniqueSorted(collectedFiles.map(({ file }) => file)), projectTestFiles());
  for (const { file, projectId } of collectedFiles) {
    assert.deepEqual(matchingProjectIds(file, projects), [projectId], file);
  }
});
