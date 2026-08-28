/** Packed CLI login and terminal smoke for the local administration playground. */

import { execFile as execFileCallback, spawn } from 'node:child_process';
import { X509Certificate, createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';

const execFile = promisify(execFileCallback);
const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const issuer = 'https://porta-admin-playground.ci.portaidentity.com:3543';
const email = 'admin@playground.porta.test';
const enterAlternateScreen = '\u001b[?1049h';
const leaveAlternateScreen = '\u001b[?1049l';
/** Fixed child program that uses only the SDK installed in the temporary packed consumer. */
const packedOrganizationScript = String.raw`
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createPortaClient } from '@portaidentity/sdk';
import { createNodeTransport, createTokenAuth } from '@portaidentity/sdk/node';

const action = process.env.PORTA_ADMIN_TEST_ACTION;
const issuer = process.env.PORTA_ADMIN_TEST_ISSUER;
const name = process.env.PORTA_ADMIN_TEST_NAME;
const nonce = process.env.PORTA_ADMIN_TEST_NONCE;
const slug = process.env.PORTA_ADMIN_TEST_SLUG;
if (
  !['assert-absent', 'cleanup'].includes(action) ||
  issuer !== 'https://porta-admin-playground.ci.portaidentity.com:3543' ||
  !/^[a-f0-9]{24}$/.test(nonce ?? '') ||
  slug !== 'porta-admin-e2e-' + nonce ||
  name !== 'Admin UI E2E ' + nonce
) {
  throw new Error('Packed organization cleanup input is invalid.');
}

const credentials = JSON.parse(
  await readFile(join(homedir(), '.porta', 'credentials.json'), 'utf8'),
);
if (
  credentials.server !== issuer ||
  typeof credentials.accessToken !== 'string' ||
  credentials.accessToken.length === 0
) {
  throw new Error('Packed organization cleanup credentials are invalid.');
}
const client = createPortaClient({
  transport: createNodeTransport({
    baseUrl: issuer,
    auth: createTokenAuth({ token: credentials.accessToken }),
  }),
});
const before = await client.organizations.listAll();
const matches = before.filter((organization) => organization.slug === slug);
if (action === 'assert-absent') {
  if (matches.length !== 0) throw new Error('Test organization slug is already present.');
  console.log(JSON.stringify({ absent: true }));
} else {
  if (matches.length !== 1 || matches[0].name !== name) {
    throw new Error('Test organization ownership could not be proved.');
  }
  const unrelatedIds = before
    .filter((organization) => organization.slug !== slug)
    .map((organization) => organization.id)
    .sort();
  await client.organizations.destroy(slug);
  const after = await client.organizations.listAll();
  if (after.some((organization) => organization.slug === slug)) {
    throw new Error('Test organization remains after cleanup.');
  }
  const remainingIds = after.map((organization) => organization.id).sort();
  if (JSON.stringify(remainingIds) !== JSON.stringify(unrelatedIds)) {
    throw new Error('Cleanup changed an unrelated organization.');
  }
  console.log(JSON.stringify({ absent: true, ownershipVerified: true }));
}
`;

/**
 * Preserves the original journey and cleanup failures without changing their order.
 *
 * @param primaryFailure Failure raised by the user journey, if any.
 * @param cleanupFailure Failure raised while removing the test organization, if any.
 * @returns The single failure, an ordered aggregate, or `undefined` when both stages succeeded.
 */
export function combineJourneyAndCleanupErrors(primaryFailure, cleanupFailure) {
  if (primaryFailure && cleanupFailure) {
    return new AggregateError(
      [primaryFailure, cleanupFailure],
      'The packed administration journey and its cleanup both failed.',
    );
  }
  return primaryFailure ?? cleanupFailure;
}

/** Quotes a trusted generated path for the fixed util-linux `script` command. */
function shellPath(path) {
  return `'${path.replaceAll("'", "'\\''")}'`;
}

/** Waits for a bounded output predicate while its child remains active. */
async function waitForOutput(child, readOutput, predicate, description) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (predicate(readOutput())) return;
    if (child.exitCode !== null || child.signalCode !== null) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  throw new Error(`${description} was not observed.`);
}

