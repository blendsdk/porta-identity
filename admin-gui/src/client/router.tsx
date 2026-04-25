/**
 * Route configuration for the admin GUI.
 * Defines all routes with breadcrumb metadata via `handle.breadcrumb`.
 * Stub page components are used as placeholders until entity pages
 * are implemented in sub-plans 2 and 3.
 */

import { createBrowserRouter } from 'react-router';
import { RequireAuth } from './components/RequireAuth';
import { AppShell } from './components/AppShell';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { NotFound } from './pages/NotFound';
import { StubPage } from './pages/StubPage';
import { AuditLog } from './pages/audit/AuditLog';
import { SessionList } from './pages/sessions/SessionList';
import { ConfigEditor } from './pages/config/ConfigEditor';
import { SigningKeys } from './pages/keys/SigningKeys';
import { ExportPage } from './pages/import-export/ExportPage';
import { ImportPage } from './pages/import-export/ImportPage';
import { SearchResults } from './pages/search/SearchResults';
import { GettingStarted } from './pages/wizard/GettingStarted';
import { AdminProfile } from './pages/profile/AdminProfile';
import { OrganizationList } from './pages/organizations/OrganizationList';
import { CreateOrganization } from './pages/organizations/CreateOrganization';
import { OrganizationDetail } from './pages/organizations/OrganizationDetail';
import { ApplicationList } from './pages/applications/ApplicationList';
import { CreateApplication } from './pages/applications/CreateApplication';
import { ApplicationDetail } from './pages/applications/ApplicationDetail';
import { ClientList } from './pages/clients/ClientList';
import { CreateClient } from './pages/clients/CreateClient';

/**
 * Application route tree.
 * Each route with `handle.breadcrumb` contributes to the breadcrumb trail.
 * Routes under RequireAuth require authentication; routes under AppShell
 * render within the sidebar + topbar layout.
 */
export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          // Dashboard (home)
          {
            path: '/',
            element: <Dashboard />,
            handle: { breadcrumb: 'Dashboard' },
          },

          // Organizations
          {
            path: '/organizations',
            handle: { breadcrumb: 'Organizations' },
            children: [
              { index: true, element: <OrganizationList /> },
              {
                path: ':orgId',
                element: <OrganizationDetail />,
                handle: { breadcrumb: 'Detail' },
              },
              {
                path: 'new',
                element: <CreateOrganization />,
                handle: { breadcrumb: 'Create' },
              },
            ],
          },

          // Applications
          {
            path: '/applications',
            handle: { breadcrumb: 'Applications' },
            children: [
              { index: true, element: <ApplicationList /> },
              {
                path: ':appId',
                element: <ApplicationDetail />,
                handle: { breadcrumb: 'Detail' },
              },
              {
                path: 'new',
                element: <CreateApplication />,
                handle: { breadcrumb: 'Create' },
              },
            ],
          },

          // Clients
          {
            path: '/clients',
            handle: { breadcrumb: 'Clients' },
            children: [
              { index: true, element: <ClientList /> },
              {
                path: ':clientId',
                element: <StubPage title="Client Detail" />,
                handle: { breadcrumb: 'Detail' },
              },
              {
                path: 'new',
                element: <CreateClient />,
                handle: { breadcrumb: 'Create' },
              },
            ],
          },

          // Users
          {
            path: '/users',
            handle: { breadcrumb: 'Users' },
            children: [
              { index: true, element: <StubPage title="Users" /> },
              {
                path: ':userId',
                element: <StubPage title="User Detail" />,
                handle: { breadcrumb: 'Detail' },
              },
              {
                path: 'invite',
                element: <StubPage title="Invite User" />,
                handle: { breadcrumb: 'Invite' },
              },
            ],
          },

          // Roles
          {
            path: '/roles',
            handle: { breadcrumb: 'Roles' },
            children: [
              { index: true, element: <StubPage title="Roles" /> },
              {
                path: ':roleId',
                element: <StubPage title="Role Detail" />,
                handle: { breadcrumb: 'Detail' },
              },
              {
                path: 'new',
                element: <StubPage title="Create Role" />,
                handle: { breadcrumb: 'Create' },
              },
            ],
          },

          // Permissions
          {
            path: '/permissions',
            handle: { breadcrumb: 'Permissions' },
            children: [
              { index: true, element: <StubPage title="Permissions" /> },
              {
                path: 'new',
                element: <StubPage title="Create Permission" />,
                handle: { breadcrumb: 'Create' },
              },
            ],
          },

          // Custom Claims
          {
            path: '/claims',
            handle: { breadcrumb: 'Custom Claims' },
            children: [
              { index: true, element: <StubPage title="Custom Claims" /> },
              {
                path: ':claimId',
                element: <StubPage title="Claim Detail" />,
                handle: { breadcrumb: 'Detail' },
              },
              {
                path: 'new',
                element: <StubPage title="Create Claim" />,
                handle: { breadcrumb: 'Create' },
              },
            ],
          },

          // Sessions
          {
            path: '/sessions',
            element: <SessionList />,
            handle: { breadcrumb: 'Sessions' },
          },

          // Audit Log
          {
            path: '/audit',
            element: <AuditLog />,
            handle: { breadcrumb: 'Audit Log' },
          },

          // Configuration
          {
            path: '/config',
            element: <ConfigEditor />,
            handle: { breadcrumb: 'Configuration' },
          },

          // Signing Keys
          {
            path: '/keys',
            element: <SigningKeys />,
            handle: { breadcrumb: 'Signing Keys' },
          },

          // Import / Export
          {
            path: '/import-export',
            handle: { breadcrumb: 'Import / Export' },
            children: [
              { index: true, element: <ExportPage /> },
              {
                path: 'import',
                element: <ImportPage />,
                handle: { breadcrumb: 'Import' },
              },
            ],
          },

          // Search Results
          {
            path: '/search',
            element: <SearchResults />,
            handle: { breadcrumb: 'Search Results' },
          },

          // Getting Started Wizard
          {
            path: '/getting-started',
            element: <GettingStarted />,
            handle: { breadcrumb: 'Getting Started' },
          },

          // Admin Profile
          {
            path: '/profile',
            element: <AdminProfile />,
            handle: { breadcrumb: 'Profile' },
          },

          // Catch-all for unknown routes
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);
