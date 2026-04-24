---
layout: home

hero:
  name: Porta
  text: Multi-tenant OIDC Provider
  tagline: Authentication, User Management, RBAC & Custom Claims — built on node-oidc-provider
  actions:
    - theme: brand
      text: Get Started
      link: /guide/quickstart
    - theme: alt
      text: Capabilities
      link: /concepts/capabilities
    - theme: alt
      text: View on GitHub
      link: https://github.com/blendsdk/porta-identity

features:
  - icon: 🏢
    title: Multi-Tenant by Design
    details: Path-based organization isolation with per-tenant OIDC endpoints, branding, and configuration.
    link: /concepts/multi-tenancy
  - icon: 🔐
    title: Standards-Compliant OIDC
    details: Built on node-oidc-provider with PKCE, Authorization Code flow, refresh tokens, and discovery.
    link: /concepts/architecture
  - icon: 🔑
    title: Flexible Login Methods
    details: Password and magic link authentication, configurable per organization and per client with inheritance.
    link: /concepts/authentication-modes
  - icon: 🛡️
    title: Two-Factor Authentication
    details: Email OTP, TOTP authenticator apps, and recovery codes with per-org policy enforcement.
    link: /concepts/authentication-modes#two-factor
  - icon: 🎨
    title: Customizable Login UI
    details: Per-org branding via API, custom CSS injection, or full Handlebars template override via Docker volume mount.
    link: /guide/custom-ui
  - icon: 👥
    title: User Management
    details: Full user lifecycle — registration, invitation, password reset, magic links, and status management.
    link: /api/users
  - icon: 🛡️
    title: RBAC & Custom Claims
    details: Application-scoped roles and permissions with type-validated custom claims injected into tokens.
    link: /concepts/rbac
  - icon: ⚡
    title: Admin CLI & REST API
    details: Full-featured CLI and JWT-authenticated API for managing organizations, apps, clients, users, and RBAC.
    link: /cli/overview
  - icon: 🖥️
    title: Admin GUI
    details: Web-based administration console with React SPA and secure BFF — OIDC authentication, session management, and API proxying.
    link: /guide/admin-gui
  - icon: 🔄
    title: Session Lifecycle & Cleanup
    details: Three-point lifecycle — explicit logout cascades tokens, natural expiry preserves refresh flows, opportunistic cleanup purges stale records.
    link: /concepts/session-lifecycle
---
