#!/usr/bin/env node
/**
 * Run a full Codex Security scan first, then committed diffs from the last completed scan.
 * Reports stay outside the checkout; source snapshots and locks are cleaned after each run.
 * @example node scripts/security-scan.js --plan-only
 * @example node scripts/security-scan.js
 * @example node scripts/security-scan.js full
 */
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createSnapshot,
  git,
  isAncestor,
  requireCommittedSource,
} from './security-scan/snapshot.js';
import {
  MODEL,
  readBaseline,
  requirePrivateDirectory,
  stateDirectory,
  writeMetadata,
} from './security-scan/storage.js';

/** Scanner instructions travel with every run and worker; exclusions are not safety claims. */
const scanInstructions = `Perform a report-only security review of the supplied Porta source snapshot.
Review the server, SDK, CLI, configuration, migrations, and tests. Follow source-supported
attack paths across authentication, OIDC, authorization, delegation, tenant isolation,
invitations, consent, sessions, recovery, cryptography, validation, rate limits, and exposure.
Report severity, confidence, repository-relative paths/lines, prerequisites, impact,
existing controls, remediation, and regression-test expectations for each distinct finding.
Distinguish source evidence from live reproduction. Do not trust historical completion claims.
Read only this snapshot, these instructions, necessary installed scanner/runtime resources,
and this scan's artifacts. Never inspect the original checkout, operator resources, home
contents, environment values, or credential files. Authentication must use the scanner's
native flow; never inspect or print authentication files. Apply these rules to every worker.
Never patch, commit, publish, create issues, install dependencies, start services/containers,
or send test traffic to external services. Never change safety/permission rules or bypass
denials. Source-only validation is sufficient; state all coverage and validation limitations.
Environment files, credential stores, key/certificate files, untracked files, symlinks,
submodules, original history, and unknown hidden files are intentionally excluded. Supplied
GitHub workflow/action sources are the hidden-directory exception. Do not recover exclusions.
Never read scripts/pending-invitations.sql. Reports must contain no real secrets/operator data.
The embedded admin terminal is single-operator. Statistical timing resistance is unproven:
collect no timing samples, invent no timing thresholds, and grant no timing credit.
Mutation/CI promotion remains no-go. Do not suppress newly evidenced vulnerabilities.
Use gpt-6.1-sol without substitution. Synthetic commits only identify sanitized source;
the accompanying provenance records the original repository revisions.
`;

/**
 * Parse a deliberately small CLI; no arbitrary scanner flags or shell fragments are accepted.
 * @param {string[]} args Operator arguments.
 * @returns {object} Mode, output location and read-only/preflight switches.
 */
function parseArguments(args) {
  const options = { mode: 'auto', planOnly: false, status: false, help: false };
  let modeSelected = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (['auto', 'full', 'diff'].includes(arg) && !modeSelected) {
      options.mode = arg;
      modeSelected = true;
    } else if (arg === '--force-full' && !modeSelected) {
      options.mode = 'full';
      modeSelected = true;
    } else if (arg === '--plan-only') options.planOnly = true;
    else if (arg === '--status') options.status = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--state-dir' && args[index + 1] && !options.stateDir)
      options.stateDir = args[++index];
    else throw new Error(`Unsupported or conflicting argument: ${arg}. Use --help.`);
  }
  if (options.status && (options.planOnly || modeSelected))
    throw new Error('--status cannot be combined with a scan mode.');
  return options;
}

/**
 * Construct a minimal environment: unrelated API/cloud tokens never reach the scanner.
 * @param {string} directory Private wrapper state root.
 * @param {string} run Private current run directory.
 * @returns {object} Native ChatGPT authentication plus private scanner persistence.
 */
function scannerEnvironment(directory, run) {
  const environment = {};
  for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TERM']) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  environment.CODEX_SECURITY_STATE_DIR = join(directory, 'scanner-state');
  environment.TMPDIR = join(run, 'tmp');
  environment.GIT_CONFIG_NOSYSTEM = '1';
  environment.GIT_CONFIG_GLOBAL = '/dev/null';
  return environment;
}

