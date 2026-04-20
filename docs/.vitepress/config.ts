import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

// https://vitepress.dev/reference/site-config
export default withMermaid(
  defineConfig({
    title: 'Porta',
    description:
      'Multi-tenant OIDC Provider — Authentication, User Management, RBAC & Custom Claims',
    base: '/porta-identity/',
    head: [['link', { rel: 'icon', href: '/porta-identity/logo.svg' }]],

    // Ignore dead-link warnings for anchor-only links used in sidebars
    ignoreDeadLinks: 'localhostLinks',

    themeConfig: {
      logo: '/logo.svg',

      // ── Top navigation bar ──────────────────────────────────
      nav: [
        { text: 'Guide', link: '/guide/quickstart' },
        { text: 'Concepts', link: '/concepts/multi-tenancy' },
        { text: 'Admin API', link: '/api/overview' },
        { text: 'CLI', link: '/cli/overview' },
        { text: 'Database', link: '/database/schema' },
      ],

      // ── Sidebar (multi-sidebar keyed by path prefix) ────────
      sidebar: {
        '/guide/': [
          {
            text: 'Getting Started',
            items: [
              { text: 'Quick Start', link: '/guide/quickstart' },
              { text: 'Environment Variables', link: '/guide/environment' },
              { text: 'Architecture', link: '/guide/architecture' },
            ],
          },
          {
            text: 'Operations',
            items: [
              { text: 'Deployment', link: '/guide/deployment' },
              { text: 'FAQ', link: '/guide/faq' },
            ],
          },
        ],

        '/concepts/': [
          {
            text: 'Core Concepts',
            items: [
              { text: 'Multi-Tenancy', link: '/concepts/multi-tenancy' },
              { text: 'OIDC & Authentication', link: '/concepts/oidc' },
              { text: 'RBAC & Permissions', link: '/concepts/rbac' },
              { text: 'Custom Claims', link: '/concepts/custom-claims' },
              { text: 'Two-Factor Auth', link: '/concepts/two-factor' },
              { text: 'Login Methods', link: '/concepts/login-methods' },
            ],
          },
        ],

        '/api/': [
          {
            text: 'Admin API Reference',
            items: [
              { text: 'Overview', link: '/api/overview' },
              { text: 'Authentication', link: '/api/authentication' },
            ],
          },
          {
            text: 'Endpoints',
            items: [
              { text: 'Organizations', link: '/api/organizations' },
              { text: 'Applications', link: '/api/applications' },
              { text: 'Clients', link: '/api/clients' },
              { text: 'Users', link: '/api/users' },
              { text: 'Roles & Permissions', link: '/api/rbac' },
              { text: 'Custom Claims', link: '/api/custom-claims' },
              { text: 'Configuration', link: '/api/config' },
              { text: 'Signing Keys', link: '/api/keys' },
              { text: 'Audit Log', link: '/api/audit' },
            ],
          },
        ],

        '/cli/': [
          {
            text: 'CLI Reference',
            items: [
              { text: 'Overview', link: '/cli/overview' },
              { text: 'Bootstrap & Auth', link: '/cli/bootstrap' },
              { text: 'Organizations', link: '/cli/organizations' },
              { text: 'Applications', link: '/cli/applications' },
              { text: 'Clients', link: '/cli/clients' },
              { text: 'Users', link: '/cli/users' },
              { text: 'Infrastructure', link: '/cli/infrastructure' },
            ],
          },
        ],

        '/database/': [
          {
            text: 'Database',
            items: [
              { text: 'Schema Overview', link: '/database/schema' },
              { text: 'Migrations', link: '/database/migrations' },
            ],
          },
        ],
      },

      // ── Social links ────────────────────────────────────────
      socialLinks: [
        {
          icon: 'github',
          link: 'https://github.com/blendsdk/porta-identity',
        },
      ],

      // ── Search ──────────────────────────────────────────────
      search: {
        provider: 'local',
      },

      // ── Footer ──────────────────────────────────────────────
      footer: {
        message: 'Released under the MIT License.',
        copyright: 'Copyright © 2024-present TrueSoftware B.V.',
      },

      // ── Edit link ───────────────────────────────────────────
      editLink: {
        pattern:
          'https://github.com/blendsdk/porta-identity/edit/main/docs/:path',
        text: 'Edit this page on GitHub',
      },
    },

    // ── Mermaid plugin options ─────────────────────────────────
    mermaid: {
      theme: 'neutral',
    },
  }),
);