/** Captures bounded child output and resolves with its exit status. */
function captureChild(child) {
  let output = '';
  const append = (chunk) => {
    if (output.length < 256_000) output += chunk.toString('utf8');
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  const result = new Promise((resolveChild, rejectChild) => {
    child.once('error', rejectChild);
    child.once('close', (exitCode) => resolveChild({ exitCode, output }));
  });
  return { output: () => output, result };
}

/** Binds the CLI's documented manual callback and retains one callback URL in memory. */
async function startCallbackCapture() {
  let resolveCallback;
  const callback = new Promise((resolveValue) => {
    resolveCallback = resolveValue;
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1:11111');
    if (request.method !== 'GET' || url.pathname !== '/callback') {
      response.writeHead(404).end();
      return;
    }
    resolveCallback(url.toString());
    response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    response.end('Authentication complete.');
  });
  await new Promise((resolveListening, rejectListening) => {
    server.once('error', rejectListening);
    server.listen(11111, '127.0.0.1', resolveListening);
  });
  return {
    callback,
    close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
  };
}

/** Packs and installs the local SDK and CLI into one temporary consumer. */
async function preparePackedConsumer(temporaryRoot) {
  const npmCli = resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');
  const packageDirectory = resolve(temporaryRoot, 'packages');
  const consumerDirectory = resolve(temporaryRoot, 'consumer');
  await mkdir(packageDirectory, { recursive: true, mode: 0o700 });
  await execFile(process.execPath, [npmCli, 'pack', '--pack-destination', packageDirectory], {
    cwd: resolve(repositoryRoot, 'packages/sdk'),
  });
  await execFile(process.execPath, [npmCli, 'pack', '--pack-destination', packageDirectory], {
    cwd: resolve(repositoryRoot, 'packages/cli'),
  });
  const sdkArchive = resolve(packageDirectory, 'portaidentity-sdk-1.7.3.tgz');
  const cliArchive = resolve(packageDirectory, 'portaidentity-cli-1.7.3.tgz');
  await execFile(
    process.execPath,
    [
      npmCli,
      'install',
      '--no-audit',
      '--no-fund',
      '--prefix',
      consumerDirectory,
      sdkArchive,
      cliArchive,
    ],
    { cwd: temporaryRoot, timeout: 120_000 },
  );
  const cliBin = resolve(consumerDirectory, 'node_modules/@portaidentity/cli/dist/index.js');
  await access(cliBin);
  return { cliBin, consumerDirectory };
}

/** Runs one bounded organization check through the SDK installed in the packed consumer. */
async function runPackedOrganizationCheck({ action, consumerDirectory, home, name, nonce, slug }) {
  const result = await execFile(
    process.execPath,
    ['--input-type=module', '--eval', packedOrganizationScript],
    {
      cwd: consumerDirectory,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        NODE_USE_SYSTEM_CA: '1',
        PORTA_ADMIN_TEST_ACTION: action,
        PORTA_ADMIN_TEST_ISSUER: issuer,
        PORTA_ADMIN_TEST_NAME: name,
        PORTA_ADMIN_TEST_NONCE: nonce,
        PORTA_ADMIN_TEST_SLUG: slug,
      },
      timeout: 30_000,
    },
  );
  return JSON.parse(result.stdout);
}

