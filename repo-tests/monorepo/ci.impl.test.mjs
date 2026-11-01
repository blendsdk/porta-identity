import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { parse } from 'yaml';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const workflowPath = '.github/workflows/build-and-test.yml';

/**
 * Loads the branch workflow used by the implementation diagnostics.
 *
 * @returns {object} Parsed workflow object.
 */
function loadWorkflow() {
  const workflow = parse(readFileSync(resolve(repositoryRoot, workflowPath), 'utf8'));
  assert.ok(workflow && typeof workflow === 'object', `${workflowPath} must parse as an object`);
  assert.ok(workflow.jobs && typeof workflow.jobs === 'object', `${workflowPath} must define jobs`);
  return workflow;
}

/**
 * Returns the shell commands declared by one workflow job.
 *
 * @param {object} job Workflow job.
 * @returns {string[]} Commands in execution order.
 */
function getCommands(job) {
  return (job.steps ?? []).flatMap((step) => (typeof step.run === 'string' ? [step.run] : []));
}

test('should keep the branch gate as six independent validation concerns', () => {
  const workflow = loadWorkflow();

  assert.deepEqual(Object.keys(workflow.jobs).sort(), [
    'audit',
    'docker',
    'docs',
    'harness',
    'ui',
    'verify',
  ]);
  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    assert.equal(job.needs, undefined, `${jobName} should run independently for fast feedback`);
  }
});

test('should apply the root pnpm setup consistently to every JavaScript job', () => {
  const workflow = loadWorkflow();

  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    const commands = getCommands(job);
    const usesPnpm = commands.some((command) => /(?:^|\s)pnpm(?:\s|$)/m.test(command));
    if (!usesPnpm) {
      continue;
    }

    const pnpmSetupIndex = job.steps.findIndex(
      (step) => typeof step.uses === 'string' && /^pnpm\/action-setup@/.test(step.uses),
    );
    assert.notEqual(pnpmSetupIndex, -1, `${jobName} must install pnpm with pnpm/action-setup`);

    const setupNodeIndex = job.steps.findIndex(
      (step) => typeof step.uses === 'string' && step.uses === 'actions/setup-node@v6',
    );
    const setupNode = job.steps[setupNodeIndex];
    assert.ok(setupNode, `${jobName} must set up Node before running pnpm`);
    assert.ok(
      pnpmSetupIndex < setupNodeIndex,
      `${jobName} must install pnpm before setup-node so the pnpm cache can resolve`,
    );
    assert.equal(setupNode.with?.['node-version'], 22, `${jobName} must use Node 22`);
    assert.equal(setupNode.with?.cache, 'pnpm', `${jobName} must cache the pnpm store`);

    const installIndexes = commands.flatMap((command, index) =>
      command === 'pnpm install --frozen-lockfile' ? [index] : [],
    );
    assert.deepEqual(installIndexes, [0], `${jobName} must perform one frozen root install first`);
  }
});

test('should wire service-backed and build-only jobs to their exact validation commands', () => {
  const workflow = loadWorkflow();

  for (const jobName of ['verify', 'ui']) {
    assert.deepEqual(Object.keys(workflow.jobs[jobName].services).sort(), [
      'mailhog',
      'postgres',
      'redis',
    ]);
  }

  assert.deepEqual(getCommands(workflow.jobs.verify), [
    'pnpm install --frozen-lockfile',
    'pnpm verify',
  ]);
  assert.deepEqual(getCommands(workflow.jobs.ui), [
    'pnpm install --frozen-lockfile',
    'pnpm exec playwright install --with-deps chromium',
    'pnpm build',
    'pnpm test:ui',
  ]);
  assert.deepEqual(getCommands(workflow.jobs.harness), [
    'pnpm install --frozen-lockfile',
    'pnpm exec playwright install --with-deps chromium',
    `docker buildx build \\
  --file test-harness/Dockerfile \\
  --tag porta-harness-ci:latest \\
  --cache-from type=gha,scope=porta-harness-ci \\
  --cache-to type=gha,mode=max,scope=porta-harness-ci \\
  --load .
`,
    'pnpm harness:test',
  ]);
  assert.deepEqual(getCommands(workflow.jobs.docs), [
    'pnpm install --frozen-lockfile',
    'pnpm docs:build',
  ]);
  assert.deepEqual(getCommands(workflow.jobs.docker), []);
  assert.deepEqual(getCommands(workflow.jobs.audit), [
    'pnpm install --frozen-lockfile',
    'pnpm audit --prod --audit-level high',
  ]);

  const dockerBuild = workflow.jobs.docker.steps.find(
    (step) => step.uses === 'docker/build-push-action@v7',
  );
  assert.ok(dockerBuild, 'docker job must use docker/build-push-action');
  assert.equal(dockerBuild.with?.file, 'docker/Dockerfile');
  assert.notEqual(dockerBuild.with?.push, true);
  assert.match(dockerBuild.with?.['cache-from'] ?? '', /type=gha/);
  assert.match(dockerBuild.with?.['cache-to'] ?? '', /type=gha/);

  const harnessBuildx = workflow.jobs.harness.steps.find(
    (step) => step.uses === 'docker/setup-buildx-action@v4',
  );
  assert.ok(harnessBuildx, 'harness job must set up Buildx for its image cache');
  const harnessStep = workflow.jobs.harness.steps.find(
    (step) => step.run === 'pnpm harness:test',
  );
  assert.equal(
    harnessStep?.env?.HARNESS_BUILD_CACHE_FILE,
    'test-harness/docker-compose.ci.yml',
    'harness job must include the CI-only image cache overlay',
  );

  const auditStep = workflow.jobs.audit.steps.find((step) =>
    step.run?.startsWith('pnpm audit'),
  );
  assert.equal(
    auditStep?.['continue-on-error'],
    undefined,
    'dependency audit failures must fail CI',
  );
});
