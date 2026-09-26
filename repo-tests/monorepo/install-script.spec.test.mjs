import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const installScriptPath = resolve(repositoryRoot, 'install-porta.sh');

/**
 * Reads a file as UTF-8 text.
 *
 * @param {string} absolutePath Absolute file path.
 * @returns {string} File contents.
 */
function readText(absolutePath) {
  return readFileSync(absolutePath, 'utf8');
}

/**
 * Runs the installer with the provided arguments without failing on a nonzero exit.
 *
 * @param {string[]} arguments_ Installer arguments.
 * @param {string} [stdin] Optional stdin content.
 * @returns {{status: number, stdout: string, stderr: string}} Captured result.
 */
function runInstaller(arguments_, stdin) {
  try {
    const stdout = execFileSync('bash', [installScriptPath, ...arguments_], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      input: stdin,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      status: typeof error.status === 'number' ? error.status : 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    };
  }
}

/**
 * Creates an isolated target directory for one installer run.
 *
 * @returns {string} Absolute temporary directory path.
 */
function makeTargetDirectory() {
  return mkdtempSync(join(tmpdir(), 'porta-install-'));
}

/** Parses the generated .env into a plain key/value map. */
function readGeneratedEnv(targetDirectory) {
  const lines = readText(join(targetDirectory, '.env')).split('\n');
  const entries = new Map();

  for (const line of lines) {
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator);
    let value = line.slice(separator + 1);
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    entries.set(key, value);
  }

  return entries;
}

/** Sets one line in the generated .env, replacing or appending it. */
function setEnvLine(targetDirectory, key, value) {
  const path = join(targetDirectory, '.env');
  const expression = new RegExp(`^${key}=.*$`, 'm');
  const replacement = `${key}=${value}`;
  const current = readText(path);
  writeFileSync(
    path,
    expression.test(current)
      ? current.replace(expression, replacement)
      : `${current}${replacement}\n`,
  );
}

/** Removes a key line from the generated .env. */
function removeEnvLine(targetDirectory, key) {
  const path = join(targetDirectory, '.env');
  const remaining = readText(path)
    .split('\n')
    .filter((line) => !line.startsWith(`${key}=`))
    .join('\n');
  writeFileSync(path, remaining);
}

