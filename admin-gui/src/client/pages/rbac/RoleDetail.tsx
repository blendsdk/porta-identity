/**
 * Role detail page.
 * Shows role information with three tabs:
 * - Overview: Read-only info grid (name, slug, description, system flag, dates)
 * - Permissions: Checkbox grid to assign/remove permissions
 * - Users: List of users who have this role assigned
 *
 * AppId is passed via router location state from the RoleList page.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Checkbox,
  Badge,
  Spinner,
  Card,
  CardHeader,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import {
  DeleteRegular,
  EditRegular,
  SaveRegular,
  DismissRegular,
} from '@fluentui/react-icons';
import { useParams, useLocation, useNavigate } from 'react-router';
import { useRole, useRolePermissions, useRoleUsers, useSetRolePermissions, useUpdateRole, useArchiveRole } from '../../api/roles';
import { usePermissions } from '../../api/permissions';
import { EntityDetailTabs, type EntityTab, type EntityAction } from '../../components/EntityDetailTabs';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TypeToConfirm } from '../../components/TypeToConfirm';
import { AuditTimeline, type TimelineEntry } from '../../components/AuditTimeline';
import { useAuditLog } from '../../api/audit';
import type { Permission, AuditEntry } from '../../types';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: '180px 1fr',
    gap: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    alignItems: 'baseline',
  },
  label: { color: tokens.colorNeutralForeground3 },
  mono: { fontFamily: 'monospace' },
  permissionsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  permRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  permInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalM,
  },
  userList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  userRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  editForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    maxWidth: '500px',
  },
  formField: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
});

// ---------------------------------------------------------------------------
// Helper: format date
// ---------------------------------------------------------------------------

function fmt(iso: string): string {
  return new Date(iso).toLocaleString();
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab({
  role,
  appName,
}: {
  role: {
    name: string;
    slug: string;
    description: string | null;
    isSystem: boolean;
    applicationId: string;
    createdAt: string;
    updatedAt: string;
    id: string;
  };
  appName: string;
}) {
  const styles = useStyles();
  return (
    <div className={styles.infoGrid}>
      <Text className={styles.label} size={200}>Name</Text>
      <Text weight="semibold">{role.name}</Text>

      <Text className={styles.label} size={200}>Slug</Text>
      <Text className={styles.mono} size={200}>{role.slug}</Text>

      <Text className={styles.label} size={200}>Description</Text>
      <Text>{role.description ?? '—'}</Text>

      <Text className={styles.label} size={200}>Application</Text>
      <Text>{appName}</Text>

      <Text className={styles.label} size={200}>System Role</Text>
      {role.isSystem ? (
        <Badge appearance="outline" color="informative" size="small">
          System
        </Badge>
      ) : (
        <Text>No</Text>
      )}

      <Text className={styles.label} size={200}>Role ID</Text>
      <Text className={styles.mono} size={200}>{role.id}</Text>

      <Text className={styles.label} size={200}>Created</Text>
      <Text size={200}>{fmt(role.createdAt)}</Text>

      <Text className={styles.label} size={200}>Updated</Text>
      <Text size={200}>{fmt(role.updatedAt)}</Text>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Permissions Tab
// ---------------------------------------------------------------------------

function PermissionsTab({
  appId,
  roleId,
  isSystem,
}: {
  appId: string;
  roleId: string;
  isSystem: boolean;
}) {
  const styles = useStyles();
  const [isDirty, setIsDirty] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // Fetch all permissions for the app
  const { data: allPermsData, isLoading: permsLoading } = usePermissions(
    appId,
    { limit: 100 },
  );
  const allPermissions: Permission[] = allPermsData?.data ?? [];

  // Fetch currently assigned permissions
  const { data: assignedPerms, isLoading: assignedLoading } =
    useRolePermissions(appId, roleId);
  const assignedPermissions: Permission[] = Array.isArray(assignedPerms)
    ? assignedPerms
    : (assignedPerms as unknown as { data?: Permission[] })?.data ?? [];

  // Initialize selection from assigned permissions (once)
  if (!initialized && assignedPermissions.length >= 0 && !assignedLoading) {
    const ids = new Set(assignedPermissions.map((p) => p.id));
    setSelectedIds(ids);
    setInitialized(true);
  }

  const setPermissions = useSetRolePermissions();

  const handleToggle = useCallback(
    (permId: string, checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (checked) {
          next.add(permId);
        } else {
          next.delete(permId);
        }
        return next;
      });
      setIsDirty(true);
    },
    [],
  );

  const handleSave = useCallback(() => {
    setPermissions.mutate(
      { appId, roleId, permissionIds: Array.from(selectedIds) },
      {
        onSuccess: () => setIsDirty(false),
      },
    );
  }, [setPermissions, appId, roleId, selectedIds]);

  const handleReset = useCallback(() => {
    const ids = new Set(assignedPermissions.map((p) => p.id));
    setSelectedIds(ids);
    setIsDirty(false);
  }, [assignedPermissions]);

  if (permsLoading || assignedLoading) {
    return <Spinner size="medium" label="Loading permissions..." />;
  }

  if (allPermissions.length === 0) {
    return (
      <MessageBar intent="info">
        <MessageBarBody>
          No permissions defined for this application. Create permissions first
          before assigning them to roles.
        </MessageBarBody>
      </MessageBar>
    );
  }

  return (
    <div className={styles.section}>
      {isSystem && (
        <MessageBar intent="warning">
          <MessageBarBody>
            This is a system role. Permission changes may affect core
            functionality.
          </MessageBarBody>
        </MessageBar>
      )}
      <div className={styles.permissionsGrid}>
        {allPermissions.map((perm) => (
          <div key={perm.id} className={styles.permRow}>
            <Checkbox
              checked={selectedIds.has(perm.id)}
              onChange={(_ev, data) =>
                handleToggle(perm.id, data.checked === true)
              }
            />
            <div className={styles.permInfo}>
              <Text weight="semibold" size={300}>
                {perm.name}
              </Text>
              {perm.description && (
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {perm.description}
                </Text>
              )}
            </div>
          </div>
        ))}
      </div>
      {isDirty && (
        <div className={styles.actions}>
          <Button
            appearance="primary"
            icon={<SaveRegular />}
            onClick={handleSave}
            disabled={setPermissions.isPending}
          >
            {setPermissions.isPending ? 'Saving...' : 'Save Permissions'}
          </Button>
          <Button
            appearance="subtle"
            icon={<DismissRegular />}
            onClick={handleReset}
          >
            Reset
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users Tab
// ---------------------------------------------------------------------------

function UsersTab({
  appId,
  roleId,
}: {
  appId: string;
  roleId: string;
}) {
  const styles = useStyles();
  const navigate = useNavigate();

  const { data: usersData, isLoading } = useRoleUsers(appId, roleId);
  const users = usersData?.data ?? [];

  if (isLoading) {
    return <Spinner size="medium" label="Loading users..." />;
  }

  if (users.length === 0) {
    return (
      <MessageBar intent="info">
        <MessageBarBody>
          No users have this role assigned. Assign roles to users from the
          user detail page.
        </MessageBarBody>
      </MessageBar>
    );
  }

  return (
    <div className={styles.section}>
      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
        {users.length} user{users.length !== 1 ? 's' : ''} with this role
      </Text>
      <div className={styles.userList}>
        {users.map((user) => (
          <Card
            key={user.userId}
            size="small"
            onClick={() => navigate(`/users/${user.userId}`)}
            style={{ cursor: 'pointer' }}
          >
            <CardHeader
              header={
                <Text weight="semibold">{user.email}</Text>
              }
              description={
                <Text size={200}>
                  {[user.givenName, user.familyName]
                    .filter(Boolean)
                    .join(' ') || 'No name'}
                </Text>
              }
            />
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History Tab
// ---------------------------------------------------------------------------

/** Map AuditEntry → TimelineEntry for the AuditTimeline component */
function mapAuditEntries(entries: AuditEntry[]): TimelineEntry[] {
  return entries.map((e) => ({
    id: e.id,
    action: e.eventType,
    actor: e.actorId ?? 'System',
    timestamp: new Date(e.createdAt).toLocaleString(),
    details: e.description ?? (e.metadata ? JSON.stringify(e.metadata) : undefined),
  }));
}