/** Authenticates the packed CLI through a real headless browser. */
async function loginPackedCli(cliBin, consumerDirectory, home, password, trustedSpki) {
  const callbackCapture = await startCallbackCapture();
  const child = spawn(process.execPath, [cliBin, 'login', '--server', issuer], {
    cwd: consumerDirectory,
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      PORTA_CONTAINER: '1',
      NODE_USE_SYSTEM_CA: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const captured = captureChild(child);
  let browser;
  try {
    await waitForOutput(
      child,
      captured.output,
      (output) => output.includes('/porta-admin/auth?'),
      'Packed CLI authorization URL',
    );
    const match = captured.output().match(/https:\/\/[^\s]+\/porta-admin\/auth\?[^\s]+/u);
    if (!match) throw new Error('Packed CLI authorization URL is unavailable.');
    browser = await chromium.launch({
      headless: true,
      args: [`--ignore-certificate-errors-spki-list=${trustedSpki}`],
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    let resolveBrowserCallback;
    const browserCallback = new Promise((resolveValue) => {
      resolveBrowserCallback = resolveValue;
    });
    page.on('request', (request) => {
      if (request.url().startsWith('http://127.0.0.1:11111/callback?')) {
        resolveBrowserCallback(request.url());
      }
    });
    await page.goto(match[0], { waitUntil: 'domcontentloaded' });
    await page.locator('input#email').fill(email);
    await page.locator('input#password').fill(password);
    await page.locator('form[action$="/login"] button[type="submit"]').click();
    const consent = page.locator(
      'form[action$="/confirm"]:has(input[name="decision"][value="approve"]) button[type="submit"]',
    );
    if (await consent.isVisible({ timeout: 1_000 }).catch(() => false)) await consent.click();
    let timeout;
    let callbackUrl;
    try {
      callbackUrl = await Promise.race([
        callbackCapture.callback,
        browserCallback,
        new Promise((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('Browser callback timed out.')), 20_000);
        }),
      ]).finally(() => clearTimeout(timeout));
    } catch {
      throw new Error('Browser authorization did not complete.');
    }
    child.stdin.end(`${callbackUrl}\n`);
    const result = await captured.result;
    if (result.exitCode !== 0) throw new Error('Packed CLI login failed.');
    return result;
  } finally {
    if (browser) await browser.close();
    await callbackCapture.close();
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
}

/**
 * Launches `porta admin`, drives its organization workflow, and exits by keyboard command.
 * The dispatch callback makes cleanup mandatory before any later observation can fail.
 */
async function runPackedAdmin(
  cliBin,
  consumerDirectory,
  home,
  organization,
  onCreateDispatch,
  afterCreateDispatch,
) {
  const command = `stty columns 80 rows 24; exec ${shellPath(process.execPath)} ${shellPath(cliBin)} admin --server ${shellPath(issuer)}`;
  const child = spawn('/usr/bin/script', ['-qfec', command, '/dev/null'], {
    cwd: consumerDirectory,
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      TERM: 'xterm-256color',
      NODE_USE_SYSTEM_CA: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const captured = captureChild(child);
  const observeAfter = () => captured.output().length;
  const includesAfter = (offset, value) => captured.output().slice(offset).includes(value);
  child.stdout.on('data', (chunk) => {
    if (chunk.toString('utf8').includes('\u001b[6n')) child.stdin.write('\u001b[1;1R');
  });
  try {
    try {
      await waitForOutput(
        child,
        captured.output,
        (output) => output.includes('Cancel') && output.includes('Reauthenticate'),
        'Initial organization chooser',
      );
    } catch {
      throw new Error('Initial organization chooser was not observed.');
    }

    let offset = observeAfter();
    child.stdin.write('\u001b');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Choose or create an organization.'),
      'Landing view after chooser cancellation',
    );

    offset = observeAfter();
    child.stdin.write('\u001bm');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Who am I'),
      'Hamburger menu',
    );
    child.stdin.write('\r');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Who am I') && includesAfter(offset, email),
      'Verified identity dialog',
    );
    child.stdin.write('\r');

    offset = observeAfter();
    child.stdin.write('\u001bo');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Switch organization'),
      'Organizations menu',
    );
    child.stdin.write('\u001b[B\r');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Cancel') && includesAfter(offset, 'Reauthenticate'),
      'Explicit organization chooser',
    );
    offset = observeAfter();
    child.stdin.write(' ');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Organization: Porta Admin'),
      'Explicitly selected organization',
    );

    offset = observeAfter();
    child.stdin.write('\u001bo');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Create organization'),
      'Organizations menu before create',
    );
    child.stdin.write('\r');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Default locale'),
      'Create organization dialog',
    );
    child.stdin.write(`\u001bn${organization.name}\u001bs${organization.slug}\u001bc`);
    onCreateDispatch();
    offset = observeAfter();
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, `Organization: ${organization.name}`),
      'Created and selected organization',
    );
    await afterCreateDispatch?.();
    child.stdin.write('\u001bx');
    child.stdin.end();
    const result = await captured.result;
    return {
      ...result,
      initialOrganizationChooserWasObservedAndCancelled: true,
      focusWasRestoredAfterChooserCancellation: true,
      whoAmIProvedVerifiedEmail: true,
      organizationWasExplicitlySwitched: true,
      highEntropyOrganizationWasCreatedAndAutoSelected: true,
    };
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
}

/**
 * Runs the packed CLI journey and removes exactly the organization created by this invocation.
 *
 * @param playgroundRoot Root of the existing admin playground.
 * @param afterCreateDispatch Optional test seam that runs only after create was dispatched.
 * @returns Observable packed-install, UI, cleanup, and terminal-restoration evidence.
 * @throws The journey failure, cleanup failure, or an ordered aggregate when both fail.
 */