test('should ship an executable bash installer with valid syntax and help output', () => {
  assert.equal(
    existsSync(installScriptPath),
    true,
    'install-porta.sh must exist at the repository root',
  );
  assert.match(
    readText(installScriptPath),
    /^#!\/usr\/bin\/env bash/,
    'installer must use a bash shebang',
  );
  assert.notEqual(statSync(installScriptPath).mode & 0o111, 0, 'installer must be executable');

  execFileSync('bash', ['-n', installScriptPath], { cwd: repositoryRoot, stdio: 'pipe' });

  const help = runInstaller(['--help']);
  assert.equal(help.status, 0, '--help must exit successfully');
  for (const flag of [
    '--issuer-url',
    '--port',
    '--bind',
    '--smtp-host',
    '--skip-smtp',
    '--no-start',
    '--force',
  ]) {
    assert.match(
      help.stdout,
      new RegExp(flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `--help must document ${flag}`,
    );
  }
});

test('should generate a valid standalone compose stack and hardened .env without Docker', () => {
  const targetDirectory = makeTargetDirectory();

  try {
    const result = runInstaller([
      '--non-interactive',
      '--no-start',
      '--dir',
      targetDirectory,
      '--port',
      '3457',
      '--issuer-url',
      'https://auth.example.com',
      '--smtp-host',
      'smtp.example.com',
      '--smtp-port',
      '587',
      '--smtp-from',
      'noreply@example.com',
      '--postgres-password',
      'TopSecretDatabasePassword',
    ]);

    assert.equal(result.status, 0, `installer failed: ${result.stderr}`);
    assert.equal(existsSync(join(targetDirectory, 'docker-compose.yml')), true);
    assert.equal(existsSync(join(targetDirectory, '.env')), true);

    const compose = parseYaml(readText(join(targetDirectory, 'docker-compose.yml')));
    assert.deepEqual(
      Object.keys(compose.services).sort(),
      ['mailhog', 'porta', 'postgres', 'redis'],
      'compose stack must contain porta, postgres, redis and the profiled mailhog',
    );
    assert.equal(compose.services.porta.image, '${PORTA_IMAGE:-blendsdk/porta:latest}');
    assert.match(
      compose.services.porta.ports[0],
      /\$\{BIND_ADDR:-0\.0\.0\.0\}:\$\{HOST_PORT:-3000\}:3000/,
    );
    assert.deepEqual(compose.services.mailhog.profiles, ['dev']);

    const env = readGeneratedEnv(targetDirectory);
    assert.equal(env.get('HOST_PORT'), '3457');
    assert.equal(env.get('BIND_ADDR'), '0.0.0.0');
    assert.equal(env.get('TRUST_PROXY'), 'true');
    assert.equal(env.get('TRUST_PROXY_HOPS'), '1');
    assert.equal(env.get('PORTA_AUTO_MIGRATE'), 'false');
    assert.equal(env.get('ISSUER_BASE_URL'), 'https://auth.example.com');
    assert.equal(env.get('SMTP_HOST'), 'smtp.example.com');
    assert.equal(env.get('POSTGRES_PASSWORD'), 'TopSecretDatabasePassword');
    assert.ok(
      (env.get('COOKIE_KEYS') ?? '').length >= 32,
      'cookie key must have at least 32 characters',
    );
    assert.match(env.get('TWO_FACTOR_ENCRYPTION_KEY') ?? '', /^[0-9a-f]{64}$/);
    assert.match(env.get('SIGNING_KEY_ENCRYPTION_KEY') ?? '', /^[0-9a-f]{64}$/);
    assert.notEqual(
      env.get('TWO_FACTOR_ENCRYPTION_KEY'),
      env.get('SIGNING_KEY_ENCRYPTION_KEY'),
      'the two root encryption keys must differ',
    );
    assert.doesNotMatch(readText(join(targetDirectory, '.env')), /CHANGE-ME|change-me|replace-/i);

    const fileMode = statSync(join(targetDirectory, '.env')).mode & 0o777;
    assert.equal(fileMode, 0o600, '.env must be readable by the owner only');

    assert.doesNotMatch(
      result.stdout,
      /TopSecretDatabasePassword/,
      'secrets must not be echoed to stdout',
    );
    assert.doesNotMatch(
      result.stdout,
      new RegExp(env.get('COOKIE_KEYS') ?? 'unlikely-marker'),
      'secrets must not be echoed to stdout',
    );
  } finally {
    rmSync(targetDirectory, { recursive: true, force: true });
  }
});

test('should skip SMTP with MailHog and honour a custom bind address', () => {
  const targetDirectory = makeTargetDirectory();

  try {
    const result = runInstaller([
      '--non-interactive',
      '--no-start',
      '--dir',
      targetDirectory,
      '--port',
      '3458',
      '--bind',
      '127.0.0.1',
      '--issuer-url',
      'https://auth.example.com',
      '--skip-smtp',
    ]);

    assert.equal(result.status, 0, `installer failed: ${result.stderr}`);
    const env = readGeneratedEnv(targetDirectory);
    assert.equal(env.get('SMTP_HOST'), 'mailhog');
    assert.equal(env.get('SMTP_PORT'), '1025');
    assert.equal(env.get('BIND_ADDR'), '127.0.0.1');
    assert.equal(env.get('SMTP_FROM'), 'noreply@auth.example.com');
  } finally {
    rmSync(targetDirectory, { recursive: true, force: true });
  }
});

test('should refuse to overwrite without --force and reject invalid input', () => {
  const targetDirectory = makeTargetDirectory();

  try {
    const baseArguments = [
      '--non-interactive',
      '--no-start',
      '--dir',
      targetDirectory,
      '--port',
      '3459',
      '--issuer-url',
      'https://auth.example.com',
      '--skip-smtp',
    ];

    assert.equal(runInstaller(baseArguments).status, 0);
    const firstEnv = readGeneratedEnv(targetDirectory);

    const overwrite = runInstaller(baseArguments);
    assert.notEqual(overwrite.status, 0, 'a second run must fail without --force');
    assert.match(overwrite.stderr, /--force/);

    const reused = runInstaller([
      '--non-interactive',
      '--no-start',
      '--force',
      '--dir',
      targetDirectory,
    ]);
    assert.equal(
      reused.status,
      0,
      `reinstall with no other flags must reuse saved answers: ${reused.stderr}`,
    );

    const reusedEnv = readGeneratedEnv(targetDirectory);
    for (const key of [
      'POSTGRES_PASSWORD',
      'COOKIE_KEYS',
      'SIGNING_KEY_ENCRYPTION_KEY',
      'ISSUER_BASE_URL',
      'HOST_PORT',
      'SMTP_HOST',
    ]) {
      assert.equal(reusedEnv.get(key), firstEnv.get(key), `reinstall must reuse ${key}`);
    }

    const fresh = runInstaller([...baseArguments, '--force', '--fresh']);
    assert.equal(fresh.status, 0, 'a --fresh --force run must succeed');
    const freshEnv = readGeneratedEnv(targetDirectory);
    assert.notEqual(
      freshEnv.get('SIGNING_KEY_ENCRYPTION_KEY'),
      reusedEnv.get('SIGNING_KEY_ENCRYPTION_KEY'),
      '--fresh must generate new secrets',
    );

    const invalidPort = runInstaller([
      '--non-interactive',
      '--no-start',
      '--dir',
      makeTargetDirectory(),
      '--port',
      '99999',
      '--issuer-url',
      'https://auth.example.com',
      '--skip-smtp',
    ]);
    assert.notEqual(invalidPort.status, 0, 'an out-of-range port must be rejected');

    const insecureIssuer = runInstaller([
      '--non-interactive',
      '--no-start',
      '--dir',
      makeTargetDirectory(),
      '--port',
      '3460',
      '--issuer-url',
      'http://auth.example.com',
      '--skip-smtp',
    ]);
    assert.notEqual(
      insecureIssuer.status,
      0,
      'plain HTTP for a remote host must be rejected without --allow-http',
    );
  } finally {
    rmSync(targetDirectory, { recursive: true, force: true });
  }
});

test('should report empty and missing values with --check', () => {
  const targetDirectory = makeTargetDirectory();

  try {
    const generated = runInstaller([
      '--non-interactive',
      '--no-start',
      '--dir',
      targetDirectory,
      '--port',
      '3471',
      '--issuer-url',
      'https://auth.example.com',
      '--smtp-host',
      'smtp.example.com',
      '--smtp-from',
      'noreply@example.com',
      '--smtp-user',
      'bob',
      '--smtp-pass',
      'secret',
    ]);
    assert.equal(generated.status, 0, generated.stderr);

    setEnvLine(targetDirectory, 'ADMIN_CORS_ORIGINS', '"https://admin.example.com"');
    removeEnvLine(targetDirectory, 'LOG_LEVEL');
    setEnvLine(targetDirectory, 'TRUST_PROXY_HOPS', '');

    const incomplete = runInstaller(['--check', '--dir', targetDirectory]);
    assert.equal(incomplete.status, 1, '--check must fail while values are missing');
    assert.match(incomplete.stdout, /missing\s+LOG_LEVEL/, 'deleted keys must be reported missing');
    assert.match(
      incomplete.stdout,
      /empty\s+TRUST_PROXY_HOPS/,
      'blank values must be reported empty',
    );
    assert.doesNotMatch(
      incomplete.stdout,
      /missing\s+ISSUER_BASE_URL/,
      'present keys must be reused',
    );

    setEnvLine(targetDirectory, 'LOG_LEVEL', 'info');
    setEnvLine(targetDirectory, 'TRUST_PROXY_HOPS', '1');

    const complete = runInstaller(['--check', '--dir', targetDirectory]);
    assert.equal(complete.status, 0, `--check must pass when complete:\n${complete.stdout}`);
  } finally {
    rmSync(targetDirectory, { recursive: true, force: true });
  }
});

test('should fill missing values non-interactively and preserve optional settings', () => {
  const targetDirectory = makeTargetDirectory();

  try {
    const generated = runInstaller([
      '--non-interactive',
      '--no-start',
      '--dir',
      targetDirectory,
      '--port',
      '3472',
      '--issuer-url',
      'https://auth.example.com',
      '--smtp-host',
      'smtp.example.com',
      '--smtp-from',
      'noreply@example.com',
    ]);
    assert.equal(generated.status, 0, generated.stderr);

    setEnvLine(targetDirectory, 'LOG_LEVEL', 'warn');
    setEnvLine(targetDirectory, 'METRICS_ENABLED', 'true');
    setEnvLine(targetDirectory, 'ADMIN_CORS_ORIGINS', '"https://admin.example.com"');
    setEnvLine(targetDirectory, 'TRUST_PROXY_HOPS', '');
    removeEnvLine(targetDirectory, 'SMTP_PORT');

    const result = runInstaller([
      '--non-interactive',
      '--no-start',
      '--force',
      '--dir',
      targetDirectory,
    ]);
    assert.equal(result.status, 0, result.stderr);

    const env = readGeneratedEnv(targetDirectory);
    assert.equal(env.get('TRUST_PROXY_HOPS'), '1', 'a blank key must be refilled with its default');
    assert.equal(env.get('SMTP_PORT'), '587', 'a deleted key must be refilled with its default');
    assert.equal(env.get('LOG_LEVEL'), 'warn', 'a saved optional setting must be preserved');
    assert.equal(env.get('METRICS_ENABLED'), 'true', 'a saved optional setting must be preserved');
    assert.equal(
      env.get('ADMIN_CORS_ORIGINS'),
      'https://admin.example.com',
      'a saved optional setting must be preserved',
    );
  } finally {
    rmSync(targetDirectory, { recursive: true, force: true });
  }
});

test('should ask only for keys missing from an existing .env', () => {
  const targetDirectory = makeTargetDirectory();

  try {
    const generated = runInstaller([
      '--non-interactive',
      '--no-start',
      '--dir',
      targetDirectory,
      '--port',
      '3473',
      '--issuer-url',
      'https://auth.example.com',
      '--smtp-host',
      'smtp.example.com',
      '--smtp-from',
      'noreply@example.com',
      '--smtp-user',
      'bob',
      '--smtp-pass',
      'secret',
    ]);
    assert.equal(generated.status, 0, generated.stderr);

    setEnvLine(targetDirectory, 'ADMIN_CORS_ORIGINS', '"https://admin.example.com"');
    removeEnvLine(targetDirectory, 'LOG_LEVEL');
    setEnvLine(targetDirectory, 'SMTP_PORT', '');

    let output;
    try {
      output = execFileSync(
        'script',
        [
          '-qec',
          `bash ${installScriptPath} --force --no-start --dir ${targetDirectory}`,
          '/dev/null',
        ],
        { encoding: 'utf8', input: '\n\n', stdio: ['pipe', 'pipe', 'pipe'] },
      );
    } catch (error) {
      if (error.code === 'ENOENT') {
        return;
      }
      output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }

    assert.match(output, /Log level/, 'the missing log level must be asked for');
    assert.match(output, /SMTP relay port/, 'the blank SMTP port must be asked for');
    assert.doesNotMatch(output, /Host interface to bind/, 'reused values must not be asked for');

    const env = readGeneratedEnv(targetDirectory);
    assert.equal(env.get('LOG_LEVEL'), 'info');
    assert.equal(env.get('SMTP_PORT'), '587');
    assert.equal(env.get('SMTP_USER'), 'bob', 'saved values must be kept');
  } finally {
    rmSync(targetDirectory, { recursive: true, force: true });
  }
});
