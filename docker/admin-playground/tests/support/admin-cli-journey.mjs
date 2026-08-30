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
const f10 = '\u001b[21~';
const altOrganizations = '\u001bo';
const altUsers = '\u001bu';
const altApplications = '\u001ba';
const altClients = '\u001bc';
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
const userEmail = process.env.PORTA_ADMIN_TEST_USER_EMAIL;
const applicationName = process.env.PORTA_ADMIN_TEST_APPLICATION_NAME;
const applicationSlug = process.env.PORTA_ADMIN_TEST_APPLICATION_SLUG;
const moduleName = process.env.PORTA_ADMIN_TEST_MODULE_NAME;
const clientName = process.env.PORTA_ADMIN_TEST_CLIENT_NAME;
const redirectUri = process.env.PORTA_ADMIN_TEST_REDIRECT_URI;
if (
  !['assert-absent', 'wait-for-user', 'observe-features', 'cleanup'].includes(action) ||
  issuer !== 'https://porta-admin-playground.ci.portaidentity.com:3543' ||
  !/^[a-f0-9]{24}$/.test(nonce ?? '') ||
  slug !== 'porta-admin-e2e-' + nonce ||
  name !== 'Admin UI E2E ' + nonce ||
  userEmail !== 'admin-ui-e2e-' + nonce + '@porta.test' ||
  applicationName !== 'Admin UI App ' + nonce ||
  applicationSlug !== 'porta-admin-app-' + nonce ||
  moduleName !== 'Admin UI Module ' + nonce ||
  clientName !== 'Admin UI Client ' + nonce ||
  redirectUri !== 'https://app-' + nonce + '.example.test/callback'
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
let before = await client.organizations.listAll();
let matches = before.filter((organization) => organization.slug === slug);
if (action === 'assert-absent') {
  if (matches.length !== 0) throw new Error('Test organization slug is already present.');
  console.log(JSON.stringify({ absent: true }));
} else {
  const reconciliationDeadline = Date.now() + 5_000;
  while (matches.length === 0 && Date.now() < reconciliationDeadline) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    before = await client.organizations.listAll();
    matches = before.filter((organization) => organization.slug === slug);
  }
  if (matches.length !== 1 || matches[0].name !== name) {
    throw new Error('Test organization ownership could not be proved.');
  }
  if (action === 'wait-for-user') {
    let users = await client.users.list(matches[0].id, { page: 1, pageSize: 20 });
    let userMatches = users.data.filter((user) => user.email === userEmail);
    const userDeadline = Date.now() + 5_000;
    while (userMatches.length === 0 && Date.now() < userDeadline) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      users = await client.users.list(matches[0].id, { page: 1, pageSize: 20 });
      userMatches = users.data.filter((user) => user.email === userEmail);
    }
    if (userMatches.length !== 1 || userMatches[0].organizationId !== matches[0].id) {
      throw new Error('Test user creation could not be proved.');
    }
    console.log(JSON.stringify({ userPresent: true }));
  } else if (action === 'observe-features') {
    const featureDeadline = Date.now() + 5_000;
    let application;
    let module;
    let createdClient;
    while ((!application || !module || !createdClient) && Date.now() < featureDeadline) {
      const applications = await client.applications.listAll();
      application = applications.find((candidate) => candidate.slug === applicationSlug);
      if (application) {
        const modules = await client.applications.listModules(application.id);
        module = modules.find((candidate) => candidate.slug === 'module-' + nonce);
      }
      const clients = await client.clients.listAll({ organizationId: matches[0].id });
      createdClient = clients.find((candidate) => candidate.clientName === clientName);
      if (!application || !module || !createdClient) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      }
    }
    if (
      !application ||
      application.name !== applicationName ||
      !module ||
      module.name !== moduleName + ' Updated' ||
      module.description !== 'Edited in packed Admin UI' ||
      module.status !== 'inactive' ||
      !createdClient
    ) {
      throw new Error(
        'Admin UI feature creation could not be proved: ' +
        JSON.stringify({
          applicationFound: Boolean(application),
          applicationNameMatches: application?.name === applicationName,
          moduleFound: Boolean(module),
          moduleNameMatches: module?.name === moduleName + ' Updated',
          moduleDescriptionMatches: module?.description === 'Edited in packed Admin UI',
          moduleInactive: module?.status === 'inactive',
          clientFound: Boolean(createdClient),
        }),
      );
    }
    const secrets = await client.clients.listSecrets(createdClient.id);
    if (
      createdClient.organizationId !== matches[0].id ||
      createdClient.applicationId !== application.id ||
      secrets.length !== 1 ||
      secrets[0].clientId !== createdClient.id ||
      secrets[0].status !== 'active'
    ) {
      throw new Error('Admin UI application/client relationships are invalid.');
    }
    console.log(JSON.stringify({
      applicationId: application.id,
      applicationCreated: true,
      clientCreated: true,
      clientId: createdClient.id,
      moduleCreatedEditedAndDeactivated: true,
    }));
  } else {
    const usersBefore = await client.users.list(matches[0].id, { page: 1, pageSize: 20 });
    const userMatches = usersBefore.data.filter((user) => user.email === userEmail);
    if (userMatches.length > 1) throw new Error('More than one nonce-owned test user exists.');
    const unrelatedUserIds = usersBefore.data
      .filter((user) => user.email !== userEmail)
      .map((user) => user.id)
      .sort();
    if (unrelatedUserIds.length > 0) {
      throw new Error('Test organization contains an unrelated user.');
    }
    let userOwnershipVerified = false;
    if (userMatches.length === 1) {
      if (userMatches[0].organizationId !== matches[0].id) {
        throw new Error('Test user organization ownership could not be proved.');
      }
      userOwnershipVerified = true;
    }
    const unrelatedIds = before
      .filter((organization) => organization.slug !== slug)
      .map((organization) => organization.id)
      .sort();
    const applicationsBefore = await client.applications.listAll();
    const applicationMatches = applicationsBefore.filter(
      (application) => application.slug === applicationSlug,
    );
    if (
      applicationMatches.length > 1 ||
      (applicationMatches[0] && applicationMatches[0].name !== applicationName)
    ) {
      throw new Error('Test application ownership could not be proved.');
    }
    const application = applicationMatches[0];
    const modulesBefore = application
      ? await client.applications.listModules(application.id)
      : [];
    const moduleMatches = modulesBefore.filter((module) => module.slug === 'module-' + nonce);
    if (
      moduleMatches.length > 1 ||
      (moduleMatches[0] &&
        ![moduleName, moduleName + ' Updated'].includes(moduleMatches[0].name))
    ) {
      throw new Error('Test module ownership could not be proved.');
    }
    const clientsBefore = await client.clients.listAll({ organizationId: matches[0].id });
    const clientMatches = clientsBefore.filter((candidate) => candidate.clientName === clientName);
    if (
      clientMatches.length > 1 ||
      (clientMatches[0] && (!application || clientMatches[0].applicationId !== application.id))
    ) {
      throw new Error('Test client ownership could not be proved.');
    }
    const ownedClient = clientMatches[0];
    const secretsBefore = ownedClient ? await client.clients.listSecrets(ownedClient.id) : [];
    if (secretsBefore.some((secret) => secret.clientId !== ownedClient?.id)) {
      throw new Error('Test client-secret ownership could not be proved.');
    }
    await client.organizations.destroy(matches[0].id);
    const after = await client.organizations.listAll();
    if (after.some((organization) => organization.slug === slug)) {
      throw new Error('Test organization remains after cleanup.');
    }
    const usersAfter = await client.users.list(matches[0].id, { page: 1, pageSize: 20 });
    if (usersAfter.data.some((user) => user.email === userEmail)) {
      throw new Error('Test user remains after organization cleanup.');
    }
    const clientsAfter = await client.clients.listAll({ organizationId: matches[0].id });
    if (clientsAfter.some((candidate) => candidate.clientName === clientName)) {
      throw new Error('Test client remains after organization cleanup.');
    }
    if (application) await client.applications.archive(application.id);
    const archivedApplication = application ? await client.applications.get(application.id) : undefined;
    const modulesAfter = application ? await client.applications.listModules(application.id) : [];
    const remainingIds = after.map((organization) => organization.id).sort();
    if (JSON.stringify(remainingIds) !== JSON.stringify(unrelatedIds)) {
      throw new Error('Cleanup changed an unrelated organization.');
    }
    console.log(
      JSON.stringify({
        absent: true,
        ownershipVerified: true,
        userAbsent: true,
        userOwnershipVerified,
        clientAndSecretsAbsent: true,
          applicationArchived: archivedApplication?.data.status === 'archived' || !application,
          moduleDeactivated:
            !moduleMatches[0] ||
            modulesAfter.some(
              (module) => module.id === moduleMatches[0].id && module.status === 'inactive',
            ),
      }),
    );
  }
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
async function runPackedOrganizationCheck({
  action,
  consumerDirectory,
  home,
  name,
  nonce,
  slug,
  userEmail,
  applicationName,
  applicationSlug,
  moduleName,
  clientName,
  redirectUri,
}) {
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
        PORTA_ADMIN_TEST_USER_EMAIL: userEmail,
        PORTA_ADMIN_TEST_APPLICATION_NAME: applicationName,
        PORTA_ADMIN_TEST_APPLICATION_SLUG: applicationSlug,
        PORTA_ADMIN_TEST_MODULE_NAME: moduleName,
        PORTA_ADMIN_TEST_CLIENT_NAME: clientName,
        PORTA_ADMIN_TEST_REDIRECT_URI: redirectUri,
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
  user,
  feature,
  onCreateDispatch,
  onUserCreateDispatch,
  afterCreateDispatch,
  afterUserCreateDispatch,
  afterFeatureOperations,
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
  const plainIncludesAfter = (offset, value) =>
    captured
      .output()
      .slice(offset)
      .replaceAll(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
      .includes(value);
  const openTopMenu = async (index) => {
    const menuOffset = observeAfter();
    child.stdin.write(f10);
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(menuOffset, 'ho am I'),
      'Hamburger menu before top-menu navigation',
    );
    for (let position = 0; position < index; position += 1) {
      child.stdin.write('\u001b[C');
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 75));
    }
  };
  const advanceFocus = async (count) => {
    for (let position = 0; position < count; position += 1) {
      child.stdin.write('\t');
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
    }
  };
  child.stdout.on('data', (chunk) => {
    if (chunk.toString('utf8').includes('\u001b[6n')) child.stdin.write('\u001b[1;1R');
  });
  try {
    try {
      await waitForOutput(
        child,
        captured.output,
        (output) => output.includes('Cancel') && output.includes('eauthenticate'),
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
      () => includesAfter(offset, '░░░░'),
      'JSVision desktop repaint after chooser cancellation',
    );
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));

    offset = observeAfter();
    child.stdin.write(f10);
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'ho am I'),
      'Hamburger menu',
    );
    child.stdin.write('\r');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, email),
      'Verified identity dialog',
    );
    child.stdin.write('\r');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));

    offset = observeAfter();
    child.stdin.write(altApplications);
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'rowse applications'),
      'Applications menu without organization',
    );
    child.stdin.write('b');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Deployment-global') && includesAfter(offset, 'Loading applications'),
      'Global Applications workspace without organization',
    );

    offset = observeAfter();
    child.stdin.write(altOrganizations);
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'witch organization'),
      'Organizations menu for switching',
    );
    child.stdin.write('s');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Cancel') && includesAfter(offset, 'eauthenticate'),
      'Explicit organization chooser',
    );
    offset = observeAfter();
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    child.stdin.write(' ');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, '░░░░'),
      'Desktop repaint after explicit organization selection',
    );

    offset = observeAfter();
    child.stdin.write(altOrganizations);
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'reate organization'),
      'Organizations menu for creation',
    );
    child.stdin.write('c');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'efault locale'),
      'Create organization dialog',
    );
    offset = observeAfter();
    child.stdin.write(`${organization.name}\t${organization.slug}\t\t\r`);
    onCreateDispatch();
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, '░░░░'),
      'Desktop repaint after organization creation',
    );
    await afterCreateDispatch?.();
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));

    offset = observeAfter();
    child.stdin.write(altUsers);
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'reate user'),
      'Users menu',
    );
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    offset = observeAfter();
    child.stdin.write('c');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'onfirm'),
      'Create user dialog',
    );
    offset = observeAfter();
    child.stdin.write('\t');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
    child.stdin.write(`${user.email}\tE2E\tUser\t\t`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
    child.stdin.write('\r');
    onUserCreateDispatch();
    await afterUserCreateDispatch();
    // The SDK observation proves the server mutation completed. The user workspace is still hidden,
    // so the row can only appear below after the enabled Browse command successfully dispatches.
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));

    offset = observeAfter();
    child.stdin.write(altUsers);
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'rowse users'),
      'Restored Users menu',
    );
    offset = observeAfter();
    child.stdin.write('b');
    const userEmailLocalPart = user.email.slice(0, user.email.indexOf('@'));
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, userEmailLocalPart) && includesAfter(offset, 'active'),
      'Users browse result',
    );
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    offset = observeAfter();
    child.stdin.write('\r');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Password:') && includesAfter(offset, 'erify email'),
      'Created user detail',
    );

    offset = observeAfter();
    await openTopMenu(3);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    child.stdin.write('c');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Create application'),
      'Create application dialog',
    );
    offset = observeAfter();
    child.stdin.write(
      `${feature.applicationName}\t${feature.applicationSlug}\tPacked Admin UI journey\t\r`,
    );
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, feature.applicationName),
      'Admin UI-created application row',
    );
    offset = observeAfter();
    child.stdin.write('\r');
    await waitForOutput(
      child,
      captured.output,
      () => plainIncludesAfter(offset, 'Add module') && plainIncludesAfter(offset, 'No modules'),
      'Admin UI-created application detail',
    );
    offset = observeAfter();
    child.stdin.write('\u001bm');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Add module'),
      'Add module dialog',
    );
    offset = observeAfter();
    child.stdin.write(
      `${feature.moduleName} Updated\tmodule-${feature.nonce}\t\t\r`,
    );
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, `module-${feature.nonce.slice(0, 8)}`),
      'Admin UI-created module row',
    );
    offset = observeAfter();
    child.stdin.write('\r');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Edit module'),
      'Edit module dialog',
    );
    offset = observeAfter();
    child.stdin.write('\tEdited in packed Admin UI\t\r');
    await waitForOutput(
      child,
      captured.output,
      () => plainIncludesAfter(offset, 'Loading applications'),
      'Module edit reload',
    );
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
    offset = observeAfter();
    child.stdin.write('\t');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
    child.stdin.write('\t');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
    child.stdin.write(' ');
    await waitForOutput(
      child,
      captured.output,
      () => plainIncludesAfter(offset, 'Module:'),
      'Deactivate module confirmation',
    );
    offset = observeAfter();
    child.stdin.write('\r');
    await waitForOutput(
      child,
      captured.output,
      () => plainIncludesAfter(offset, 'Loading applications'),
      'Module deactivation reload',
    );
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));

    offset = observeAfter();
    await openTopMenu(4);
    await waitForOutput(
      child,
      captured.output,
      () => plainIncludesAfter(offset, 'OIDC Clients') && plainIncludesAfter(offset, 'client'),
      'OIDC Clients menu for creation',
    );
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    child.stdin.write('c');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Create OIDC client'),
      'Create OIDC client dialog',
    );
    offset = observeAfter();
    await advanceFocus(1);
    child.stdin.write(feature.clientName);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
    await advanceFocus(4);
    child.stdin.write(`initial-${feature.nonce}`);
    child.stdin.write('\u001br');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Redirect URIs'),
      'Client Redirects tab',
    );
    await advanceFocus(2);
    child.stdin.write(feature.redirectUri);
    await advanceFocus(1);
    child.stdin.write(' ');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    await advanceFocus(6);
    child.stdin.write(' ');
    await waitForOutput(
      child,
      captured.output,
      () => plainIncludesAfter(offset, 'Store this value now. It cannot be shown again.'),
      'Initial one-time client secret',
    );
    const featurePreparation = await afterFeatureOperations();
    offset = observeAfter();
    child.stdin.write('\r');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
    offset = observeAfter();
    await openTopMenu(4);
    child.stdin.write('b');
    await waitForOutput(
      child,
      captured.output,
      () => plainIncludesAfter(offset, feature.clientName),
      'Admin UI-created organization client row',
    );
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    offset = observeAfter();
    child.stdin.write('\r');
    await waitForOutput(
      child,
      captured.output,
      () => plainIncludesAfter(offset, 'Secrets') && plainIncludesAfter(offset, 'Deactivate'),
      'Organization client detail',
    );

    offset = observeAfter();
    child.stdin.write('\u001bs');
    await waitForOutput(
      child,
      captured.output,
      () =>
        plainIncludesAfter(offset, 'Secrets') &&
        plainIncludesAfter(offset, `initial-${feature.nonce}`),
      'Client secret metadata',
    );
    offset = observeAfter();
    child.stdin.write('\u001bg');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Generate client secret'),
      'Generate client secret dialog',
    );
    child.stdin.write('\r');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Store this value now. It cannot be shown again.'),
      'One-time client secret',
    );
    const oneTimeSecretMatches = captured
      .output()
      .slice(offset)
      .match(/[A-Za-z0-9_-]{64}/g);
    const observedOneTimeSecrets = new Set(oneTimeSecretMatches ?? []);
    const secretFrameOffset = observeAfter();
    child.stdin.write('\r');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(secretFrameOffset, 'Generate a modern secret'),
      'Secret metadata after one-time dismissal',
    );
    const secretPlaintextWasDisposed = [...observedOneTimeSecrets].every(
      (secret) => !captured.output().slice(secretFrameOffset).includes(secret),
    );
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
    offset = observeAfter();
    child.stdin.write('\u001br');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Revoke client secret'),
      'Revoke client secret confirmation',
    );
    child.stdin.write('\r');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'revoked'),
      'Revoked client secret metadata',
    );

    offset = observeAfter();
    await openTopMenu(4);
    await waitForOutput(
      child,
      captured.output,
      () => plainIncludesAfter(offset, 'OIDC Clients') && plainIncludesAfter(offset, 'client'),
      'OIDC Clients menu after secret management',
    );
    child.stdin.write('b');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, feature.clientName),
      'Organization client row after secret management',
    );
    offset = observeAfter();
    child.stdin.write('\r');
    await waitForOutput(
      child,
      captured.output,
      () => plainIncludesAfter(offset, 'Secrets') && plainIncludesAfter(offset, 'Deactivate'),
      'Client detail after secret management',
    );
    offset = observeAfter();
    child.stdin.write('\u001bb');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Configure OIDC client'),
      'Client Basic configuration dialog',
    );
    child.stdin.write('\r');
    await waitForOutput(
      child,
      captured.output,
      () => plainIncludesAfter(offset, 'Secrets') && plainIncludesAfter(offset, 'Deactivate'),
      'Authoritatively reloaded client detail',
    );

    offset = observeAfter();
    child.stdin.write(f10);
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'ho am I'),
      'Hamburger menu after client work',
    );
    child.stdin.write('\u001b[C');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'witch organization'),
      'Organization switch after client work',
    );
    child.stdin.write('s');
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'Cancel') && includesAfter(offset, 'eauthenticate'),
      'Organization chooser after client work',
    );
    offset = observeAfter();
    child.stdin.write('\u001b[B');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    child.stdin.write(' ');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
    offset = observeAfter();
    child.stdin.write(altApplications);
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'rowse applications'),
      'Global menu after client workspace was cleared by organization switch',
    );
    child.stdin.write('\u001b');

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    offset = observeAfter();
    child.stdin.write(altUsers);
    await waitForOutput(
      child,
      captured.output,
      () => includesAfter(offset, 'rowse users'),
      'Users menu after detail',
    );
    child.stdin.write('\u001b');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    child.stdin.write('\u001bx');
    child.stdin.end();
    const result = await captured.result;
    return {
      ...result,
      packedAdminProcessWasReaped: child.exitCode !== null,
      initialOrganizationChooserWasObservedAndCancelled: true,
      whoAmIProvedVerifiedEmail: true,
      organizationWasExplicitlySwitched: true,
      highEntropyOrganizationWasCreatedAndAutoSelected: true,
      usersWereBrowsed: true,
      userDetailWasOpened: true,
      nonceUserWasCreated: true,
      usersMenuWasRestored: true,
      applicationsWereOpenedWithoutOrganization: true,
      deploymentGlobalNoticeWasVisible: true,
      nonceApplicationWasCreated: featurePreparation.applicationCreated === true,
      nonceModuleWasCreatedEditedAndDeactivated:
        featurePreparation.moduleCreatedEditedAndDeactivated === true,
      organizationClientWasCreated: featurePreparation.clientCreated === true,
      clientConfigurationWasReloadedAuthoritatively: true,
      clientSecretMetadataWasListed: true,
      clientSecretWasGeneratedAndRevoked: true,
      secretPlaintextWasShownExactlyOnce: observedOneTimeSecrets.size === 1,
      secretPlaintextWasDisposedAfterDismissal: secretPlaintextWasDisposed,
      organizationSwitchClearedClientWorkspace: true,
    };
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await captured.result;
    }
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
  const testUser = { userEmail: `admin-ui-e2e-${nonce}@porta.test` };
  const testFeature = {
    applicationName: `Admin UI App ${nonce}`,
    applicationSlug: `porta-admin-app-${nonce}`,
    moduleName: `Admin UI Module ${nonce}`,
    clientName: `Admin UI Client ${nonce}`,
    redirectUri: `https://app-${nonce}.example.test/callback`,
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
      ...testUser,
      ...testFeature,
      nonce,
    });
    let createWasDispatched = false;
    let userCreateWasDispatched = false;
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
        { email: testUser.userEmail },
        { ...testFeature, nonce },
        () => {
          createWasDispatched = true;
        },
        () => {
          userCreateWasDispatched = true;
        },
        afterCreateDispatch,
        async () => {
          return runPackedOrganizationCheck({
            action: 'wait-for-user',
            consumerDirectory,
            home,
            ...testOrganization,
            ...testUser,
            ...testFeature,
            nonce,
          });
        },
        async () => {
          return runPackedOrganizationCheck({
            action: 'observe-features',
            consumerDirectory,
            home,
            ...testOrganization,
            ...testUser,
            ...testFeature,
            nonce,
          });
        },
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
            ...testUser,
            ...testFeature,
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
      whoAmIProvedVerifiedEmail: admin.whoAmIProvedVerifiedEmail,
      organizationWasExplicitlySwitched: admin.organizationWasExplicitlySwitched,
      highEntropyOrganizationWasCreatedAndAutoSelected:
        admin.highEntropyOrganizationWasCreatedAndAutoSelected,
      usersWereBrowsed: admin.usersWereBrowsed,
      userDetailWasOpened: admin.userDetailWasOpened,
      nonceUserWasCreated: userCreateWasDispatched && admin.nonceUserWasCreated,
      usersMenuWasRestored: admin.usersMenuWasRestored,
      applicationsWereOpenedWithoutOrganization:
        admin.applicationsWereOpenedWithoutOrganization,
      deploymentGlobalNoticeWasVisible: admin.deploymentGlobalNoticeWasVisible,
      nonceApplicationWasCreated: admin.nonceApplicationWasCreated,
      nonceModuleWasCreatedEditedAndDeactivated:
        admin.nonceModuleWasCreatedEditedAndDeactivated,
      organizationClientWasCreated: admin.organizationClientWasCreated,
      clientConfigurationWasReloadedAuthoritatively:
        admin.clientConfigurationWasReloadedAuthoritatively,
      clientSecretMetadataWasListed: admin.clientSecretMetadataWasListed,
      clientSecretWasGeneratedAndRevoked: admin.clientSecretWasGeneratedAndRevoked,
      secretPlaintextWasShownExactlyOnce: admin.secretPlaintextWasShownExactlyOnce,
      secretPlaintextWasDisposedAfterDismissal:
        admin.secretPlaintextWasDisposedAfterDismissal,
      organizationSwitchClearedClientWorkspace:
        admin.organizationSwitchClearedClientWorkspace,
      testOrganizationWasProvenAbsentBeforeCreate: absentBeforeCreate.absent === true,
      cleanupUsedIsolatedPackedSdkContext: true,
      cleanupVerifiedNonceOwnership: cleanup.ownershipVerified === true,
      cleanupVerifiedNonceUserOwnership: cleanup.userOwnershipVerified === true,
      testUserWasAbsentAfterCleanup: cleanup.userAbsent === true,
      testOrganizationWasAbsentAfterCleanup: cleanup.absent === true,
      testClientAndSecretsWereAbsentAfterCleanup: cleanup.clientAndSecretsAbsent === true,
      testModuleWasDeactivatedAfterCleanup: cleanup.moduleDeactivated === true,
      testApplicationWasArchivedAfterCleanup: cleanup.applicationArchived === true,
      exitCode: admin.exitCode,
      terminalWasRestored:
        admin.output.includes(enterAlternateScreen) &&
        admin.output.lastIndexOf(leaveAlternateScreen) >
          admin.output.lastIndexOf(enterAlternateScreen),
      alternateScreenWasEnteredExactlyOnce:
        admin.output.split(enterAlternateScreen).length - 1 === 1,
      alternateScreenWasLeftAfterJourneyAndCleanup:
        admin.output.lastIndexOf(leaveAlternateScreen) >
        admin.output.lastIndexOf(enterAlternateScreen),
      packedAdminProcessWasReaped: admin.packedAdminProcessWasReaped,
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
