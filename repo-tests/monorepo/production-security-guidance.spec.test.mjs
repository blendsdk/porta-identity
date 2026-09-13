import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const documentationPaths = [
  'README.md',
  'docs/guide/environment.md',
  'docs/guide/deployment.md',
  'docs/cli/infrastructure.md',
  'docker/DOCKERHUB.md',
  'docs/database/migrations.md',
];

/**
 * Reads one published production-guidance document as UTF-8 text.
 *
 * @param {string} repositoryPath Repository-relative document path.
 * @returns {string} Document contents.
 */
function readRepositoryFile(repositoryPath) {
  return readFileSync(resolve(repositoryRoot, repositoryPath), 'utf8');
}

const documents = new Map(
  documentationPaths.map((repositoryPath) => [repositoryPath, readRepositoryFile(repositoryPath)]),
);

/** Join selected documentation surfaces for cross-document contract assertions. */
function joinedDocuments(paths = documentationPaths) {
  return paths.map((path) => documents.get(path)).join('\n');
}

/** Remove explicitly negative statements before scanning for unsafe recommendations. */
function affirmativeGuidance(markdown) {
  return markdown
    .split('\n')
    .filter((line) => !/\b(?:do not|does not|must not|never|avoid|not recommended)\b/i.test(line))
    .join('\n');
}

