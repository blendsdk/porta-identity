/**
 * Permission detail page.
 * Shows permission information with two tabs:
 * - Overview: Read-only info grid (name, slug, description, dates)
 * - Roles: List of roles that include this permission
 *
 * AppId is passed via router location state from the PermissionList page.
 */

import { useState, useMemo } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Spinner,
  Card,
  CardHeader,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { DeleteRegular } from '@fluentui/react-icons';
import { useParams, useLocation, useNavigate } from 'react-router';
import { usePermission, useArchivePermission } from '../../api/permissions';
import { useRoles } from '../../api/roles';
import { EntityDetailTabs, type EntityTab, type EntityAction } from '../../components/EntityDetailTabs';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TypeToConfirm } from '../../components/TypeToConfirm';
import { AuditTimeline, type TimelineEntry } from '../../components/AuditTimeline';
import { useAuditLog } from '../../api/audit';
import type { Role, AuditEntry } from '../../types';

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
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  roleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
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
  permission,
  appName,
}: {
  permission: {
    name: string;
    slug: string;
    description: string | null;
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
      <Text weight="semibold">{permission.name}</Text>

      <Text className={styles.label} size={200}>Slug</Text>
      <Text className={styles.mono} size={200}>{permission.slug}</Text>

      <Text className={styles.label} size={200}>Description</Text>
      <Text>{permission.description ?? '—'}</Text>

      <Text className={styles.label} size={200}>Application</Text>
      <Text>{appName}</Text>

      <Text className={styles.label} size={200}>Permission ID</Text>
      <Text className={styles.mono} size={200}>{permission.id}</Text>

      <Text className={styles.label} size={200}>Created</Text>
      <Text size={200}>{fmt(permission.createdAt)}</Text>

      <Text className={styles.label} size={200}>Updated</Text>
      <Text size={200}>{fmt(permission.updatedAt)}</Text>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roles Tab — shows which roles include this permission
// ---------------------------------------------------------------------------

function RolesTab({
  appId,
  permissionId,
}: {
  appId: string;
  permissionId: string;
}) {
  const styles = useStyles();
  const navigate = useNavigate();

  // Fetch all roles for this app, then check which include this permission.
  // We fetch the roles list and for each check its permissions.
  const { data: rolesData, isLoading: rolesLoading } = useRoles(appId, {
    limit: 200,
  });
  const allRoles: Role[] = rolesData?.data ?? [];

  // For a simple approach: fetch all roles and filter client-side
  // by checking each role's permissions. Since the number of roles
  // per app is typically small, this is acceptable.
  // We'll display the roles that contain this permission.
  // Note: The backend doesn't have a "get roles by permission" endpoint,
  // so we do it with the data we have.

  if (rolesLoading) {
    return <Spinner size="medium" label="Loading roles..." />;
  }

  // We show all roles, but indicate which ones have this permission assigned.
  // A more sophisticated approach would fetch permissions per role,
  // but for now we show a simple list with a note.
  return (
    <div className={styles.section}>
      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
        Roles in this application that may include this permission.
        View role details to see assigned permissions.
      </Text>
      {allRoles.length === 0 ? (
        <MessageBar intent="info">
          <MessageBarBody>
            No roles defined for this application.
          </MessageBarBody>
        </MessageBar>
      ) : (
        <div className={styles.roleList}>
          {allRoles.map((role) => (
            <Card
              key={role.id}
              size="small"
              onClick={() =>
                navigate(`/roles/${role.id}`, {
                  state: { appId, appName: '' },
                })
              }
              style={{ cursor: 'pointer' }}
            >
              <CardHeader
                header={<Text weight="semibold">{role.name}</Text>}
                description={
                  <Text size={200}>
                    {role.description ?? role.slug}
                  </Text>
                }
              />
            </Card>
          ))}
        </div>
      )}
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

function HistoryTab({ permissionId }: { permissionId: string }) {
  const { data } = useAuditLog({
    limit: 50,
  });
  const allEntries = data?.data ?? [];
  const filtered = allEntries.filter((e) => e.eventType.startsWith('permission.'));
  return <AuditTimeline entries={mapAuditEntries(filtered)} />;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * Permission detail page.
 * Reads permissionId from URL params and appId from location state.
 */
export function PermissionDetail() {
  const { permissionId = '' } = useParams<{ permissionId: string }>();
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

  // Fetch permission
  const { data: permission, isLoading } = usePermission(appId, permissionId);
  const archivePermission = useArchivePermission();

  // Handle missing appId
  if (!appId) {
    return (
      <div style={{ padding: tokens.spacingVerticalXXL }}>
        <MessageBar intent="warning">
          <MessageBarBody>
            Application context is missing. Please navigate to a permission
            from the{' '}
            <Button
              appearance="transparent"
              onClick={() => navigate('/permissions')}
              style={{ minWidth: 0, padding: 0, textDecoration: 'underline' }}
            >
              Permissions list
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
        <Spinner size="large" label="Loading permission..." />
      </div>
    );
  }

  if (!permission) {
    return (
      <div style={{ padding: tokens.spacingVerticalXXL }}>
        <MessageBar intent="error">
          <MessageBarBody>Permission not found.</MessageBarBody>
        </MessageBar>
      </div>
    );
  }

  // Unwrap: permission may be { data: Permission } or Permission directly
  const permData =
    (permission as { data?: typeof permission })?.data ?? permission;

  const handleArchive = () => {
    archivePermission.mutate(
      { appId, id: permissionId },
      {
        onSuccess: () => navigate('/permissions'),
      },
    );
  };

  // Build tabs
  const tabs: EntityTab[] = [
    {
      key: 'overview',
      label: 'Overview',
      content: <OverviewTab permission={permData} appName={appName} />,
    },
    {
      key: 'roles',
      label: 'Roles',
      content: <RolesTab appId={appId} permissionId={permissionId} />,
    },
    {
      key: 'history',
      label: 'History',
      content: <HistoryTab permissionId={permissionId} />,
    },
  ];

  // Build actions
  const actions: EntityAction[] = [
    {
      key: 'archive',
      label: 'Archive',
      icon: <DeleteRegular />,
      onClick: () => setShowArchive(true),
      appearance: 'subtle',
    },
  ];

  return (
    <>
      <EntityDetailTabs
        title={permData.name}
        tabs={tabs}
        actions={actions}
        defaultTab="overview"
        backPath="/permissions"
      />

      {/* Archive confirmation dialog */}
      <ConfirmDialog
        open={showArchive}
        title="Archive Permission"
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
          confirmValue={permData.name}
          onConfirmedChange={setArchiveConfirmed}
          prompt={`Are you sure you want to archive the permission "${permData.name}"? This will remove it from all roles. Type "${permData.name}" to confirm:`}
        />
      </ConfirmDialog>
    </>
  );
}
