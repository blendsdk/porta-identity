# Core Ownership Model

Porta is the identity layer for one multi-tenant SaaS platform. This page explains who owns what
before you create applications, modules, roles, permissions, or clients.

## How Porta models your SaaS

| Concept | Meaning |
| --- | --- |
| Porta deployment | One SaaS platform |
| Application | A global product, service, or authorization namespace shared across organizations |
| Application module | A global feature area within an application |
| Organization | A customer tenant |
| OIDC client | An organization-specific deployment or registration connected to one global application |
| Roles and permissions | Global definitions scoped to an application |
| User-role assignments | Tenant-specific assignments through organization-owned users |

Applications, application modules, roles, permissions, and claim definitions are
**deployment-global**: they are defined once and reused by every organization that uses the
application. Organizations own their users, their role assignments, their OIDC clients, and their
branding.

Clients are where tenancy enters the application model. A client is an organization-specific OIDC
registration connected to exactly one global application, and it carries deployment configuration
such as redirect URIs, client type, allowed origins, PKCE settings, client secrets, consent
requirements, and login-method overrides.

::: info Not a general-purpose directory
Porta is not modeled as an Entra-style directory where each tenant independently owns unrelated
application registrations. One deployment owns one catalog of applications; tenants connect to
that catalog through their own clients.
:::

## Why applications are global

Product modules, roles, permissions, and claim definitions are defined once per application and
shared consistently by customer organizations:

- One place to add a module or permission, so every organization receives the same model.
- Role slugs stay stable across tenants, so `admin` means the same product capability everywhere.
- The token claim contract stays uniform, because claim definitions belong to the application.
- No per-tenant copies to keep in sync when the product evolves.

## Example: one deployment, two customer organizations

```text
Porta deployment: BusinessSuite
├── Application: Customer Portal        (global product definition)
│   ├── Client: Acme Portal Web         (Acme organization)
│   └── Client: ExampleCo Portal Web    (ExampleCo organization)
└── Application: Management Console     (global product definition)
    ├── Roles and permissions           (global definitions)
    ├── Acme user-role assignments      (tenant-specific)
    └── ExampleCo user-role assignments (tenant-specific)
```

Both customers sign in to the same product applications. Each customer has its own client
registration, its own redirect URIs, and its own users and assignments.

::: warning Application changes affect every organization
Application lifecycle and schema changes — renaming an application, adding or removing modules,
or changing roles, permissions, or claim definitions — can affect every organization that uses
the application. Review the impact before you change a shared definition.
:::

## Where this shows up

- **Admin API and CLI**: application, module, role, permission, and claim-definition endpoints are
  application-scoped; client endpoints require both an organization and an application.
- **Database**: `applications`, `application_modules`, `roles`, `permissions`, and claim
  definitions have no organization column. Clients reference both an organization and an
  application, and user-role assignments link organization-owned users to global roles.
- **Provisioning (export and import)**: manifest categories select global application data by
  application slug. An organization scope controls which tenant data travels, but it does not turn
  applications into tenant-owned records.

## Related

- [Multi-Tenancy](./multi-tenancy.md) — how organizations are isolated
- [RBAC & Permissions](./rbac.md) — global roles and permissions with tenant assignments
- [Applications API](../api/applications.md)
- [Clients API](../api/clients.md)
- [Database Schema](../database/schema.md)
- [Environment Portability](../cli/provisioning.md)
