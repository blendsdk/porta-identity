/** Operator documentation specifications for editable policy and external bootstrap secrets. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const publicGuides = ['docs/guide/environment.md', 'docs/guide/deployment.md'];
const propagationGuides = [...publicGuides, 'techdocs/reference/configuration.md'];

/** Independent catalog contract: key, native default, inclusive bounds or choice, unit and mode. */
const catalog = [
  ['access_token_ttl', '3600', '60..86400', 'seconds', 'restart-required'],
  ['id_token_ttl', '3600', '60..86400', 'seconds', 'restart-required'],
  ['refresh_token_ttl', '2592000', '300..31536000', 'seconds', 'restart-required'],
  ['authorization_code_ttl', '600', '30..3600', 'seconds', 'restart-required'],
  ['session_ttl', '86400', '300..2592000', 'seconds', 'restart-required'],
  ['magic_link_ttl', '900', '60..3600', 'seconds', 'runtime'],
  ['password_reset_ttl', '3600', '300..86400', 'seconds', 'runtime'],
  ['invitation_ttl', '604800', '300..2592000', 'seconds', 'runtime'],
  ['rate_limit_login_max', '10', '1..100', 'attempts', 'runtime'],
  ['rate_limit_login_window', '900', '60..86400', 'seconds', 'runtime'],
  ['rate_limit_magic_link_max', '5', '1..100', 'attempts', 'runtime'],
  ['rate_limit_magic_link_window', '900', '60..86400', 'seconds', 'runtime'],
  ['rate_limit_password_reset_max', '5', '1..100', 'attempts', 'runtime'],
  ['rate_limit_password_reset_window', '900', '60..86400', 'seconds', 'runtime'],
  ['max_failed_logins', '5', '1..100', 'attempts', 'runtime'],
  ['lockout_duration_seconds', '900', '60..604800', 'seconds', 'runtime'],
  ['audit_retention_days', '90', '1..3650', 'days', 'runtime'],
  ['default_locale', 'en', 'en', 'locale', 'runtime'],
];
const startupKeys = catalog.filter((row) => row[4] === 'restart-required').map((row) => row[0]);

/** Required external categories accept variable names or equivalent operator-facing labels. */
const externalCategories = [
  ['database URL', /database_url|(?:database|postgres(?:ql)?)[^|\n]{0,50}(?:url|connection)/i],
  ['Redis URL', /redis_url|redis[^|\n]{0,50}(?:url|connection)/i],
  ['issuer/bootstrap URL', /issuer|bootstrap[^|\n]{0,50}url/i],
  ['SMTP credentials', /smtp[^|\n]{0,80}(?:credentials?|password|username|user\b)/i],
  ['cookie keys', /cookie[^|\n]{0,50}(?:keys?|secrets?)/i],
  ['two-factor root key', /two_factor_encryption_key/i],
  ['signing root key', /signing_key_encryption_key/i],
];

/** Reads a document only when its observable documentation contract is tested. */
function document(path) {
  return readFileSync(resolve(repositoryRoot, path), 'utf8');
}