export async function runAdminCliJourney({ playgroundRoot, afterCreateDispatch }) {
  const password = process.env.PORTA_ADMIN_PLAYGROUND_PASSWORD;
  if (!password)
    throw new Error('PORTA_ADMIN_PLAYGROUND_PASSWORD is required for the live journey.');
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'porta-admin-journey-'));
  const home = resolve(temporaryRoot, 'home');
  const nonce = randomBytes(12).toString('hex');
  const testOrganization = {
    name: `Admin UI E2E ${nonce}`,
    slug: `porta-admin-e2e-${nonce}`,
  };
  await mkdir(home, { mode: 0o700 });
  const beforeVolumes = (await execFile('docker', ['volume', 'ls', '--format', '{{.Name}}']))
    .stdout;
  try {
    const certificate = new X509Certificate(
      await readFile(resolve(playgroundRoot, 'runtime/tls/server.pem')),
    );
    const trustedSpki = createHash('sha256')
      .update(certificate.publicKey.export({ format: 'der', type: 'spki' }))
      .digest('base64');
    const { cliBin, consumerDirectory } = await preparePackedConsumer(temporaryRoot);
    const login = await loginPackedCli(cliBin, consumerDirectory, home, password, trustedSpki);
    const credentials = JSON.parse(
      await readFile(resolve(home, '.porta/credentials.json'), 'utf8'),
    );
    const absentBeforeCreate = await runPackedOrganizationCheck({
      action: 'assert-absent',
      consumerDirectory,
      home,
      ...testOrganization,
      nonce,
    });
    let createWasDispatched = false;
    let admin;
    let primaryFailure;
    let cleanupFailure;
    let cleanup;
    try {
      admin = await runPackedAdmin(
        cliBin,
        consumerDirectory,
        home,
        testOrganization,
        () => {
          createWasDispatched = true;
        },
        afterCreateDispatch,
      );
    } catch (error) {
      primaryFailure = error;
    } finally {
      if (createWasDispatched) {
        try {
          cleanup = await runPackedOrganizationCheck({
            action: 'cleanup',
            consumerDirectory,
            home,
            ...testOrganization,
            nonce,
          });
        } catch (error) {
          cleanupFailure = error;
        }
      }
    }
    const combinedFailure = combineJourneyAndCleanupErrors(primaryFailure, cleanupFailure);
    if (combinedFailure) throw combinedFailure;
    await execFile('docker', [
      'compose',
      '--project-name',
      'porta-admin-playground',
      '-f',
      resolve(playgroundRoot, 'compose.yml'),
      'down',
    ]);
    const afterVolumes = (await execFile('docker', ['volume', 'ls', '--format', '{{.Name}}']))
      .stdout;
    return {
      cliWasPackedAndInstalled: true,
      playgroundIssuerWasValidated: credentials.server === issuer,
      verifiedBootstrapIdentityWasVisible:
        credentials.userInfo?.email === email && admin.output.includes(email),
      initialOrganizationChooserWasObservedAndCancelled:
        admin.initialOrganizationChooserWasObservedAndCancelled,
      focusWasRestoredAfterChooserCancellation: admin.focusWasRestoredAfterChooserCancellation,
      whoAmIProvedVerifiedEmail: admin.whoAmIProvedVerifiedEmail,
      organizationWasExplicitlySwitched: admin.organizationWasExplicitlySwitched,
      highEntropyOrganizationWasCreatedAndAutoSelected:
        admin.highEntropyOrganizationWasCreatedAndAutoSelected,
      testOrganizationWasProvenAbsentBeforeCreate: absentBeforeCreate.absent === true,
      cleanupUsedIsolatedPackedSdkContext: true,
      cleanupVerifiedNonceOwnership: cleanup.ownershipVerified === true,
      testOrganizationWasAbsentAfterCleanup: cleanup.absent === true,
      exitCode: admin.exitCode,
      terminalWasRestored:
        admin.output.includes(enterAlternateScreen) &&
        admin.output.lastIndexOf(leaveAlternateScreen) > admin.output.indexOf(enterAlternateScreen),
      cleanedOnlyPlaygroundResources: beforeVolumes === afterVolumes && login.exitCode === 0,
    };
  } finally {
    await execFile('docker', [
      'compose',
      '--project-name',
      'porta-admin-playground',
      '-f',
      resolve(playgroundRoot, 'compose.yml'),
      'down',
    ]).catch(() => undefined);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
