import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { parse } from 'yaml';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const workflowPath = '.github/workflows/build-and-test.yml';

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
 * Reads a repository JSON file and reports its path when parsing fails.
 *
 * @param {string} repositoryPath Path relative to the repository root.
 * @returns {Record<string, any>} Parsed JSON object.
 */
function readRepositoryJson(repositoryPath) {
  try {
    return JSON.parse(readRepositoryFile(repositoryPath));
  } catch (error) {
    throw new Error(`Expected ${repositoryPath} to contain valid JSON`, { cause: error });
  }
}

/**
 * Parses the Build and Test workflow and requires its basic GitHub Actions shape.
 *
 * @returns {Record<string, any>} Parsed workflow definition.
 */
function readBuildAndTestWorkflow() {
  let workflow;

  try {
    workflow = parse(readRepositoryFile(workflowPath));
  } catch (error) {
    throw new Error(`Expected ${workflowPath} to contain valid workflow YAML`, { cause: error });
  }

  assert.ok(
    workflow && typeof workflow === 'object',
    `${workflowPath} must contain a workflow object`,
  );
  assert.ok(workflow.jobs && typeof workflow.jobs === 'object', `${workflowPath} must define jobs`);
  return workflow;
}

/**
 * Returns all executable run steps together with their owning job and position.
 *
 * @param {Record<string, any>} workflow Parsed GitHub Actions workflow.
 * @returns {Array<{jobName: string, stepIndex: number, step: Record<string, any>, command: string}>} Run steps.
 */
function getRunSteps(workflow) {
  return Object.entries(workflow.jobs).flatMap(([jobName, job]) =>
    (job.steps ?? []).flatMap((step, stepIndex) =>
      typeof step.run === 'string' ? [{ jobName, stepIndex, step, command: step.run }] : [],
    ),
  );
}

/**
 * Reports whether a branch filter includes a named branch or an all-branches glob.
 *
 * @param {unknown} branchFilter GitHub Actions branch filter.
 * @param {string} branchName Branch that must be covered.
 * @returns {boolean} Whether the filter covers the branch.
 */
function includesBranch(branchFilter, branchName) {
  const branches = Array.isArray(branchFilter) ? branchFilter : [branchFilter];
  return branches.some((branch) => branch === branchName || branch === '*' || branch === '**');
}

/**
 * Requires every job that executes Yarn commands to install the root frozen lockfile first.
 *
 * @param {Record<string, any>} workflow Parsed GitHub Actions workflow.
 */
function assertFrozenInstallBeforeYarnCommands(workflow) {
  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    const runSteps = (job.steps ?? [])
      .map((step, stepIndex) => ({ step, stepIndex, command: step.run }))
      .filter(({ command }) => typeof command === 'string');
    const yarnSteps = runSteps.filter(({ command }) => /(?:^|\s)yarn(?:\s|$)/m.test(command));

    if (yarnSteps.length === 0) {
      continue;
    }

    const installStep = yarnSteps.find(({ command }) =>
      /(?:^|\s)yarn\s+install\s+--frozen-lockfile(?:\s|$)/m.test(command),
    );
    assert.ok(
      installStep,
      `${workflowPath} job ${jobName} must install with yarn install --frozen-lockfile`,
    );
    assert.equal(
      installStep.step['working-directory'],
      undefined,
      `${workflowPath} job ${jobName} frozen install must run from the repository root`,
    );

    const firstNonInstallYarnStep = yarnSteps.find(
      ({ command }) => !/(?:^|\s)yarn\s+install\s+--frozen-lockfile(?:\s|$)/m.test(command),
    );
    if (firstNonInstallYarnStep) {
      assert.ok(
        installStep.stepIndex < firstNonInstallYarnStep.stepIndex,
        `${workflowPath} job ${jobName} must install before other Yarn commands`,
      );
    }
  }
}

// Branch CI covers migration pushes and pull requests without requiring a production-branch action.
test('should run Build and Test for migration-branch pushes and pull requests', () => {
  const workflow = readBuildAndTestWorkflow();
  const triggers = workflow.on;

  assert.equal(
    workflow.name,
    'Build and Test',
    `${workflowPath} must remain the Build and Test workflow`,
  );
  assert.ok(triggers?.push, `${workflowPath} must run on branch pushes`);
  assert.ok(triggers?.pull_request, `${workflowPath} must run on pull requests`);
  assert.ok(
    includesBranch(triggers.push.branches, 'monorepo-migrate'),
    `${workflowPath} push filter must include monorepo-migrate`,
  );
  assert.ok(
    includesBranch(triggers.pull_request.branches, 'main'),
    `${workflowPath} pull-request filter must include pull requests targeting main`,
  );
});

