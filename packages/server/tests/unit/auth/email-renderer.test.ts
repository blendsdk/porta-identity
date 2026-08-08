import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

// Mock node:fs/promises — controls template file resolution and reading
vi.mock('node:fs/promises', () => ({
  default: {
    access: vi.fn(),
    readFile: vi.fn(),
  },
}));

// Mock Handlebars — controls template compilation
vi.mock('handlebars', () => ({
  default: {
    compile: vi.fn(),
  },
}));

// Mock logger — suppress output during tests
vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import fs from 'node:fs/promises';
import Handlebars from 'handlebars';
import { renderEmail } from '../../../src/auth/email-renderer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Track which paths are "accessible" (exist on the filesystem) */
let accessiblePaths: Set<string>;

/** Map of file paths to their content */
let fileContents: Map<string, string>;

/**
 * Set up the mock filesystem for template resolution.
 * @param paths - Map of file path suffixes to their content
 */
function mockFs(paths: Record<string, string>) {
  accessiblePaths = new Set(Object.keys(paths));
  fileContents = new Map(Object.entries(paths));

  // fs.access resolves if the path "exists", rejects otherwise
  (fs.access as ReturnType<typeof vi.fn>).mockImplementation(async (filePath: string) => {
    // Check if any registered path suffix matches
    for (const registeredPath of accessiblePaths) {
      if (filePath.endsWith(registeredPath)) return;
    }
    throw new Error(`ENOENT: no such file or directory, access '${filePath}'`);
  });

  // fs.readFile returns the matching content
  (fs.readFile as ReturnType<typeof vi.fn>).mockImplementation(async (filePath: string) => {
    for (const [registeredPath, content] of fileContents) {
      if (filePath.endsWith(registeredPath)) return content;
    }
    throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
  });
}

/**
 * Set up Handlebars.compile to return a template function that
 * wraps the source in a predictable output for assertions.
 */
function mockHandlebars() {
  (Handlebars.compile as ReturnType<typeof vi.fn>).mockImplementation((source: string) => {
    // Return a template function that includes source + context info
    return (context: Record<string, unknown>) => {
      return `rendered:${source}:${JSON.stringify(context)}`;
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('email-renderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandlebars();
  });

  describe('renderEmail', () => {
    it('should render HTML template from the default directory', async () => {
      // Only the default HTML template exists
      mockFs({
        'default/emails/magic-link.hbs': '<h1>Magic Link</h1>',
      });

      const result = await renderEmail('magic-link', 'acme-corp', { userName: 'Alice' });

      // HTML should be rendered
      expect(result.html).toContain('rendered:');
      expect(result.html).toContain('<h1>Magic Link</h1>');
      // Verify context includes the enriched year field
      expect(result.html).toContain('"year"');
    });

    it('should prefer org-specific template over default', async () => {
      // Both org-specific and default templates exist
      mockFs({
        'acme-corp/emails/magic-link.hbs': '<h1>Acme Magic Link</h1>',
        'default/emails/magic-link.hbs': '<h1>Default Magic Link</h1>',
      });

      const result = await renderEmail('magic-link', 'acme-corp', {});

      // Should use the org-specific template, not the default
      expect(result.html).toContain('Acme Magic Link');
      expect(result.html).not.toContain('Default Magic Link');
    });

    it('should render plaintext template when it exists', async () => {
      mockFs({
        'default/emails/welcome.hbs': '<h1>Welcome</h1>',
        'default/emails/welcome.txt.hbs': 'Welcome, {{userName}}!',
      });

      const result = await renderEmail('welcome', 'acme-corp', { userName: 'Bob' });

      // Both HTML and text should be rendered
      expect(result.html).toContain('rendered:');
      expect(result.text).toContain('rendered:');
      expect(result.text).toContain('Welcome, {{userName}}!');
    });

    it('should return empty text when plaintext template is missing', async () => {
      // Only HTML template exists — no .txt.hbs variant
      mockFs({
        'default/emails/password-reset.hbs': '<h1>Reset</h1>',
      });

      const result = await renderEmail('password-reset', 'acme-corp', {});

      expect(result.html).toContain('rendered:');
      expect(result.text).toBe('');
    });

    it('should throw when neither org nor default HTML template exists', async () => {
      // No templates exist at all
      mockFs({});

      await expect(
        renderEmail('nonexistent', 'acme-corp', {}),
      ).rejects.toThrow('Email template not found: nonexistent.hbs');
    });

    it('should enrich context with current year', async () => {
      mockFs({
        'default/emails/welcome.hbs': '<footer>{{year}}</footer>',
      });

      const result = await renderEmail('welcome', 'acme-corp', {});

      // The rendered context should contain the current year
      const currentYear = new Date().getFullYear();
      expect(result.html).toContain(`"year":${currentYear}`);
    });

    it('should pass all context variables through to templates', async () => {
      mockFs({
        'default/emails/magic-link.hbs': 'template-source',
      });

      const context = {
        userName: 'Alice',
        magicLinkUrl: 'https://example.com/auth/magic-link?token=abc',
        expiresMinutes: 15,
        branding: { logoUrl: '', primaryColor: '#3B82F6', companyName: 'Acme' },
        locale: 'en',
      };

      const result = await renderEmail('magic-link', 'acme-corp', context);

      // All context fields should be present in the rendered output
      expect(result.html).toContain('userName');
      expect(result.html).toContain('Alice');
      expect(result.html).toContain('magicLinkUrl');
      expect(result.html).toContain('branding');
    });

    it('should compile templates via Handlebars.compile', async () => {
      mockFs({
        'default/emails/invitation.hbs': '<p>You are invited</p>',
      });

      await renderEmail('invitation', 'acme-corp', {});

      // Verify Handlebars.compile was called with the template source
      expect(Handlebars.compile).toHaveBeenCalledWith('<p>You are invited</p>');
    });

    it('should resolve org-specific plaintext template independently', async () => {
      // HTML from default, but plaintext from org-specific
      mockFs({
        'default/emails/welcome.hbs': '<h1>Default HTML</h1>',
        'acme-corp/emails/welcome.txt.hbs': 'Org-specific plaintext',
      });

      const result = await renderEmail('welcome', 'acme-corp', {});

      // HTML from default
      expect(result.html).toContain('Default HTML');
      // Text from org-specific
      expect(result.text).toContain('Org-specific plaintext');
    });

    it('should handle different template names correctly', async () => {
      mockFs({
        'default/emails/password-changed.hbs': '<p>Your password was changed</p>',
        'default/emails/password-changed.txt.hbs': 'Your password was changed.',
      });

      const result = await renderEmail('password-changed', 'some-org', {});

      expect(result.html).toContain('password was changed');
      expect(result.text).toContain('password was changed');
    });
  });
});
