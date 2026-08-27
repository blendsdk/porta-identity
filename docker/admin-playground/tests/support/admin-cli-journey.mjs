/** Packed CLI login and terminal smoke for the local administration playground. */

import { execFile as execFileCallback, spawn } from 'node:child_process';
import { X509Certificate, createHash } from 'node:crypto';
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

/** Launches `porta admin` in a real PTY and exits through its keyboard command. */
async function runPackedAdmin(cliBin, consumerDirectory, home) {
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
  child.stdout.on('data', (chunk) => {
    if (chunk.toString('utf8').includes('\u001b[6n')) child.stdin.write('\u001b[1;1R');
  });
  try {
    try {
      await waitForOutput(
        child,
        captured.output,
        (output) => output.includes('Authenticated') && output.includes(email),
        'Verified administrator shell',
      );
    } catch {
      throw new Error('Verified administrator shell was not observed.');
    }
    child.stdin.write('\u001bx');
    child.stdin.end();
    return await captured.result;
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
}

/** Runs the complete packed CLI journey without persisting its administrator password. */
export async function runAdminCliJourney({ playgroundRoot }) {
  const password = process.env.PORTA_ADMIN_PLAYGROUND_PASSWORD;
  if (!password)
    throw new Error('PORTA_ADMIN_PLAYGROUND_PASSWORD is required for the live journey.');
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'porta-admin-journey-'));
  const home = resolve(temporaryRoot, 'home');
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
    const admin = await runPackedAdmin(cliBin, consumerDirectory, home);
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
