# Seed Data Specification: ERP RBAC & Custom Claims

> **Document**: 03-seed-data.md
> **Parent**: [Index](00-index.md)

## Overview

Replace the current minimal seed data with a realistic ERP (Enterprise Resource Planning) application scenario. This makes the playgrounds demonstrate real-world RBAC and custom claims usage.

## ERP Role Definitions

5 roles covering different departments/functions:

| Slug | Name | Description | Permissions Assigned |
|------|------|-------------|---------------------|
| `erp-admin` | ERP Administrator | Full system access — manages all modules | All 10 permissions |
| `finance-manager` | Finance Manager | Financial operations and reporting | erp:invoices:read, erp:invoices:write, erp:reports:read |
| `warehouse-operator` | Warehouse Operator | Inventory and order fulfillment | erp:inventory:read, erp:inventory:write, erp:orders:read |
| `sales-rep` | Sales Representative | Customer orders and invoice viewing | erp:orders:read, erp:orders:write, erp:invoices:read |
| `hr-specialist` | HR Specialist | Employee record management | erp:employees:read, erp:employees:write |

## ERP Permission Definitions

10 permissions organized by ERP module:

| Slug | Name | Description |
|------|------|-------------|
| `erp:invoices:read` | View Invoices | Access to view invoice records |
| `erp:invoices:write` | Manage Invoices | Create, edit, and approve invoices |
| `erp:orders:read` | View Orders | Access to view sales/purchase orders |
| `erp:orders:write` | Manage Orders | Create and edit orders |
| `erp:inventory:read` | View Inventory | Access to view stock levels |
| `erp:inventory:write` | Manage Inventory | Adjust stock, manage warehouses |
| `erp:employees:read` | View Employees | Access to view employee records |
| `erp:employees:write` | Manage Employees | Create, edit employee records |
| `erp:reports:read` | View Reports | Access to financial and operational reports |
| `erp:settings:manage` | System Settings | Manage ERP system configuration |

## Custom Claim Definitions

4 per-user profile attributes typical for an ERP system:

| Claim Name | Type | Description | Include In |
|-----------|------|-------------|------------|
| `department` | string | Department name | id_token, access_token, userinfo |
| `employee_id` | string | Employee identifier (e.g., EMP-001) | id_token, access_token, userinfo |
| `cost_center` | string | Cost center code (e.g., CC-1000) | id_token, access_token, userinfo |
| `job_title` | string | Job title / position | id_token, access_token, userinfo |

## User Assignments

All 5 active test users get unique role + claims combinations:

| User | Org | Role | Department | Employee ID | Cost Center | Job Title |
|------|-----|------|-----------|-------------|-------------|-----------|
| user@no2fa.local | No 2FA Org | erp-admin | Engineering | EMP-001 | CC-1000 | Platform Engineer |
| user@email2fa.local | Email 2FA Org | finance-manager | Finance | EMP-042 | CC-2000 | Finance Manager |
| user@totp2fa.local | TOTP 2FA Org | warehouse-operator | Logistics | EMP-099 | CC-3000 | Warehouse Lead |
| user@optional2fa.local | Optional 2FA Org | sales-rep | Sales | EMP-155 | CC-4000 | Account Executive |
| user@thirdparty.local | Third-Party Org | hr-specialist | Human Resources | EMP-200 | CC-5000 | HR Business Partner |

## Implementation Details

### Code Changes in `scripts/playground-seed.ts`

Replace the three constant arrays at the top of the file:

