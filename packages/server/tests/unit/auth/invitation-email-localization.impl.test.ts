/** Translation preparation keeps malformed override data and interpolation syntax out of copy. */
import fs from 'node:fs/promises';
import i18next from 'i18next';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n, prepareTranslationFunction } from '../../../src/auth/i18n.js';

/** Only tenant override file contents are replaced; i18next reads real packaged resources. */
const overrides = vi.hoisted(() => new Map<string, string>());

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(async (path: string) => {
      const resource = [...overrides].find(([suffix]) => path.endsWith(suffix));
      if (!resource) throw new Error('No fixture override');
      return resource[1];
    }),
  },
}));
vi.mock('../../../src/lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('prepared invitation translation boundaries', () => {
  beforeAll(async () => {
    await initI18n();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    overrides.clear();
  });

  it('should use packaged translations without filesystem overrides when no tenant is supplied', async () => {
    const translate = await prepareTranslationFunction('nl');
    expect(translate('emails.invitation.subject', { orgName: 'Acme' })).toBe(
      'U bent uitgenodigd voor Acme',
    );
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it.each([
    'null',
    '[]',
    '42',
    'true',
    '"not a namespace"',
    '{"invitation":{"subject":false}}',
    '{"invitation":{"subject":null}}',
    '{"invitation":{"subject":["not text"]}}',
  ])('should retain packaged text when an override has invalid shape %s', async (resource) => {
    overrides.set('/locales/email-boundary/nl/emails.json', resource);
    const translate = await prepareTranslationFunction('nl', 'email-boundary');
    expect(translate('emails.invitation.subject', { orgName: 'Acme' })).toBe(
      'U bent uitgenodigd voor Acme',
    );
  });

  it('should retain valid override leaves while falling back for malformed sibling values', async () => {
    overrides.set('/locales/email-boundary/nl/emails.json', JSON.stringify({
      invitation: { heading: 'Eigen kop', subject: 17 },
    }));
    const translate = await prepareTranslationFunction('nl', 'email-boundary');
    expect(translate('emails.invitation.heading')).toBe('Eigen kop');
    expect(translate('emails.invitation.subject', { orgName: 'Acme' })).toBe(
      'U bent uitgenodigd voor Acme',
    );
  });

  it('should interpolate repeated original placeholders without reinterpreting replacement data', async () => {
    overrides.set('/locales/email-boundary/nl/emails.json', JSON.stringify({
      invitation: { subject: '{{orgName}} / {{orgName}}' },
    }));
    const translate = await prepareTranslationFunction('nl', 'email-boundary');
    const name = "$& $$ $` $' {{inviterName}}";
    expect(translate('emails.invitation.subject', { orgName: name, inviterName: 'Beheerder' })).toBe(
      `${name} / ${name}`,
    );
  });

  it('should preserve template-shaped recipient data in packaged translations', async () => {
    const translate = await prepareTranslationFunction('nl');
    expect(translate('emails.invitation.greeting', {
      userName: 'Ada {{orgName}}', orgName: 'Acme',
    })).toBe('Beste Ada {{orgName}},');
  });

  it('should not interpolate inherited object properties into tenant copy', async () => {
    overrides.set('/locales/email-boundary/nl/emails.json', JSON.stringify({
      invitation: { subject: '{{toString}} {{constructor}}' },
    }));
    const translate = await prepareTranslationFunction('nl', 'email-boundary');
    expect(translate('emails.invitation.subject', {})).toBe('{{toString}} {{constructor}}');
  });

  it('should reject an unavailable packaged language before tenant file access', async () => {
    const common: unknown = structuredClone(i18next.getResourceBundle('nl', 'common'));
    if (typeof common !== 'object' || common === null || Array.isArray(common)) {
      throw new Error('Expected the shipped Dutch common bundle');
    }
    i18next.removeResourceBundle('nl', 'common');
    try {
      await expect(prepareTranslationFunction('nl', 'email-boundary')).rejects.toThrow(
        'Translation locale is not available',
      );
      expect(fs.readFile).not.toHaveBeenCalled();
    } finally {
      i18next.addResourceBundle('nl', 'common', common);
    }
  });
});