// Every Yarn-using job consumes the root Yarn Classic graph from the frozen lockfile.
test('should install the frozen root dependency graph before Yarn verification commands', () => {
  const workflow = readBuildAndTestWorkflow();

  assert.equal(
    workflow.defaults?.run?.['working-directory'],
    undefined,
    `${workflowPath} must not redirect root commands to a package directory`,
  );
  assertFrozenInstallBeforeYarnCommands(workflow);
});

// Root verification delegates to Turbo and each active package retains build, typecheck, lint, and test coverage.
test('should verify all active packages through the root Turbo command', () => {
  const workflow = readBuildAndTestWorkflow();
  const commands = getRunSteps(workflow)
    .map(({ command }) => command)
    .join('\n');
  const rootManifest = readRepositoryJson('package.json');

  assert.match(
    commands,
    /(?:^|\s)yarn\s+verify(?:\s|$)/m,
    `${workflowPath} must run root yarn verify`,
  );
  assert.match(
    rootManifest.scripts?.verify ?? '',
    /\byarn\s+test:structure\b/,
    'root verify must include fast structure contracts',
  );
  assert.match(
    rootManifest.scripts?.verify ?? '',
    /\bturbo\s+run\s+verify\b/,
    'root verify must delegate package verification to Turbo',
  );

  for (const packageDirectory of ['server', 'sdk', 'cli']) {
    const manifestPath = `packages/${packageDirectory}/package.json`;
    const verifyCommand = readRepositoryJson(manifestPath).scripts?.verify ?? '';
    for (const requiredTask of ['lint', 'typecheck', 'test', 'build']) {
      const taskPattern =
        requiredTask === 'test'
          ? /\byarn\s+test(?::[a-z0-9-]+)?(?=\s|&|$)/
          : new RegExp(`\\byarn\\s+${requiredTask}(?=\\s|&|$)`);
      assert.match(
        verifyCommand,
        taskPattern,
        `${manifestPath} verify must include ${requiredTask}`,
      );
    }
  }

  const serverScripts = readRepositoryJson('packages/server/package.json').scripts ?? {};
  for (const retainedSuite of ['unit', 'integration', 'e2e', 'pentest']) {
    assert.match(
      serverScripts['test:all'] ?? '',
      new RegExp(`(?:--project\\s+|yarn\\s+test:)${retainedSuite}(?=\\s|&|$)`),
      `packages/server/package.json test:all must retain the ${retainedSuite} suite`,
    );
  }
});

// Retained server, browser, harness, service, security, and dependency-audit coverage stays in branch CI.
test('should run every retained suite with its required CI infrastructure', () => {
  const workflow = readBuildAndTestWorkflow();
  const runSteps = getRunSteps(workflow);
  const commands = runSteps.map(({ command }) => command).join('\n');
  const infrastructureJobs = runSteps.filter(({ command }) =>
    /(?:^|\s)yarn\s+(?:verify|test:ui)(?:\s|$)/m.test(command),
  );

  assert.ok(
    infrastructureJobs.some(({ command }) => /(?:^|\s)yarn\s+verify(?:\s|$)/m.test(command)),
    `${workflowPath} must have a job that runs the retained Turbo verification suites`,
  );
  for (const { jobName } of infrastructureJobs) {
    const services = workflow.jobs[jobName].services ?? {};
    for (const serviceName of ['postgres', 'redis', 'mailhog']) {
      assert.ok(
        services[serviceName],
        `${workflowPath} job ${jobName} must provide ${serviceName}`,
      );
    }
  }

  assert.match(
    commands,
    /(?:^|\s)yarn\s+test:ui(?:\s|$)/m,
    `${workflowPath} must run retained Playwright UI tests`,
  );
  assert.match(
    commands,
    /\bplaywright\s+install\b[^\n]*\bchromium\b/,
    `${workflowPath} must install Playwright Chromium`,
  );
  assert.match(
    commands,
    /(?:^|\s)yarn\s+harness:test(?:\s|$)/m,
    `${workflowPath} must run the retained OIDC harness`,
  );
  assert.match(
    commands,
    /(?:^|\s)yarn\s+audit\b[^\n]*--level\s+high\b/m,
    `${workflowPath} must retain high-severity dependency auditing`,
  );
});

