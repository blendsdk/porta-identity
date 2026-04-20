/**
 * VitePress configuration for the Porta documentation website.
 *
 * Uses the withMermaid wrapper from vitepress-plugin-mermaid to enable
 * Mermaid diagram rendering in Markdown content. The site is designed
 * to deploy to GitHub Pages at https://blendsdk.github.io/porta-identity/.
 *
 * @see https://vitepress.dev/reference/site-config
 */
import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    // Site metadata
    title: 'Porta',
    description:
      'Multi-tenant OIDC Provider — Authentication, User Management, RBAC & Custom Claims',

    // Base path for GitHub Pages: https://blendsdk.github.io/porta-identity/
    // Change to '/' if using a custom domain
    base: '/porta-identity/',

    // Enable last updated timestamps (git-based)
    lastUpdated: true,

    // Clean URLs — no .html extension
    cleanUrls: true,

    // Head tags (favicon, social cards)
    head: [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: '/porta-identity/logo.svg' }],
      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:title', content: 'Porta — Multi-tenant OIDC Provider' }],
      [
        'meta',
        {
          property: 'og:description',
          content: 'Authentication, User Management, RBAC & Custom Claims',
        },
      ],
    ],

    themeConfig: {
      // Logo in the navigation bar
      logo: '/logo.svg',

      // Top navigation bar
      nav: [
        { text: 'Guide', link: '/guide/quickstart' },
        { text: 'CLI', link: '/cli/' },
        { text: 'API', link: '/api/' },
        { text: 'Integration', link: '/integration/' },
        { text: 'Concepts', link: '/concepts/multi-tenancy' },
      ],

      // Sidebar navigation (per section)
      sidebar: {
        '/guide/': [
          {
            text: 'Getting Started',
            items: [
              { text: 'Quickstart', link: '/guide/quickstart' },
              { text: 'Architecture', link: '/guide/architecture' },
            ],
          },
          {
            text: 'Configuration',
            items: [
              { text: 'Environment Variables', link: '/guide/environment' },
              { text: 'Production Deployment', link: '/guide/deployment' },
            ],
          },
          {
            text: 'Help',
            items: [{ text: 'FAQ', link: '/guide/faq' }],
          },
        ],
        '/cli/': [
          {
            text: 'CLI Reference',
            items: [
              { text: 'Overview', link: '/cli/' },
              { text: 'Bootstrap Commands', link: '/cli/bootstrap' },
              { text: 'Admin Commands', link: '/cli/admin' },
            ],
          },
        ],
        '/api/': [
          {
            text: 'Admin API',
            items: [
              { text: 'Overview', link: '/api/' },
              { text: 'Organizations', link: '/api/organizations' },
              { text: 'Applications', link: '/api/applications' },
              { text: 'Clients', link: '/api/clients' },
              { text: 'Users', link: '/api/users' },
              { text: 'System', link: '/api/system' },
            ],
          },
        ],
        '/integration/': [
          {
            text: 'Integration Guides',
            items: [
              { text: 'Overview', link: '/integration/' },
              { text: 'SPA Applications', link: '/integration/spa' },
              { text: 'Server-Side Apps', link: '/integration/server-side' },
              { text: 'Mobile Apps', link: '/integration/mobile' },
              { text: 'Claims & RBAC', link: '/integration/claims-rbac' },
            ],
          },
        ],
        '/concepts/': [
          {
            text: 'Concepts',
            items: [
              { text: 'Multi-Tenancy', link: '/concepts/multi-tenancy' },
              { text: 'OIDC Primer', link: '/concepts/oidc' },
              { text: 'RBAC Model', link: '/concepts/rbac' },
              { text: 'Two-Factor Auth', link: '/concepts/two-factor' },
              { text: 'Security Model', link: '/concepts/security' },
            ],
          },
        ],
      },

      // Social links
      socialLinks: [{ icon: 'github', link: 'https://github.com/blendsdk/porta-identity' }],

      // Built-in local search (MiniSearch)
      search: {
        provider: 'local',
      },

      // "Edit this page" links
      editLink: {
        pattern: 'https://github.com/blendsdk/porta-identity/edit/main/docs/:path',
        text: 'Edit this page on GitHub',
      },

      // Footer
      footer: {
        message: 'Built with VitePress',
        copyright: '© BlendSDK',
      },

      // Last updated display
      lastUpdated: {
        text: 'Last updated',
      },
    },
  })
)
