/** Prospective operator documentation contracts for invitation languages, compatibility and rollout. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const customUi = 'docs/guide/custom-ui.md';
const configurationGuides = [
  'docs/guide/environment.md', 'docs/guide/deployment.md', 'techdocs/reference/configuration.md',
];

/** Read target documents only inside test callbacks, never while authoring or collecting this module. */
function document(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

/** Ignore harmless Markdown emphasis, links and wrapping while retaining identifiers and word order. */
function plain(markdown) {
  return markdown.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '')
    .replace(/[’‘]/g, "'").replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Keep major sections together with their small subsections, without imposing exact headings. */
function sections(markdown) {
  return markdown.split(/(?=^#{1,2}\s)/m).map(plain).filter(Boolean);
}

/** Check concepts together without prescribing a heading, paragraph wording or table layout. */
function hasSection(markdown, patterns) {
  return sections(markdown).some((text) => patterns.every((pattern) => pattern.test(text)));
}

/** Ordered semantic markers accept lists, tables, arrows and ordinary prose as precedence notation. */
function ordered(text, patterns) {
  let offset = 0;
  for (const pattern of patterns) {
    const match = text.slice(offset).match(pattern);
    if (!match) return false;
    offset += (match.index ?? 0) + match[0].length;
  }
  return true;
}

/** Warnings against a behavior are not affirmative promises that it exists. */
function affirmativeSentences(markdown) {
  return plain(markdown).split(/(?<=[.!?])\s+/).filter((text) =>
    !/\b(?:not|never|cannot|can't|doesn't|don't|won't)\b|\bno (?:automatic|runtime)\b/.test(text));
}

test('should document shipped English and Dutch with an unchanged English default', () => {
  const markdown = document(customUi);
  assert.ok(hasSection(markdown, [/\b(?:ship|bundl|packag|support)\w*\b/, /\ben\b/, /\bnl\b/, /english/, /dutch/]),
    'custom UI guidance must identify shipped English/en and Dutch/nl');
  assert.ok(hasSection(markdown, [/default[^.]{0,80}\ben\b|english[^.]{0,80}default/]),
    'the default language remains English');
});

for (const path of configurationGuides) {
  test(`should keep native global locale choices distinct from rendering normalization in ${path}`, () => {
    assert.ok(hasSection(document(path), [/default_locale/, /\ben\b/, /\bnl\b/, /canonical|native|exact|\bonly\b|allowed|choices/]),
      'global default_locale uses the canonical native en/nl choices');
    assert.ok(hasSection(document(path), [/default_locale/, /default[^.]{0,80}\ben\b|english[^.]{0,80}default/]),
      'global locale guidance must retain the English default');
  });
}

test('should distinguish invitation email selection from browser acceptance selection', () => {
  const markdown = document(customUi);
  const text = sections(markdown);
  assert.ok(text.some((section) => /email|preview/.test(section) && ordered(section, [
    /\b(?:explicit|supplied)\b|invitation (?:input|locale|language)/,
    /organi[sz]ation/, /global/, /\b(?:english|en)\b/,
  ])), 'email/preview order must be explicit invitation input, organization, global, then English');
  assert.ok(hasSection(markdown, [/email|preview/, /browser/, /\b(?:no|not|never|without|ignore|independent)\b/]),
    'email and preview language must not depend on browser preferences');
  assert.ok(text.some((section) => /accept|browser/.test(section) && ordered(section, [
    /browser/, /(?:stored|saved|invitation)[^.]{0,55}(?:locale|language)/,
    /organi[sz]ation/, /global/, /\b(?:english|en)\b/,
  ])), 'valid acceptance order must be browser, stored invitation, organization, global, then English');
});

test('should explain regional rendering fallback without rewriting stored invitation values', () => {
  const markdown = document(customUi);
  assert.ok(hasSection(markdown, [/regional|nl-nl/, /normali[sz]|base[- ]language|base language/, /render|display/]),
    'regional invitation tags are normalized for rendering');
  assert.ok(hasSection(markdown, [/unsupported|unrecognized|unknown/, /fall(?:s|ing)? (?:back|through)|fallback|skip|continu/, /organi[sz]ation|global/]),
    'unsupported invitation input must continue through the fallback chain');
  assert.ok(hasSection(markdown, [/stored|persist/, /explicit/, /\bnull\b/, /unchanged|preserv|not[^.]{0,70}(?:rewrit|overwrit|normali[sz])/]),
    'stored explicit and null invitation locale values must remain unchanged');
});

test('should document baseline rejection authority and CSRF before invitation lookup', () => {
  const markdown = document(customUi);
  assert.ok(hasSection(markdown, [
    /invalid|unknown/, /expir/, /used|consum|replay/, /foreign|cross[- ]tenant|another (?:tenant|organi[sz]ation)/,
    /conflict/, /late|acceptance[^.]{0,60}null/, /baseline/,
    /(?:no|without|not|discard|ignore|exclude)[^.]{0,100}invitation|invitation[^.]{0,100}(?:not|ignored|excluded)/,
  ]), 'every generic rejection, including a late rejection, must exclude invitation language authority');
  assert.ok(sections(markdown).some((section) => /csrf/.test(section) && (
    /csrf[^.]{0,100}(?:before|prior to)[^.]{0,80}(?:lookup|look up|read)/.test(section) ||
    /(?:lookup|look up|read)[^.]{0,100}(?:after|until)[^.]{0,80}csrf/.test(section) ||
    /after[^.]{0,40}csrf[^.]{0,80}(?:lookup|look up|read)/.test(section) ||
    /(?:failed|invalid|missing)[^.]{0,40}csrf[^.]{0,100}(?:no|without)[^.]{0,50}(?:lookup|look up|read)/.test(section)
  )), 'CSRF validation must precede invitation lookup');
});

for (const [path, field] of [
  ['docs/api/users.md', /\blocale\b/], ['docs/cli/users.md', /--locale\b/],
]) {
  test(`should document the existing invitation locale input without a new closed enum in ${path}`, () => {
    const markdown = document(path);
    assert.ok(hasSection(markdown, [/invit/, field, /language|locale/]),
      'invitation guidance must retain the existing locale field or CLI option');
    const guidance = sections(markdown).filter((section) => /invit/.test(section));
    assert.ok(guidance.some((section) => /render|fallback|fall(?:s)? (?:back|through)|normali[sz]/.test(section)) ||
      /custom-ui(?:\.md)?(?:#|\))/.test(markdown),
    'invitation input must explain rendering selection or link to the custom UI language guidance');
    const claims = affirmativeSentences(guidance.join('\n'));
    assert.equal(claims.some((sentence) => !/default_locale/.test(sentence) &&
      /(?:\blocale\b|--locale)[^.]{0,100}(?:must be|must match|only accepts?|restricted to|\benum\b)[^.]{0,80}\b(?:en|nl)\b/.test(sentence)), false,
    'invitation locale is not a new en/nl-only API validation enum');
  });
}

test('should retain independent custom email templates and all legacy context variables', () => {
  const markdown = document(customUi);
  assert.ok(hasSection(markdown, [/html/, /plain[- ]?text/, /independen|separate/, /override|lookup|fallback/]),
    'tenant HTML and plaintext template lookup/fallback remain independent');
  const context = sections(markdown).filter((section) => /template|context|variable/.test(section)).join(' ');
  for (const variable of ['userName', 'inviteUrl', 'orgName', 'expiresIn', 'branding', 'locale', 'personalMessage', 'inviterName', 'year']) {
    assert.ok(new RegExp(`\\b${variable.toLowerCase()}\\b`).test(context), `legacy template variable ${variable} remains documented`);
  }
  assert.ok(hasSection(markdown, [/invitationcopy/, /strings?/, /ordinary|plain|not[^.]{0,50}(?:html|markup)/]),
    'invitationCopy contains ordinary strings, not executable template or HTML content');
});

test('should preserve hardcoded tenant copy and literal names, brands and messages', () => {
  const markdown = document(customUi);
  assert.ok(hasSection(markdown, [/hard[- ]?coded|static copy/, /translat/, /not|never|unchanged|retain/]),
    'localized defaults do not automatically translate hardcoded custom-template copy');
  assert.ok(hasSection(markdown, [/names?/, /brand/, /personal messages?/, /literal|untranslated|not[^.]{0,70}translat/]),
    'names, branding and personal messages remain literal data');
});

test('should require source bundles, an allowlist update, tests and a rebuild to install another language', () => {
  const markdown = document(customUi);
  assert.ok(hasSection(markdown, [/complete/, /source/, /pack|bundle|namespace|translation/, /supported_locales/, /\btests?\b/, /(?:re)?build/, /deploy|release/]),
    'new languages need complete source content, SUPPORTED_LOCALES, tests, build and deployment');
  assert.equal(affirmativeSentences(markdown).some((sentence) => /mount|volume/.test(sentence) &&
    /automatic|without[^.]{0,40}(?:re)?build|no (?:re)?build|runtime[^.]{0,50}install/.test(sentence)), false,
  'mounting files must not be advertised as automatic runtime language installation');
});

test('should require all instances and assets to be upgraded before enabling global Dutch', () => {
  const candidates = sections(document('docs/guide/deployment.md'));
  assert.ok(candidates.some((section) => /assets?|bundles?|packs?/.test(section) && (
    ordered(section, [/(?:upgrad|deploy)[^.]{0,80}(?:all|every)[^.]{0,60}(?:instances?|servers?)/, /default_locale|global/, /\bnl\b/]) ||
    ordered(section, [/before/, /default_locale|global/, /\bnl\b/, /(?:upgrad|deploy)[^.]{0,80}(?:all|every)[^.]{0,60}(?:instances?|servers?)/]) ||
    ordered(section, [/default_locale|global/, /\bnl\b/, /only after/, /(?:all|every)[^.]{0,70}(?:instances?|servers?)[^.]{0,70}upgrad/])
  )), 'global Dutch must be enabled only after every server instance and its assets are upgraded');
  assert.ok(candidates.some((section) => /mixed|rolling|versions?/.test(section) && /temporar|during/.test(section) &&
    /language[- ]only|only[^.]{0,40}language|language[^.]{0,50}differ/.test(section)),
  'rolling upgrades may temporarily differ in displayed language');
});

test('should restore English and confirm read-driven cache convergence before downgrade', () => {
  const candidates = sections(document('docs/guide/deployment.md')).filter((section) => /rollback|downgrad/.test(section));
  assert.ok(candidates.some((section) => /default_locale|global/.test(section) && (
    ordered(section, [/restor|set|switch|return/, /\ben\b|english/, /confirm|verify|ensure/, /downgrad/]) ||
    ordered(section, [/before[^.]{0,40}downgrad/, /restor|set|switch|return/, /\ben\b|english/, /confirm|verify|ensure/])
  ) && /converg|propagat|(?:all|every)[^.]{0,60}(?:instances?|servers?)/.test(section)),
  'restore global en and verify convergence before downgrading any instance');
  assert.ok(candidates.some((section) => /cache/.test(section) && /\b60(?:[- ]seconds?|\s*s\b)/.test(section) &&
    /read[- ]driven|next read|read[^.]{0,80}expir|expir[^.]{0,80}read/.test(section)),
  'rollback checks must account for the existing 60-second read-driven cache');
  assert.ok(candidates.some((section) => /older|old[- ]version|previous version/.test(section) &&
    /authoritative|api reads?/.test(section) && /runtime[^.]{0,60}fallback/.test(section) &&
    /not (?:proof|evidence)|does not (?:prove|mean|guarantee)|insufficient|cannot prove/.test(section)),
  'runtime English fallback does not prove older authoritative reads can safely handle stored nl');
});

test('should keep locale rollout an operator action rather than promise automatic configuration changes', () => {
  const related = sections(document('docs/guide/deployment.md'))
    .filter((section) => /default_locale/.test(section) && /rollback|rollout|downgrad|upgrad/.test(section));
  assert.ok(related.length > 0, 'locale rollout and rollback guidance must exist');
  assert.equal(affirmativeSentences(related.join('\n')).some((sentence) =>
    /automatic(?:ally)?[^.]{0,70}(?:set|switch|chang)[^.]{0,70}default_locale|default_locale[^.]{0,80}automatic(?:ally)?/.test(sentence)), false,
  'operators must control global language activation and rollback');
});
