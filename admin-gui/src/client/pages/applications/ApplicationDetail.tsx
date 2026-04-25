/**
 * Application detail page.
 * Displays full application details with tabbed interface:
 * - Overview: name, slug, description, organization, status, dates
 * - Modules: toggle switches for application modules
 * - Clients: list of OIDC clients belonging to this application
 * - Roles: list of RBAC roles defined for this application
 * - Permissions: list of permissions defined for this application
 * - Claims: list of custom claim definitions for this application
 * - History: audit log filtered to this application
 *
 * Status lifecycle: active → archived (archive only, no reactivation)
 */

import { useState, useCallback, useMemo } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Input,
  Label,
  Textarea,
  Spinner,
  Badge,
  Switch,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  SaveRegular,
  ArchiveRegular,
} from '@fluentui/react-icons';
import { useParams, useNavigate } from 'react-router';
import {
  useApplication,
  useUpdateApplication,
  useArchiveApplication,
} from '../../api/applications';
import { useOrganization } from '../../api/organizations';
import { useClients } from '../../api/clients';
import { useRoles } from '../../api/roles';
import { usePermissions } from '../../api/permissions';
import { useClaimDefinitions } from '../../api/custom-claims';
import { useAuditLog } from '../../api/audit';
import { EntityDetailTabs, type EntityTab, type EntityAction } from '../../components/EntityDetailTabs';
import { StatusBadge } from '../../components/StatusBadge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TypeToConfirm } from '../../components/TypeToConfirm';
import { AuditTimeline, type TimelineEntry } from '../../components/AuditTimeline';
import type {
  Application,
  AuditEntry,
  Client,
  Role,
  Permission,
  ClaimDefinition,
} from '../../types';
import { api } from '../../api/client';

// ---------------------------------------------------------------------------
// Known module types — used by the Modules tab to show toggle switches.
// These correspond to the application_modules table and control what
// features/domains an application supports.
// ---------------------------------------------------------------------------
const KNOWN_MODULES: { type: string; label: string; description: string }[] = [
  { type: 'auth', label: 'Authentication', description: 'Login, magic link, password reset flows' },
  { type: 'rbac', label: 'RBAC', description: 'Role-based access control with roles & permissions' },
  { type: 'custom_claims', label: 'Custom Claims', description: 'Custom user claims/attributes' },
  { type: 'two_factor', label: 'Two-Factor Auth', description: 'TOTP, email OTP, recovery codes' },
];

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const useStyles = makeStyles({
  loading: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalM,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalM,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  fieldRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalL,
  },
  fieldRowItem: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: '140px 1fr',
    gap: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    alignItems: 'center',
  },
  infoLabel: {
    color: tokens.colorNeutralForeground3,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  moduleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  moduleInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  listEmpty: {
    padding: tokens.spacingVerticalL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
  },
});

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

/** Props for the overview tab */
interface OverviewTabProps {
  app: Application;
  orgName: string;
}

/**
 * Overview tab showing read-only application details:
 * name, slug, org, description, status, and timestamps.
 */