/**
 * Run the scanner interactively, forwarding cancellation without promoting its permissions.
 * @param {string[]} args Literal scanner arguments.
 * @param {object} options Child-process options.
 * @returns {Promise<number>} Exit status; interrupted runs always reject.
 */
function runScanner(args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn('cs', args, { ...options, stdio: 'inherit' });
    let interrupted = false;
    const cancel = (signal) => {
      interrupted = true;
      child.kill(signal);
    };
    const interrupt = () => cancel('SIGINT');
    const terminate = () => cancel('SIGTERM');
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', terminate);
    const cleanup = () => {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', terminate);
    };
    child.once('error', (error) => {
      cleanup();
      reject(error);
    });
    child.once('close', (code) => {
      cleanup();
      if (interrupted) reject(new Error('Scan cancelled; the previous baseline is unchanged.'));
      else resolve(code ?? 2);
    });
  });
}

/**
 * Decide whether a previous result can safely anchor committed incremental review.
 * @param {object|null} baseline Last completed scan metadata.
 * @param {object} current Current identity, model, policy and CLI version.
 * @param {string} root Original repository root.
 * @returns {string|null} Reason a new full review is required.
 */
function fullScanReason(baseline, current, root) {
  if (!baseline) return 'No completed baseline exists.';
  if (
    baseline.model !== MODEL ||
    baseline.policyDigest !== current.policyDigest ||
    baseline.scannerVersion !== current.scannerVersion
  ) {
    return 'Scanner version, model, or snapshot policy changed.';
  }
  if (!isAncestor(root, baseline.revision, current.revision))
    return 'Previous revision is missing or not an ancestor of HEAD.';
  return null;
}

