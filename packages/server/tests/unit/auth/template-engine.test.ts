import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// All mock objects are inline — vi.mock factories are hoisted and cannot
// reference top-level const variables.
// ---------------------------------------------------------------------------

// Mock node:fs/promises — controls template file loading
vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    readdir: vi.fn(),
    access: vi.fn(),
  },
}));

// Mock Handlebars — controls template compilation, partials, and helpers
vi.mock('handlebars', () => ({
  default: {
    compile: vi.fn(),
    registerPartial: vi.fn(),
    registerHelper: vi.fn(),
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
import { initTemplateEngine, renderPage } from '../../../src/auth/template-engine.js';
import type { TemplateContext } from '../../../src/auth/template-engine.js';

// ---------------------------------------------------------------------------
// Typed accessors for mocked modules
// ---------------------------------------------------------------------------

const mockedFs = vi.mocked(fs);
const mockedHandlebars = vi.mocked(Handlebars);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tracks accessible file paths for fs.access mock */
let accessiblePaths: Set<string>;

/**
 * Set up the mock filesystem for template engine tests.
 * @param files - Map of path suffixes to file content
 */
function mockFileSystem(files: Record<string, string>) {
  accessiblePaths = new Set(Object.keys(files));

  (mockedFs.readFile as ReturnType<typeof vi.fn>).mockImplementation(async (filePath: string) => {
    for (const [suffix, content] of Object.entries(files)) {
      if ((filePath as string).endsWith(suffix)) return content;
    }
    throw new Error(`ENOENT: no such file: ${filePath}`);
  });

  (mockedFs.readdir as ReturnType<typeof vi.fn>).mockImplementation(async (dirPath: string) => {
    // Return partial filenames if the dir looks like a partials directory
    if ((dirPath as string).includes('partials')) {
      return ['header.hbs', 'footer.hbs', 'flash-messages.hbs'];
    }
    return [];
  });

  (mockedFs.access as ReturnType<typeof vi.fn>).mockImplementation(async (filePath: string) => {
    for (const registeredPath of accessiblePaths) {
      if ((filePath as string).endsWith(registeredPath)) return;
    }
    throw new Error(`ENOENT: no such file, access '${filePath}'`);
  });
}

/** Build a standard TemplateContext for test assertions */
function buildTestContext(overrides: Partial<TemplateContext> = {}): TemplateContext {
  return {
    branding: {
      logoUrl: null,
      faviconUrl: null,
      primaryColor: '#3B82F6',
      companyName: 'Test Corp',
      customCss: null,
    },
    locale: 'en',
    t: (key: string) => key,
    csrfToken: 'test-csrf-token',
    orgSlug: 'test-org',
    ...overrides,
  };
}

/**
 * Initialize the template engine with mocked filesystem.
 * Sets up layout template, partials, and helpers.
 */
async function setupEngine() {
  // Set up file system with default templates
  mockFileSystem({
    'layouts/main.hbs': '<html><body>{{{body}}}</body></html>',
    'partials/header.hbs': '<header>Header</header>',
    'partials/footer.hbs': '<footer>Footer</footer>',
    'partials/flash-messages.hbs': '<div class="flash"></div>',
    'default/pages/login.hbs': '<form>Login Form</form>',
    'default/pages/consent.hbs': '<div>Consent Page</div>',
    'default/pages/error.hbs': '<div>Error Page</div>',
    'test-org/pages/login.hbs': '<form>Custom Org Login</form>',
  });

  // Make Handlebars.compile return a template function that wraps context
  (mockedHandlebars.compile as ReturnType<typeof vi.fn>).mockImplementation((source: string) => {
    return (context: Record<string, unknown>) => {
      // Simulate layout by replacing {{{body}}} with the body context
      if (source.includes('{{{body}}}') && context.body) {
        return source.replace('{{{body}}}', context.body as string);
      }
      return `compiled:${source}`;
    };
  });

  await initTemplateEngine();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('template-engine', () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // initTemplateEngine
  // -------------------------------------------------------------------------

  describe('initTemplateEngine', () => {
    it('should register all partials from the default partials directory', async () => {
      await setupEngine();

      // Should register header, footer, flash-messages partials
      expect(mockedHandlebars.registerPartial).toHaveBeenCalledWith('header', '<header>Header</header>');
      expect(mockedHandlebars.registerPartial).toHaveBeenCalledWith('footer', '<footer>Footer</footer>');
      expect(mockedHandlebars.registerPartial).toHaveBeenCalledWith(
        'flash-messages',
        '<div class="flash"></div>',
      );
    });

    it('should register the eq and year helpers', async () => {
      await setupEngine();

      expect(mockedHandlebars.registerHelper).toHaveBeenCalledWith('eq', expect.any(Function));
      expect(mockedHandlebars.registerHelper).toHaveBeenCalledWith('year', expect.any(Function));
    });

    it('should compile the base layout template', async () => {
      await setupEngine();

      // The first compile call should be for the layout
      expect(mockedHandlebars.compile).toHaveBeenCalledWith('<html><body>{{{body}}}</body></html>');
    });
  });

  // -------------------------------------------------------------------------
  // renderPage
  // -------------------------------------------------------------------------

  describe('renderPage', () => {
    it('should render a page from the default directory and return HTML', async () => {
      await setupEngine();

      const context = buildTestContext();
      const html = await renderPage('login', context);

      // The page content should be injected into the layout
      expect(html).toBeDefined();
      expect(typeof html).toBe('string');
    });

    it('should render page content and inject into layout', async () => {
      await setupEngine();

      // Use a non-overridden orgSlug to get the default template
      const context = buildTestContext({ orgSlug: 'no-override-org' });
      const html = await renderPage('login', context);

      // The layout wraps the page body
      expect(html).toContain('<html><body>');
      expect(html).toContain('</body></html>');
      // The default page content should be inside
      expect(html).toContain('compiled:<form>Login Form</form>');
    });

    it('should prefer org-specific template over default', async () => {
      await setupEngine();

      const context = buildTestContext({ orgSlug: 'test-org' });
      const html = await renderPage('login', context);

      // Should use the org-specific template
      expect(html).toContain('Custom Org Login');
      expect(html).not.toContain('Login Form');
    });

    it('should fall back to default when org template does not exist', async () => {
      await setupEngine();

      const context = buildTestContext({ orgSlug: 'other-org' });
      const html = await renderPage('consent', context);

      // Should use the default template
      expect(html).toContain('Consent Page');
    });

    it('should throw when page template is not found in any location', async () => {
      await setupEngine();

      const context = buildTestContext();

      await expect(renderPage('nonexistent', context)).rejects.toThrow(
        'Page template not found: nonexistent.hbs',
      );
    });

    it('should compile page templates via Handlebars.compile', async () => {
      await setupEngine();

      // Track compile calls after setup
      const compileCallsBefore = (mockedHandlebars.compile as ReturnType<typeof vi.fn>).mock.calls.length;

      const context = buildTestContext();
      await renderPage('login', context);

      // Should have an additional compile call for the page template
      const compileCallsAfter = (mockedHandlebars.compile as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(compileCallsAfter).toBeGreaterThan(compileCallsBefore);
    });

    it('should add pageTitle and year to the full context', async () => {
      // Set up a compile mock that captures context
      let capturedContext: Record<string, unknown> | null = null;

      mockFileSystem({
        'layouts/main.hbs': '<html>{{{body}}}</html>',
        'partials/header.hbs': '',
        'partials/footer.hbs': '',
        'partials/flash-messages.hbs': '',
        'default/pages/login.hbs': '<form>Login</form>',
      });

      (mockedHandlebars.compile as ReturnType<typeof vi.fn>).mockImplementation((source: string) => {
        return (context: Record<string, unknown>) => {
          capturedContext = context;
          if (source.includes('{{{body}}}') && context.body) {
            return source.replace('{{{body}}}', context.body as string);
          }
          return `compiled:${source}`;
        };
      });

      await initTemplateEngine();

      const context = buildTestContext();
      await renderPage('login', context);

      // The layout should receive pageTitle and year
      expect(capturedContext).toBeDefined();
      expect(capturedContext!.pageTitle).toBe('Login');
      expect(capturedContext!.year).toBe(new Date().getFullYear());
    });

    it('should capitalize and clean pageName for default pageTitle', async () => {
      let capturedContext: Record<string, unknown> | null = null;

      mockFileSystem({
        'layouts/main.hbs': '<html>{{{body}}}</html>',
        'partials/header.hbs': '',
        'partials/footer.hbs': '',
        'partials/flash-messages.hbs': '',
        'default/pages/forgot-password.hbs': '<div>Forgot</div>',
      });

      (mockedHandlebars.compile as ReturnType<typeof vi.fn>).mockImplementation((source: string) => {
        return (context: Record<string, unknown>) => {
          capturedContext = context;
          if (source.includes('{{{body}}}') && context.body) {
            return source.replace('{{{body}}}', context.body as string);
          }
          return `compiled:${source}`;
        };
      });

      await initTemplateEngine();

      const context = buildTestContext();
      await renderPage('forgot-password', context);

      // 'forgot-password' → 'Forgot password' (hyphen replaced with space, capitalized)
      expect(capturedContext!.pageTitle).toBe('Forgot password');
    });

    it('should pass full context including branding and CSRF to templates', async () => {
      let capturedContext: Record<string, unknown> | null = null;

      mockFileSystem({
        'layouts/main.hbs': '<html>{{{body}}}</html>',
        'partials/header.hbs': '',
        'partials/footer.hbs': '',
        'partials/flash-messages.hbs': '',
        'default/pages/login.hbs': '<form>Login</form>',
      });

      (mockedHandlebars.compile as ReturnType<typeof vi.fn>).mockImplementation((source: string) => {
        return (context: Record<string, unknown>) => {
          // Capture the page template context (not the layout)
          if (!source.includes('{{{body}}}')) {
            capturedContext = context;
          }
          if (source.includes('{{{body}}}') && context.body) {
            return source.replace('{{{body}}}', context.body as string);
          }
          return `compiled:${source}`;
        };
      });

      await initTemplateEngine();

      const context = buildTestContext({
        csrfToken: 'my-csrf-token',
        branding: {
          logoUrl: 'https://example.com/logo.png',
          faviconUrl: null,
          primaryColor: '#FF0000',
          companyName: 'My Corp',
          customCss: null,
        },
      });
      await renderPage('login', context);

      expect(capturedContext).toBeDefined();
      expect(capturedContext!.csrfToken).toBe('my-csrf-token');
      expect((capturedContext!.branding as Record<string, unknown>).primaryColor).toBe('#FF0000');
    });
  });
});