// Documentation and production Docker receive build-only validation without invoking deployment workflows.
test('should build public docs and the production Docker image as parity checks', () => {
  const workflow = readBuildAndTestWorkflow();
  const commands = getRunSteps(workflow)
    .map(({ command }) => command)
    .join('\n');
  const dockerBuildActions = Object.values(workflow.jobs).flatMap((job) =>
    (job.steps ?? []).filter(
      (step) => typeof step.uses === 'string' && /^docker\/build-push-action@/.test(step.uses),
    ),
  );

  assert.match(
    commands,
    /(?:^|\s)yarn\s+docs:build(?:\s|$)/m,
    `${workflowPath} must build public VitePress documentation`,
  );
  const usesDockerBuildCommand =
    /\bdocker\s+(?:build|buildx\s+build)\b[\s\S]*?\bdocker\/Dockerfile\b/.test(commands);
  const usesSafeDockerBuildAction = dockerBuildActions.some(
    (step) =>
      step.with?.push !== true &&
      step.with?.push !== 'true' &&
      /docker\/Dockerfile/.test(step.with?.file ?? ''),
  );
  assert.ok(
    usesDockerBuildCommand || usesSafeDockerBuildAction,
    `${workflowPath} must build-check docker/Dockerfile`,
  );
});

// Branch verification remains read-only and carries no credential or release capability.
test('should contain no publishing, release, versioning, deprecation, deployment, or main mutation behavior', () => {
  const workflow = readBuildAndTestWorkflow();
  const workflowSource = readRepositoryFile(workflowPath);
  const runCommands = getRunSteps(workflow)
    .map(({ command }) => command)
    .join('\n');
  const checkoutSteps = Object.entries(workflow.jobs).flatMap(([jobName, job]) =>
    (job.steps ?? [])
      .filter((step) => typeof step.uses === 'string' && /^actions\/checkout@/.test(step.uses))
      .map((step) => ({ jobName, step })),
  );

  assert.ok(checkoutSteps.length > 0, `${workflowPath} must check out the repository`);
  for (const { jobName, step } of checkoutSteps) {
    assert.equal(
      step.with?.['persist-credentials'],
      false,
      `${workflowPath} job ${jobName} checkout must disable persisted credentials`,
    );
  }

  const permissions = workflow.permissions;
  assert.ok(
    permissions === 'read-all' || permissions?.contents === 'read',
    `${workflowPath} must declare read-only repository permissions`,
  );
  if (permissions && typeof permissions === 'object') {
    for (const [permissionName, access] of Object.entries(permissions)) {
      assert.notEqual(
        access,
        'write',
        `${workflowPath} permission ${permissionName} must not grant write access`,
      );
    }
  }

  assert.doesNotMatch(
    workflowSource,
    /\$\{\{\s*secrets\.|NODE_AUTH_TOKEN|NPM_TOKEN|registry-url|registry\.npmjs\.org|DOCKERHUB_(?:TOKEN|USERNAME)/i,
    `${workflowPath} must not consume registry or release credentials`,
  );
  assert.doesNotMatch(
    runCommands,
    /\b(?:npm|yarn|pnpm)\s+(?:publish|version)\b|\bnpm\s+deprecate\b|\bsemantic-release\b|\blockstep\s+(?:version|publish|release)\b|\bgh\s+release\b|\bgit\s+(?:tag|push|commit)\b|\bdocker\s+push\b/i,
    `${workflowPath} must not publish, version, deprecate, tag, release, or push`,
  );
  assert.doesNotMatch(
    workflowSource,
    /actions\/(?:deploy-pages|create-release)|\bpush:\s*true\b/i,
    `${workflowPath} must not invoke a publishing or deployment action`,
  );
  assert.doesNotMatch(
    runCommands,
    /\bgit\s+(?:checkout|switch)\s+main\b|\bgh\s+pr\s+merge\b/i,
    `${workflowPath} must not mutate or merge production main`,
  );
});

// Deferred playgrounds and the known provisioning-smoke defect remain outside the migration CI gate.
test('should exclude deferred playground and provisioning-smoke commands from branch CI', () => {
  const commands = getRunSteps(readBuildAndTestWorkflow())
    .map(({ command }) => command)
    .join('\n');

  assert.doesNotMatch(
    commands,
    /\bplayground(?:-bff|:|\/)|\byarn\s+playground\b/i,
    `${workflowPath} must not add deferred playgrounds to verification`,
  );
  assert.doesNotMatch(
    commands,
    /\bprovision:smoke\b|scripts\/provision-smoke-test\.ts/i,
    `${workflowPath} must preserve the documented provisioning-smoke baseline exclusion`,
  );
});