// Published guidance must consistently treat the two root keys as separate, external production secrets.
test('should document distinct 64-hex production root secrets with placeholder-only examples', () => {
  const secretGuides = joinedDocuments([
    'README.md',
    'docs/guide/environment.md',
    'docs/guide/deployment.md',
    'docker/DOCKERHUB.md',
  ]);

  assert.match(secretGuides, /SIGNING_KEY_ENCRYPTION_KEY/);
  assert.match(secretGuides, /TWO_FACTOR_ENCRYPTION_KEY/);
  assert.match(secretGuides, /(?:exactly\s+)?64[- ](?:character|digit)[^\n]*hex|64\s+hex/i);
  assert.match(
    secretGuides,
    /(?:SIGNING_KEY_ENCRYPTION_KEY|signing key)[\s\S]{0,300}(?:different|distinct|must not match)[\s\S]{0,300}(?:TWO_FACTOR_ENCRYPTION_KEY|two-factor|2FA)|(?:TWO_FACTOR_ENCRYPTION_KEY|two-factor|2FA)[\s\S]{0,300}(?:different|distinct|must not match)[\s\S]{0,300}(?:SIGNING_KEY_ENCRYPTION_KEY|signing key)/i,
  );
  assert.match(
    secretGuides,
    /SIGNING_KEY_ENCRYPTION_KEY\s*[:=]\s*["']?(?:<[^>]+>|\$\{[^}]+\}|(?:replace|your)[-_a-z0-9]+)/i,
  );
  assert.match(
    secretGuides,
    /TWO_FACTOR_ENCRYPTION_KEY\s*[:=]\s*["']?(?:<[^>]+>|\$\{[^}]+\}|(?:replace|your)[-_a-z0-9]+)/i,
  );

  for (const [path, markdown] of documents) {
    assert.doesNotMatch(
      markdown,
      /(?:SIGNING_KEY_ENCRYPTION_KEY|TWO_FACTOR_ENCRYPTION_KEY)\s*[:=]\s*["']?[a-f0-9]{64}(?:["'\s]|$)/i,
      `${path} must not publish a usable root encryption key`,
    );
    assert.doesNotMatch(
      affirmativeGuidance(markdown),
      /(?:root|encryption|signing|two-factor|2FA)[^\n]{0,100}(?:key|secret)[^\n]{0,80}(?:optional|same value|may match|stored in (?:the )?(?:database|PostgreSQL))/i,
      `${path} must not weaken root-secret separation or external storage`,
    );
  }

  assert.match(
    joinedDocuments(),
    /(?:root|encryption) (?:keys|secrets)[\s\S]{0,180}(?:outside|not stored in|must not be stored in)[^\n]{0,60}(?:PostgreSQL|database)/i,
  );
});

// Operator guidance must distinguish additive generation from destructive rotation and require fleet-wide activation checks.
test('should explain signing-key lifecycle, restart-all, and post-restart verification', () => {
  const commandGuides = joinedDocuments([
    'README.md',
    'docs/guide/deployment.md',
    'docs/cli/infrastructure.md',
    'docker/DOCKERHUB.md',
  ]);

  assert.match(
    commandGuides,
    /generate[\s\S]{0,240}(?:add|create)[^\n]{0,100}(?:another|additional|new)[^\n]{0,80}active/i,
  );
  assert.match(
    commandGuides,
    /generate[\s\S]{0,300}without[^\n]{0,100}(?:retir|deactivat)[^\n]{0,80}existing active/i,
  );
  assert.match(
    commandGuides,
    /rotate[\s\S]{0,240}(?:retir|deactivat)[^\n]{0,80}(?:all|every)[^\n]{0,80}active/i,
  );
  assert.match(
    commandGuides,
    /rotate[\s\S]{0,300}(?:creat|generat)[^\n]{0,80}(?:one|single|a new)[^\n]{0,80}active/i,
  );
  assert.match(commandGuides, /restart every running Porta instance/i);
  assert.match(commandGuides, /after (?:the )?restart(?:ing)?|after restarting/i);
  assert.match(
    commandGuides,
    /verify[^\n]{0,140}(?:committed[^\n]*active signing key|active signing key[^\n]*committed)/i,
  );

  for (const [path, markdown] of documents) {
    assert.doesNotMatch(
      affirmativeGuidance(markdown),
      /generate[^\n]{0,120}(?:retir|deactivat|replace)[^\n]{0,80}(?:all|existing) active|rotate[^\n]{0,120}(?:preserve|keep|without retir)[^\n]{0,80}active/i,
      `${path} must not invert generate and rotate lifecycle semantics`,
    );
    assert.doesNotMatch(
      affirmativeGuidance(markdown),
      /(?:restart (?:one|a single|the current) (?:Porta )?instance|hot[- ]reload|no restart (?:is )?required)/i,
      `${path} must not weaken restart-all guidance`,
    );
  }
});

// Migration guidance must describe the deployed encrypted-key schema without presenting later operations work as a prerequisite.
test('should describe current signing-key encryption and keep later operations work non-blocking', () => {
  const migrationGuide = documents.get('docs/database/migrations.md');
  const allGuides = joinedDocuments();

  assert.match(migrationGuide, /migration\s+0*28|\b0*28\b/i);
  assert.match(migrationGuide, /signing key[^\n]{0,120}encrypt|encrypt[^\n]{0,120}signing key/i);
  assert.doesNotMatch(
    migrationGuide,
    /future[^\n]{0,100}encrypt|encrypt[^\n]{0,100}(?:future|planned later)/i,
  );
  assert.match(
    allGuides,
    /(?:selective|selected|subset)[^\n]{0,100}(?:portab|export|import)[^\n]{0,140}(?:later|future|follow-up|separate)/i,
  );
  assert.match(
    allGuides,
    /(?:database|PostgreSQL)[- ]backed[^\n]{0,80}global config[^\n]{0,140}(?:later|future|follow-up|separate)|global config[^\n]{0,80}(?:database|PostgreSQL)[- ]backed[^\n]{0,140}(?:later|future|follow-up|separate)/i,
  );
  assert.match(allGuides, /(?:not (?:a )?blocker|does not block|non-blocking)/i);
});

// Production examples must not depend on development mail, loopback DNS, or automatic steady-state migrations.
test('should keep development infrastructure and automatic migrations out of production recommendations', () => {
  for (const [path, markdown] of documents) {
    assert.doesNotMatch(
      markdown,
      /ci\.portaidentity\.com/i,
      `${path} must not publish CI-only loopback DNS in production guidance`,
    );
    assert.doesNotMatch(
      affirmativeGuidance(markdown),
      /(?:production|deployment|deployed)[^\n]{0,120}(?:requires?|depends on|use|connect)[^\n]{0,80}MailHog|MailHog[^\n]{0,100}(?:required|dependency)[^\n]{0,60}(?:production|deployment)/i,
      `${path} must not make MailHog a production dependency`,
    );
    assert.doesNotMatch(
      affirmativeGuidance(markdown),
      /(?:automatically|on (?:every )?(?:application )?startup)[^\n]{0,100}(?:run|apply)[^\n]{0,60}migrations?|(?:run|apply)[^\n]{0,60}migrations?[^\n]{0,100}(?:automatically|on (?:every )?(?:application )?startup)/i,
      `${path} must not recommend automatic steady-state migrations`,
    );
  }
});