function HistoryTab({ roleId }: { roleId: string }) {
  const { data } = useAuditLog({
    limit: 50,
  });
  // Filter client-side by targetId (not available as a server filter)
  const allEntries = data?.data ?? [];
  const filtered = allEntries.filter((e) => e.eventType.startsWith('role.'));
  return <AuditTimeline entries={mapAuditEntries(filtered)} />;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * Role detail page.
 * Reads roleId from URL params and appId from location state.
 */
export function RoleDetail() {
  const { roleId = '' } = useParams<{ roleId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as
    | { appId?: string; appName?: string }
    | undefined;
  const appId = state?.appId ?? '';
  const appName = state?.appName ?? 'Unknown Application';

  // Dialogs
  const [showArchive, setShowArchive] = useState(false);
  const [archiveConfirmed, setArchiveConfirmed] = useState(false);

  // Fetch role
  const { data: role, isLoading } = useRole(appId, roleId);
  const archiveRole = useArchiveRole();

  // Handle missing appId (direct URL access without state)
  if (!appId) {
    return (
      <div style={{ padding: tokens.spacingVerticalXXL }}>
        <MessageBar intent="warning">
          <MessageBarBody>
            Application context is missing. Please navigate to a role from the{' '}
            <Button
              appearance="transparent"
              onClick={() => navigate('/roles')}
              style={{ minWidth: 0, padding: 0, textDecoration: 'underline' }}
            >
              Roles list
            </Button>
            .
          </MessageBarBody>
        </MessageBar>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ padding: tokens.spacingVerticalXXL }}>
        <Spinner size="large" label="Loading role..." />
      </div>
    );
  }

  if (!role) {
    return (
      <div style={{ padding: tokens.spacingVerticalXXL }}>
        <MessageBar intent="error">
          <MessageBarBody>Role not found.</MessageBarBody>
        </MessageBar>
      </div>
    );
  }

  // Unwrap: role may be { data: Role } or Role directly
  const roleData = (role as { data?: typeof role })?.data ?? role;

  const handleArchive = () => {
    archiveRole.mutate(
      { appId, id: roleId },
      {
        onSuccess: () => navigate('/roles'),
      },
    );
  };

  // Build tabs
  const tabs: EntityTab[] = [
    {
      key: 'overview',
      label: 'Overview',
      content: <OverviewTab role={roleData} appName={appName} />,
    },
    {
      key: 'permissions',
      label: 'Permissions',
      content: (
        <PermissionsTab
          appId={appId}
          roleId={roleId}
          isSystem={roleData.isSystem}
        />
      ),
    },
    {
      key: 'users',
      label: 'Users',
      content: <UsersTab appId={appId} roleId={roleId} />,
    },
    {
      key: 'history',
      label: 'History',
      content: <HistoryTab roleId={roleId} />,
    },
  ];

  // Build actions
  const actions: EntityAction[] = [];
  if (!roleData.isSystem) {
    actions.push({
      key: 'archive',
      label: 'Archive',
      icon: <DeleteRegular />,
      onClick: () => setShowArchive(true),
      appearance: 'subtle',
    });
  }

  return (
    <>
      <EntityDetailTabs
        title={roleData.name}
        status={roleData.isSystem ? 'active' : undefined}
        tabs={tabs}
        actions={actions}
        defaultTab="overview"
        backPath="/roles"
      />

      {/* Archive confirmation dialog */}
      <ConfirmDialog
        open={showArchive}
        title="Archive Role"
        confirmLabel="Archive"
        destructive
        confirmDisabled={!archiveConfirmed}
        onConfirm={handleArchive}
        onDismiss={() => {
          setShowArchive(false);
          setArchiveConfirmed(false);
        }}
      >
        <TypeToConfirm
          confirmValue={roleData.name}
          onConfirmedChange={setArchiveConfirmed}
          prompt={`Are you sure you want to archive the role "${roleData.name}"? This will remove it from all users. Type "${roleData.name}" to confirm:`}
        />
      </ConfirmDialog>
    </>
  );
}