/** Removes presentation markup while preserving the words and numbers meaningful to operators. */
function plain(text) {
  return text.replace(/[`*]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Splits a Markdown row without requiring any particular column order. */
function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

/**
 * Collects ordinary Markdown tables, retaining nearby prose for external-boundary captions.
 * Separators distinguish tables from prose; row order and optional outer pipes are irrelevant.
 */
function tables(markdown) {
  const lines = markdown.split('\n');
  const result = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].includes('|')) continue;
    if (!cells(lines[index + 1]).every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    const headers = cells(lines[index]).map(plain);
    const context = lines.slice(Math.max(0, index - 6), index).join(' ');
    const rows = [];
    index += 2;
    while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
      rows.push(cells(lines[index]));
      index += 1;
    }
    result.push({ headers, rows, context });
    index -= 1;
  }
  return result;
}

/** Finds the one editable catalog table by a known key, not by an arbitrary heading sentence. */
function editableTable(markdown) {
  const matches = tables(markdown).filter((table) => table.rows.some((row) => row.some((cell) => plain(cell) === 'access_token_ttl')));
  assert.equal(matches.length, 1, 'one explicit editable operational-policy table is required');
  return matches[0];
}

/** Finds a semantic table column while allowing human-facing header variations. */
function column(table, pattern, label) {
  const index = table.headers.findIndex((header) => pattern.test(header));
  assert.notEqual(index, -1, `catalog table needs a ${label} column`);
  return index;
}

/** Converts equivalent inclusive-range typography to the same contract representation. */
function range(text) {
  return plain(text).replace(/,/g, '').replace(/\s*\(?inclusive\)?/g, '')
    .replace(/\s*(?:\.\.|[–—-]|\bto\b)\s*/g, '..').trim();
}

/** Checks propagation concepts within paragraphs, allowing reflow and alternative sentence wording. */
function paragraphs(markdown) {
  return markdown.split(/\n\s*\n/).map(plain);
}

/** Removes negative sentences so warnings against automatic propagation remain valid guidance. */
function affirmativeSentences(markdown) {
  return plain(markdown).split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/\b(?:not|no|never|without|cannot|can't|doesn't|don't)\b/.test(sentence)).join('\n');
}

for (const path of publicGuides) {
  // Both deployment and environment guidance must expose the same closed native policy catalog.
  test(`should document exactly 18 editable defaults, inclusive ranges, units and modes in ${path}`, () => {
    const table = editableTable(document(path));
    const keyIndex = column(table, /key|setting|parameter/, 'key');
    const defaultIndex = column(table, /default/, 'default');
    const rangeIndex = column(table, /range|allowed|bounds|validation|valid values/, 'range or allowed choices');
    const modeIndex = column(table, /mode|application|restart/, 'application mode');
    assert.deepEqual(table.rows.map((row) => plain(row[keyIndex])).sort(), catalog.map((row) => row[0]).sort());
    for (const [key, defaultValue, bounds, unit, mode] of catalog) {
      const row = table.rows.find((item) => plain(item[keyIndex]) === key);
      assert.equal(plain(row[defaultIndex]).replace(/,/g, ''), defaultValue, `${key}: native default`);
      if (key === 'default_locale') {
        assert.match(plain(row[rangeIndex]), /^(?:en(?: only)?|only en)$/);
      } else {
        assert.equal(range(row[rangeIndex]), bounds, `${key}: inclusive range`);
      }
      assert.match(plain(row.join(' ')), new RegExp(`\\b${unit}\\b`), `${key}: unit`);
      assert.match(plain(row[modeIndex]), mode === 'runtime' ? /^runtime\b/ : /^restart[- ]required\b/, `${key}: application mode`);
    }
  });

  // Bootstrap connections and root secrets remain external, in a table separate from editable policy.
  test(`should separate external bootstrap and secrets from editable policy in ${path}`, () => {
    const markdown = document(path);
    const editable = editableTable(markdown);
    const separate = tables(markdown).filter((table) => !table.rows.some((row) => row.some((cell) => plain(cell) === 'access_token_ttl')));
    const boundary = separate.find((table) => externalCategories.every(([, pattern]) => table.rows.some((row) => pattern.test(row.join(' ')))));
    assert.ok(boundary, 'a separate explicit external bootstrap/secrets table must contain every required category');
    const externalContext = plain(`${boundary.context} ${boundary.headers.join(' ')} ${boundary.rows.flat().join(' ')}`);
    assert.match(externalContext, /environment|\benv\b|secret[- ]manager/);
    assert.match(externalContext, /external|outside|not[^.]{0,100}(?:config|editable)|environment[- ]only|remain[^.]{0,80}(?:environment|secret)/);
    assert.equal(editable.rows.some((row) => /super_admin_user_id/.test(row.join(' '))), false);
  });

  // Configuration is not an arbitrary key-value CRUD store, and its administrator identity is internal.
  test(`should describe closed writes and exclude the internal administrator key in ${path}`, () => {
    const text = plain(document(path));
    assert.match(text, /closed[^.]{0,100}catalog|(?:only|exactly)[^.]{0,80}18[^.]{0,60}(?:keys|settings)/);
    assert.match(text, /(?:no|not|cannot|can't|never)[^.]{0,120}(?:arbitrary|creat\w*|delet\w*)|(?:arbitrary|creat\w*|delet\w*)[^.]{0,100}(?:not supported|not allowed|unavailable)/);
    assert.match(text, /superadminuserid|super_admin_user_id/);
    assert.match(text, /(?:internal|not editable|not exposed)[^.]{0,100}(?:super_admin_user_id|superadminuserid)|(?:super_admin_user_id|superadminuserid)[^.]{0,100}(?:internal|not editable|not exposed)/);
  });
}

for (const path of propagationGuides) {
  // A successful local mutation clears the saving process's cache, rather than waiting for its TTL.
  test(`should explain immediate local post-save visibility in ${path}`, () => {
    assert.ok(paragraphs(document(path)).some((text) =>
      /immediat\w*|right away/.test(text) && /save|updat|commit|chang/.test(text) &&
      /(?:local|current|same|saving|this)[^.]{0,60}(?:process|instance|server|cache)|locally|process-local/.test(text)),
    'successful saves must be immediately visible to the local process');
  });

  // Other healthy processes converge through the existing bounded local-cache lifetime, not a broadcast.
  test(`should bound other healthy instance convergence to 60 seconds in ${path}`, () => {
    assert.ok(paragraphs(document(path)).some((text) =>
      /(?:other|peer|remaining)[^.]{0,80}(?:instances?|processes?|servers?)/.test(text) &&
      /cache|converg|visible|observ|read|pick up/.test(text) &&
      /(?:at[- ]most|within|up to|no (?:more|longer) than|maximum(?: of)?)[^.]{0,65}\b60[- ]?(?:seconds?|s)\b|\b60[- ]seconds?[^.]{0,50}(?:maximum|at most)/.test(text)),
    'other healthy instances must observe runtime changes within the 60-second cache bound');
  });

  // The five provider-startup lifetimes require explicit activation on every server instance.
  test(`should require every instance to restart for five startup lifetimes in ${path}`, () => {
    const markdown = document(path);
    assert.ok(paragraphs(markdown).some((text) =>
      /restart/.test(text) && /(?:every|all)[^.]{0,70}(?:instances?|servers?|processes?)/.test(text)),
    'startup lifetime changes require restarting every Porta server instance');
    const text = plain(markdown);
    assert.ok(startupKeys.every((key) => text.includes(plain(key))) ||
      /(?:five|5)[^.]{0,60}(?:startup|start-up|provider|lifetime)|(?:startup|start-up)[^.]{0,60}(?:five|5)/.test(text),
    'guidance must identify the five startup keys or their explicitly counted group');
  });

  // Guidance must not promise automatic restart or instantaneous distributed invalidation.
  test(`should avoid automatic restart and instant distributed propagation claims in ${path}`, () => {
    const related = paragraphs(document(path)).filter((text) => /config|catalog|policy|lifetime|\bttl\b|cache/.test(text)).join('\n\n');
    const text = affirmativeSentences(related);
    assert.doesNotMatch(text, /automatic(?:ally)?[^\n]{0,70}restart|restart[^\n]{0,70}automatic(?:ally)?/);
    assert.doesNotMatch(text, /(?:instant(?:ly)?|immediat\w*)[^\n]{0,80}(?:distributed invalidation|cross-instance invalidation|all (?:server )?instances)|(?:distributed|cross-instance) invalidation[^\n]{0,60}(?:instant(?:ly)?|immediat\w*)/);
  });
}