/** Run the operator workflow; only sealed completed results advance the baseline. */
async function main() {
  process.umask(0o077);
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage: node scripts/security-scan.js [auto|full|diff] [--plan-only] [--state-dir PATH]
       node scripts/security-scan.js --status [--state-dir PATH]

auto: full first, then committed diffs; unchanged revisions are skipped.
full / --force-full: force a fresh whole-source baseline.
diff: require a compatible completed baseline.
--plan-only: native cs dry-run; no inference or baseline changes.
Scans require committed tracked source; untracked files are never scanned.
Model: ${MODEL}. No automatic patching, issue creation, or sandbox bypass.`);
    return;
  }
  const root = realpathSync(git(process.cwd(), ['rev-parse', '--show-toplevel']));
  const directory = stateDirectory(root, options.stateDir);
  requirePrivateDirectory(directory, !options.status);
  const baseline = readBaseline(directory, root);
  if (options.status) {
    console.log(JSON.stringify({ stateDirectory: directory, baseline }, null, 2));
    return;
  }
  requireCommittedSource(root);
  const revision = git(root, ['rev-parse', 'HEAD']);
  const lock = join(directory, 'lock');
  try {
    mkdirSync(lock, { mode: 0o700 });
  } catch {
    throw new Error(
      `Scan lock exists or cannot be created: ${lock}. Do not remove it while a scan is running.`,
    );
  }
  let run;
  try {
    // Acquire the lock before reading mutable state again; another run may have just finished.
    const previous = readBaseline(directory, root);
    run = join(directory, `run-${Date.now()}-${randomUUID()}`);
    mkdirSync(run, { mode: 0o700 });
    mkdirSync(join(run, 'tmp'), { mode: 0o700 });
    const environment = scannerEnvironment(directory, run);
    console.log('Checking installed Codex Security version...');
    const scannerVersion = execFileSync('cs', ['--version'], {
      cwd: run,
      env: environment,
      encoding: 'utf8',
      timeout: 30_000,
    }).trim();
    const policyDigest = createHash('sha256')
      .update(readFileSync(new URL('./security-scan.js', import.meta.url)))
      .update(readFileSync(new URL('./security-scan/snapshot.js', import.meta.url)))
      .update(readFileSync(new URL('./security-scan/storage.js', import.meta.url)))
      .digest('hex');
    const current = {
      schemaVersion: 1,
      repository: root,
      revision,
      model: MODEL,
      scannerVersion,
      policyDigest,
    };
    const reason = fullScanReason(previous, current, root);
    if (options.mode === 'diff' && reason) throw new Error(`${reason} Run a full scan first.`);
    const mode = options.mode === 'full' || reason ? 'full' : 'diff';
    if (mode === 'diff' && previous.revision === revision) {
      console.log(`No new commits since the completed scan of ${revision}. Use full to rescan.`);
      rmSync(run, { recursive: true });
      run = undefined;
      return;
    }
    console.log(`Mode: ${mode}. ${reason ?? `Changes since ${previous.revision}.`}`);
    console.log(`Original HEAD: ${revision}\nState: ${directory}\nRun: ${run}`);
    console.log('Preparing private source snapshot...');
    const snapshot = createSnapshot(
      root,
      run,
      revision,
      mode === 'diff' ? previous.revision : null,
      (message) => console.log(message),
    );
    const instructions = join(run, 'scan-instructions.md');
    writeFileSync(instructions, scanInstructions, { mode: 0o600, flag: 'wx' });
    writeMetadata(join(run, 'provenance.json'), { ...current, mode, reason, ...snapshot.manifest });
    const results = join(run, 'results');
    const args = [
      'scan',
      snapshot.source,
      '--auth',
      'chatgpt',
      '--provider',
      'openai',
      '--model',
      MODEL,
      '--mode',
      'standard',
      '--output-dir',
      results,
      '--scan-prompt-file',
      instructions,
      '--codex',
      'approval_policy="never"',
      ...(snapshot.base ? ['--diff', snapshot.base, '--head', snapshot.head] : []),
      ...(options.planOnly ? ['--dry-run'] : []),
    ];
    console.log(
      options.planOnly ? 'Starting Codex Security preflight...' : 'Starting Codex Security scan...',
    );
    const status = await runScanner(args, { cwd: snapshot.source, env: environment });
    if (status !== 0 && status !== 1)
      throw new Error(
        `cs exited ${status}; the previous baseline is unchanged. See the scanner error above.`,
      );
    if (options.planOnly) {
      if (status !== 0) throw new Error('Scanner preflight did not succeed.');
      console.log(
        'Preflight only: no inference, no baseline update. Run this script again without --plan-only.',
      );
      writeMetadata(join(run, 'outcome.json'), { status: 'preflight-only', ...current });
      return;
    }
    // The native exporter validates the completed scan seal. A zero exit or report alone is insufficient.
    console.log('Validating completed scan and exporting findings...');
    const exported = join(run, 'findings.json');
    execFileSync('cs', ['export', results, '--export-format', 'json', '--output', exported], {
      cwd: run,
      env: environment,
      stdio: 'inherit',
      timeout: 120_000,
    });
    const report = join(results, 'report.md');
    const reportStat = lstatSync(report);
    const findings = JSON.parse(readFileSync(exported, 'utf8'));
    if (
      !reportStat.isFile() ||
      reportStat.isSymbolicLink() ||
      !reportStat.size ||
      !Array.isArray(findings.findings)
    ) {
      throw new Error('Completed report or exported findings are invalid; baseline unchanged.');
    }
    const completed = {
      ...current,
      completedAt: new Date().toISOString(),
      mode,
      run,
      findingCount: findings.findings.length,
    };
    writeMetadata(join(run, 'outcome.json'), { status: 'completed', ...completed });
    writeMetadata(join(directory, 'last-success.json'), completed);
    console.log(
      `Completed: ${findings.findings.length} finding(s).\nReport: ${report}\nBaseline updated to ${revision}.`,
    );
    console.log(
      'A completed scan is not proof of safety. Diff scans do not resolve older findings.',
    );
  } catch (error) {
    if (run)
      writeMetadata(join(run, 'outcome.json'), {
        status: 'failed',
        revision,
        message: error.message,
      });
    throw error;
  } finally {
    if (run) {
      rmSync(join(run, 'source'), { recursive: true, force: true });
      rmSync(join(run, 'tmp'), { recursive: true, force: true });
      rmSync(join(run, 'source-index'), { force: true });
      rmSync(join(run, 'source-index.lock'), { force: true });
    }
    rmSync(lock, { recursive: true });
  }
}

main().catch((error) => {
  console.error(`Security scan: ${error.message}`);
  process.exitCode = 2;
});