```typescript
/** RBAC role definitions for the shared Playground ERP application. */
const ROLE_DEFS = [
  { slug: 'erp-admin', name: 'ERP Administrator', description: 'Full system access', 
    permissions: ['erp:invoices:read', 'erp:invoices:write', 'erp:orders:read', 'erp:orders:write', 
                  'erp:inventory:read', 'erp:inventory:write', 'erp:employees:read', 'erp:employees:write', 
                  'erp:reports:read', 'erp:settings:manage'] },
  { slug: 'finance-manager', name: 'Finance Manager', description: 'Financial operations and reporting', 
    permissions: ['erp:invoices:read', 'erp:invoices:write', 'erp:reports:read'] },
  { slug: 'warehouse-operator', name: 'Warehouse Operator', description: 'Inventory and order fulfillment', 
    permissions: ['erp:inventory:read', 'erp:inventory:write', 'erp:orders:read'] },
  { slug: 'sales-rep', name: 'Sales Representative', description: 'Customer orders and invoice viewing', 
    permissions: ['erp:orders:read', 'erp:orders:write', 'erp:invoices:read'] },
  { slug: 'hr-specialist', name: 'HR Specialist', description: 'Employee record management', 
    permissions: ['erp:employees:read', 'erp:employees:write'] },
];

/** RBAC permission definitions — the union of all role permissions. */
const PERMISSION_DEFS = [
  { slug: 'erp:invoices:read', name: 'View Invoices', description: 'Access to view invoice records' },
  { slug: 'erp:invoices:write', name: 'Manage Invoices', description: 'Create, edit, and approve invoices' },
  { slug: 'erp:orders:read', name: 'View Orders', description: 'Access to view sales/purchase orders' },
  { slug: 'erp:orders:write', name: 'Manage Orders', description: 'Create and edit orders' },
  { slug: 'erp:inventory:read', name: 'View Inventory', description: 'Access to view stock levels' },
  { slug: 'erp:inventory:write', name: 'Manage Inventory', description: 'Adjust stock, manage warehouses' },
  { slug: 'erp:employees:read', name: 'View Employees', description: 'Access to view employee records' },
  { slug: 'erp:employees:write', name: 'Manage Employees', description: 'Create, edit employee records' },
  { slug: 'erp:reports:read', name: 'View Reports', description: 'Access to financial and operational reports' },
  { slug: 'erp:settings:manage', name: 'System Settings', description: 'Manage ERP system configuration' },
];

/** Custom claim definitions for the shared application. */
const CLAIM_DEFS = [
  { claimName: 'department', claimType: 'string' as const, description: 'Department name' },
  { claimName: 'employee_id', claimType: 'string' as const, description: 'Employee identifier' },
  { claimName: 'cost_center', claimType: 'string' as const, description: 'Cost center code' },
  { claimName: 'job_title', claimType: 'string' as const, description: 'Job title / position' },
];
```

### Update USERS Array — Assignments

Update each user definition's `assignRoles` and `claims` fields:

```typescript
// user@no2fa.local — ERP Admin, Engineering
assignRoles: ['erp-admin'],
claims: { department: 'Engineering', employee_id: 'EMP-001', cost_center: 'CC-1000', job_title: 'Platform Engineer' },

// user@email2fa.local — Finance Manager
assignRoles: ['finance-manager'],
claims: { department: 'Finance', employee_id: 'EMP-042', cost_center: 'CC-2000', job_title: 'Finance Manager' },

// user@totp2fa.local — Warehouse Operator
assignRoles: ['warehouse-operator'],
claims: { department: 'Logistics', employee_id: 'EMP-099', cost_center: 'CC-3000', job_title: 'Warehouse Lead' },

// user@optional2fa.local — Sales Rep
assignRoles: ['sales-rep'],
claims: { department: 'Sales', employee_id: 'EMP-155', cost_center: 'CC-4000', job_title: 'Account Executive' },

// user@thirdparty.local — HR Specialist
assignRoles: ['hr-specialist'],
claims: { department: 'Human Resources', employee_id: 'EMP-200', cost_center: 'CC-5000', job_title: 'HR Business Partner' },
```

## Expected Token Payload (user@no2fa.local)

After login, the ID token will contain:

```json
{
  "sub": "uuid-of-user",
  "name": "Active User",
  "given_name": "Active",
  "family_name": "User",
  "email": "user@no2fa.local",
  "email_verified": false,
  "roles": ["erp-admin"],
  "permissions": [
    "erp:invoices:read", "erp:invoices:write",
    "erp:orders:read", "erp:orders:write",
    "erp:inventory:read", "erp:inventory:write",
    "erp:employees:read", "erp:employees:write",
    "erp:reports:read", "erp:settings:manage"
  ],
  "department": "Engineering",
  "employee_id": "EMP-001",
  "cost_center": "CC-1000",
  "job_title": "Platform Engineer"
}
```
