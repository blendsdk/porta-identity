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

test('should apply the root Yarn setup consistently to every JavaScript job', () => {
  const workflow = loadWorkflow();

  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    const commands = getCommands(job);
    const usesYarn = commands.some((command) => /(?:^|\s)yarn(?:\s|$)/m.test(command));
    if (!usesYarn) {
      continue;
    }

    const setupNode = job.steps.find((step) => step.uses === 'actions/setup-node@v6');
    assert.ok(setupNode, `${jobName} must set up Node before running Yarn`);
    assert.equal(setupNode.with?.['node-version'], 22, `${jobName} must use Node 22`);
    assert.equal(setupNode.with?.cache, 'yarn', `${jobName} must cache the root Yarn graph`);

    const installIndexes = commands.flatMap((command, index) =>
      command === 'yarn install --frozen-lockfile' ? [index] : [],
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
    'yarn install --frozen-lockfile',
    'yarn verify',
  ]);
  assert.deepEqual(getCommands(workflow.jobs.harness), [
    'yarn install --frozen-lockfile',
    'yarn playwright install --with-deps chromium',
    'yarn harness:test',
  ]);
  assert.deepEqual(getCommands(workflow.jobs.docs), [
    'yarn install --frozen-lockfile',
    'yarn docs:build',
  ]);
  assert.deepEqual(getCommands(workflow.jobs.docker), [
    'docker build --file docker/Dockerfile --tag porta-ci .',
  ]);
  assert.deepEqual(getCommands(workflow.jobs.audit), [
    'yarn install --frozen-lockfile',
    'yarn audit --groups dependencies --level high',
  ]);

  const auditStep = workflow.jobs.audit.steps.find((step) => step.run?.startsWith('yarn audit'));
  assert.equal(
    auditStep?.['continue-on-error'],
    undefined,
    'dependency audit failures must fail CI',
  );
});