function OverviewTab({ app, orgName }: OverviewTabProps) {
  const styles = useStyles();

  return (
    <div className={styles.section}>
      <div className={styles.infoGrid}>
        <Text className={styles.infoLabel} size={200}>Name</Text>
        <Text weight="semibold">{app.name}</Text>

        <Text className={styles.infoLabel} size={200}>Slug</Text>
        <Text style={{ fontFamily: 'monospace' }}>{app.slug}</Text>

        <Text className={styles.infoLabel} size={200}>Organization</Text>
        <Text>{orgName}</Text>

        <Text className={styles.infoLabel} size={200}>Description</Text>
        <Text>{app.description || '—'}</Text>

        <Text className={styles.infoLabel} size={200}>Status</Text>
        <StatusBadge status={app.status} />

        <Text className={styles.infoLabel} size={200}>Modules</Text>
        <Text>{app.modules?.length ?? 0} enabled</Text>

        <Text className={styles.infoLabel} size={200}>Created</Text>
        <Text>{new Date(app.createdAt).toLocaleString()}</Text>

        <Text className={styles.infoLabel} size={200}>Updated</Text>
        <Text>{new Date(app.updatedAt).toLocaleString()}</Text>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings Tab (editable fields)
// ---------------------------------------------------------------------------

/** Props for the settings tab */
interface SettingsTabProps {
  app: Application;
  onSave: (data: { name?: string; description?: string }) => Promise<void>;
  saving: boolean;
}

/**
 * Settings tab for editing application name and description.
 * Tracks dirty state and shows save/reset buttons.
 */
function SettingsTab({ app, onSave, saving }: SettingsTabProps) {
  const styles = useStyles();
  const [name, setName] = useState(app.name);
  const [description, setDescription] = useState(app.description ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** Whether form values differ from the current application state */
  const isDirty = name !== app.name || description !== (app.description ?? '');

  /** Reset form to current application values */
  const handleReset = useCallback(() => {
    setName(app.name);
    setDescription(app.description ?? '');
    setErrors({});
  }, [app]);

  /** Validate and save */
  const handleSave = useCallback(async () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    else if (name.trim().length < 2) newErrors.name = 'Name must be at least 2 characters';

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    await onSave({
      name: name !== app.name ? name.trim() : undefined,
      description: description !== (app.description ?? '') ? description.trim() : undefined,
    });
  }, [name, description, app, onSave]);

  return (
    <div className={styles.section}>
      <div className={styles.field}>
        <Label required weight="semibold">Application Name</Label>
        <Input
          value={name}
          onChange={(_ev, data) => setName(data.value)}
          disabled={app.status === 'archived'}
        />
        {errors.name && <Text size={200} className={styles.error}>{errors.name}</Text>}
      </div>

      <div className={styles.field}>
        <Label weight="semibold">Description</Label>
        <Textarea
          value={description}
          onChange={(_ev, data) => setDescription(data.value)}
          rows={3}
          resize="vertical"
          disabled={app.status === 'archived'}
        />
      </div>

      {app.status !== 'archived' && (
        <div className={styles.actions}>
          <Button appearance="secondary" onClick={handleReset} disabled={!isDirty}>
            Reset
          </Button>
          <Button
            appearance="primary"
            icon={<SaveRegular />}
            onClick={handleSave}
            disabled={!isDirty || saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modules Tab
// ---------------------------------------------------------------------------

/** Props for the modules tab */
interface ModulesTabProps {
  app: Application;
  onRefresh: () => void;
}

/**
 * Modules tab showing toggle switches for each known module type.
 * Calls the modules API to add/remove modules in real time.
 */
function ModulesTab({ app, onRefresh }: ModulesTabProps) {
  const styles = useStyles();
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Set of currently enabled module types */
  const enabledModules = useMemo(
    () => new Set((app.modules ?? []).map((m) => m.moduleType)),
    [app.modules],
  );

  /** Toggle a module on or off */
  const handleToggle = useCallback(
    async (moduleType: string, enabled: boolean) => {
      setToggling(moduleType);
      setError(null);

      try {
        if (enabled) {
          // Add the module via API
          await api.post(`/applications/${app.id}/modules`, { moduleType });
        } else {
          // Find the module and remove it
          const existing = (app.modules ?? []).find((m) => m.moduleType === moduleType);
          if (existing) {
            await api.del(`/applications/${app.id}/modules/${existing.id}`);
          }
        }
        onRefresh();
      } catch (err) {
        setError(`Failed to ${enabled ? 'enable' : 'disable'} module: ${(err as Error).message}`);
      } finally {
        setToggling(null);
      }
    },
    [app, onRefresh],
  );

  return (
    <div className={styles.section}>
      <Text size={300}>
        Application modules control which features are available. Enable or disable modules
        to configure what this application supports.
      </Text>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {KNOWN_MODULES.map((mod) => {
        const isEnabled = enabledModules.has(mod.type);
        const isToggling = toggling === mod.type;

        return (
          <div key={mod.type} className={styles.moduleRow}>
            <div className={styles.moduleInfo}>
              <Text weight="semibold">{mod.label}</Text>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                {mod.description}
              </Text>
            </div>
            <Switch
              checked={isEnabled}
              disabled={isToggling || app.status === 'archived'}
              onChange={(_ev, data) => handleToggle(mod.type, data.checked)}
              label={isToggling ? 'Updating...' : isEnabled ? 'Enabled' : 'Disabled'}
            />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clients Tab
// ---------------------------------------------------------------------------

/** Props for the clients tab */
interface ClientsTabProps {
  appId: string;
}

/**
 * Clients tab listing OIDC clients belonging to this application.
 * Each row links to the client detail page.
 */
function ClientsTab({ appId }: ClientsTabProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const { data, isLoading } = useClients({ applicationId: appId, limit: 50 } as Record<string, unknown>);
  const clients: Client[] = data?.data ?? [];

  if (isLoading) {
    return <div className={styles.loading}><Spinner size="small" label="Loading clients..." /></div>;
  }

  if (clients.length === 0) {
    return (
      <div className={styles.listEmpty}>
        <Text>No clients yet. Create a client from the Clients page.</Text>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      {clients.map((client) => (
        <div
          key={client.id}
          className={styles.listItem}
          onClick={() => navigate(`/clients/${client.id}`)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate(`/clients/${client.id}`)}
        >
          <div>
            <Text weight="semibold">{client.name}</Text>
            <br />
            <Text size={200} style={{ fontFamily: 'monospace', color: tokens.colorNeutralForeground3 }}>
              {client.clientId}
            </Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
            <Badge appearance="outline">
              {client.isConfidential ? 'Confidential' : 'Public'}
            </Badge>
            <StatusBadge status={client.status} size="small" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roles Tab
// ---------------------------------------------------------------------------

/** Props for the roles tab */
interface RolesTabProps {
  appId: string;
}

/**
 * Roles tab listing RBAC roles defined for this application.
 * Each row links to the role detail page.
 */
function RolesTab({ appId }: RolesTabProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const { data, isLoading } = useRoles(appId, { limit: 50 });
  const roles: Role[] = data?.data ?? [];

  if (isLoading) {
    return <div className={styles.loading}><Spinner size="small" label="Loading roles..." /></div>;
  }

  if (roles.length === 0) {
    return (
      <div className={styles.listEmpty}>
        <Text>No roles defined yet. Create a role from the Roles page.</Text>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      {roles.map((role) => (
        <div
          key={role.id}
          className={styles.listItem}
          onClick={() => navigate(`/roles/${role.id}`)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate(`/roles/${role.id}`)}
        >
          <div>
            <Text weight="semibold">{role.name}</Text>
            <br />
            <Text size={200} style={{ fontFamily: 'monospace', color: tokens.colorNeutralForeground3 }}>
              {role.slug}
            </Text>
          </div>
          {role.isSystem && (
            <Badge appearance="outline" color="informative">System</Badge>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Permissions Tab
// ---------------------------------------------------------------------------

/** Props for the permissions tab */
interface PermissionsTabProps {
  appId: string;
}

/**
 * Permissions tab listing permissions defined for this application.
 */
function PermissionsTab({ appId }: PermissionsTabProps) {
  const styles = useStyles();
  const { data, isLoading } = usePermissions(appId, { limit: 50 });
  const permissions: Permission[] = data?.data ?? [];

  if (isLoading) {
    return <div className={styles.loading}><Spinner size="small" label="Loading permissions..." /></div>;
  }

  if (permissions.length === 0) {
    return (
      <div className={styles.listEmpty}>
        <Text>No permissions defined yet. Create permissions from the Permissions page.</Text>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      {permissions.map((perm) => (
        <div key={perm.id} className={styles.listItem} style={{ cursor: 'default' }}>
          <div>
            <Text weight="semibold">{perm.name}</Text>
            <br />
            <Text size={200} style={{ fontFamily: 'monospace', color: tokens.colorNeutralForeground3 }}>
              {perm.slug}
            </Text>
          </div>
          {perm.description && (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3, maxWidth: '300px' }}>
              {perm.description}
            </Text>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Claims Tab
// ---------------------------------------------------------------------------

/** Props for the claims tab */
interface ClaimsTabProps {
  appId: string;
}

/**
 * Claims tab listing custom claim definitions for this application.
 */
function ClaimsTab({ appId }: ClaimsTabProps) {
  const styles = useStyles();
  const { data, isLoading } = useClaimDefinitions(appId, { limit: 50 });
  const claims: ClaimDefinition[] = data?.data ?? [];

  if (isLoading) {
    return <div className={styles.loading}><Spinner size="small" label="Loading claims..." /></div>;
  }

  if (claims.length === 0) {
    return (
      <div className={styles.listEmpty}>
        <Text>No custom claims defined yet. Create claim definitions from the Claims page.</Text>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      {claims.map((claim) => (
        <div key={claim.id} className={styles.listItem} style={{ cursor: 'default' }}>
          <div>
            <Text weight="semibold">{claim.name}</Text>
            <br />
            <Text size={200} style={{ fontFamily: 'monospace', color: tokens.colorNeutralForeground3 }}>
              {claim.slug}
            </Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
            <Badge appearance="outline">{claim.valueType}</Badge>
            {claim.isRequired && (
              <Badge appearance="outline" color="important">Required</Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History Tab
// ---------------------------------------------------------------------------

/** Props for the history tab */
interface HistoryTabProps {
  appId: string;
}

/**
 * History tab showing audit log entries related to this application.
 * Uses the AuditTimeline component for display.
 */
function HistoryTab({ appId }: HistoryTabProps) {
  const styles = useStyles();
  const { data, isLoading } = useAuditLog({
    targetType: 'application',
    limit: 20,
  } as Record<string, unknown>);
  const rawEntries = data?.data ?? [];

  // Map AuditEntry → TimelineEntry for the AuditTimeline component
  const entries: TimelineEntry[] = useMemo(
    () =>
      rawEntries.map((e: AuditEntry) => ({
        id: e.id,
        action: e.action,
        actor: e.actorEmail ?? e.actorId ?? 'System',
        timestamp: new Date(e.createdAt).toLocaleString(),
      })),
    [rawEntries],
  );

  if (isLoading) {
    return <div className={styles.loading}><Spinner size="small" label="Loading history..." /></div>;
  }

  if (entries.length === 0) {
    return (
      <div className={styles.listEmpty}>
        <Text>No audit history available for this application.</Text>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <AuditTimeline entries={entries} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ApplicationDetail Component
// ---------------------------------------------------------------------------

/**
 * Application detail page with tabbed interface.
 * Loads the application by ID from the route parameter and displays
 * overview, modules, clients, roles, permissions, claims, and history tabs.
 * Supports archiving via a confirm dialog with type-to-confirm.
 */
export function ApplicationDetail() {
  const styles = useStyles();
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();

  // API hooks
  const { data: app, isLoading, refetch } = useApplication(appId ?? '');
  const updateApp = useUpdateApplication();
  const archiveApp = useArchiveApplication();

  // Fetch org name for display
  const { data: org } = useOrganization(app?.organizationId ?? '');
  const orgName = org?.name ?? app?.organizationId ?? '';

  // Archive dialog state
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveConfirmed, setArchiveConfirmed] = useState(false);

  /** Handle settings save */
  const handleSettingsSave = useCallback(
    async (data: { name?: string; description?: string }) => {
      if (!app) return;
      await updateApp.mutateAsync({ id: app.id, data });
      refetch();
    },
    [app, updateApp, refetch],
  );

  /** Handle archive action */
  const handleArchive = useCallback(async () => {
    if (!app) return;
    await archiveApp.mutateAsync(app.id);
    setArchiveDialogOpen(false);
    setArchiveConfirmed(false);
    refetch();
  }, [app, archiveApp, refetch]);

  // Loading state
  if (isLoading || !app) {
    return (
      <div className={styles.loading}>
        <Spinner size="large" label="Loading application..." />
      </div>
    );
  }

  // Build status action buttons
  const statusActions: EntityAction[] = [];
  if (app.status === 'active') {
    statusActions.push({
      key: 'archive',
      label: 'Archive',
      icon: <ArchiveRegular />,
      onClick: () => setArchiveDialogOpen(true),
      appearance: 'secondary',
    });
  }

  // Build tab definitions
  const tabs: EntityTab[] = [
    {
      key: 'overview',
      label: 'Overview',
      content: <OverviewTab app={app} orgName={orgName} />,
    },
    {
      key: 'settings',
      label: 'Settings',
      content: (
        <SettingsTab
          app={app}
          onSave={handleSettingsSave}
          saving={updateApp.isPending}
        />
      ),
    },
    {
      key: 'modules',
      label: 'Modules',
      content: <ModulesTab app={app} onRefresh={() => refetch()} />,
    },
    {
      key: 'clients',
      label: 'Clients',
      content: <ClientsTab appId={app.id} />,
    },
    {
      key: 'roles',
      label: 'Roles',
      content: <RolesTab appId={app.id} />,
    },
    {
      key: 'permissions',
      label: 'Permissions',
      content: <PermissionsTab appId={app.id} />,
    },
    {
      key: 'claims',
      label: 'Claims',
      content: <ClaimsTab appId={app.id} />,
    },
    {
      key: 'history',
      label: 'History',
      content: <HistoryTab appId={app.id} />,
    },
  ];

  return (
    <>
      {/* Page header with back button */}
      <div className={styles.header}>
        <Button
          appearance="subtle"
          icon={<ArrowLeftRegular />}
          onClick={() => navigate('/applications')}
          aria-label="Back to applications"
        />
        <Text size={600} weight="semibold">
          {app.name}
        </Text>
        <StatusBadge status={app.status} />
      </div>

      {/* Tabbed detail view */}
      <EntityDetailTabs
        title={app.name}
        status={app.status}
        tabs={tabs}
        actions={statusActions}
        defaultTab="overview"
        backPath="/applications"
      />

      {/* Archive confirmation dialog */}
      <ConfirmDialog
        open={archiveDialogOpen}
        onDismiss={() => {
          setArchiveDialogOpen(false);
          setArchiveConfirmed(false);
        }}
        onConfirm={handleArchive}
        title="Archive Application"
        confirmLabel="Archive Application"
        destructive
        confirmDisabled={!archiveConfirmed}
        loading={archiveApp.isPending}
      >
        Are you sure you want to archive <strong>{app.name}</strong>?
        This will disable all associated clients, roles, and permissions.
        This action cannot be undone.
        <TypeToConfirm
          confirmValue={app.slug}
          onConfirmedChange={setArchiveConfirmed}
          prompt={`Type "${app.slug}" to confirm:`}
        />
      </ConfirmDialog>
    </>
  );
}
