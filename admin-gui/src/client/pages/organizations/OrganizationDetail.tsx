/**
 * Organization detail page.
 * Displays a single organization with tabbed sections:
 * - Overview: key info, status, dates, and status transition actions
 * - Branding: logo/favicon upload, colors, custom CSS via BrandingEditor
 * - Settings: locale, login methods, 2FA policy
 * - Applications: list of applications belonging to this org
 * - Users: list of users belonging to this org
 * - History: audit trail filtered to this organization
 *
 * Uses EntityDetailTabs for consistent layout across all entity pages.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Card,
  Button,
  Dropdown,
  Option,
  Spinner,
  MessageBar,
  MessageBarBody,
  Label,
} from '@fluentui/react-components';
import {
  InfoRegular,
  PaintBrushRegular,
  SettingsRegular,
  AppFolderRegular,
  PeopleRegular,
  HistoryRegular,
  CheckmarkCircleRegular,
  PauseCircleRegular,
  ArchiveRegular,
} from '@fluentui/react-icons';
import { useParams, useNavigate } from 'react-router';
import {
  useOrganization,
  useUpdateOrganization,
  useSuspendOrganization,
  useActivateOrganization,
  useArchiveOrganization,
} from '../../api/organizations';
import { useApplications } from '../../api/applications';
import { useUsers } from '../../api/users';
import { useAuditLog } from '../../api/audit';
import { EntityDetailTabs, type EntityTab, type EntityAction } from '../../components/EntityDetailTabs';
import { BrandingEditor, type BrandingData } from '../../components/BrandingEditor';
import { LoginMethodSelector } from '../../components/LoginMethodSelector';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TypeToConfirm } from '../../components/TypeToConfirm';
import { AuditTimeline, type TimelineEntry } from '../../components/AuditTimeline';
import { StatusBadge } from '../../components/StatusBadge';
import type {
  Organization,
  OrganizationStatus,
  TwoFactorPolicy,
  LoginMethod,
  Application,
  User,
  AuditEntry,
} from '../../types';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingVerticalM,
    '@media (max-width: 640px)': {
      gridTemplateColumns: '1fr',
    },
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  infoLabel: {
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
  },
  infoValue: {
    fontWeight: tokens.fontWeightRegular,
  },
  monoValue: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSizeBase200,
  },
  settingsForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    maxWidth: '500px',
  },
  formField: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  formActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalM,
  },
  listCard: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  listItemLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  listEmpty: {
    padding: tokens.spacingVerticalXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  listHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: tokens.spacingVerticalS,
  },
  superAdminBadge: {
    color: tokens.colorPaletteMarigoldForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  errorContainer: {
    padding: tokens.spacingVerticalXL,
    textAlign: 'center',
  },
});

// ---------------------------------------------------------------------------
// Helper: format date
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Helper: audit entry to timeline entry
// ---------------------------------------------------------------------------

function auditToTimeline(entry: AuditEntry): TimelineEntry {
  return {
    id: entry.id,
    action: entry.action.replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    actor: entry.actorEmail ?? 'System',
    timestamp: formatDate(entry.createdAt),
    details: entry.metadata ? JSON.stringify(entry.metadata) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Status transition helpers
// ---------------------------------------------------------------------------

type StatusAction = 'suspend' | 'activate' | 'archive';

/** Available status transitions per current status */
const STATUS_TRANSITIONS: Record<OrganizationStatus, StatusAction[]> = {
  active: ['suspend', 'archive'],
  suspended: ['activate', 'archive'],
  archived: [], // archived orgs cannot transition
};

const ACTION_CONFIG: Record<StatusAction, {
  label: string;
  title: string;
  description: string;
  destructive: boolean;
  icon: React.ReactElement;
}> = {
  suspend: {
    label: 'Suspend',
    title: 'Suspend Organization',
    description: 'Suspending this organization will prevent all users from logging in. This action can be reversed by activating the organization.',
    destructive: true,
    icon: <PauseCircleRegular />,
  },
  activate: {
    label: 'Activate',
    title: 'Activate Organization',
    description: 'Activating this organization will restore login access for all users.',
    destructive: false,
    icon: <CheckmarkCircleRegular />,
  },
  archive: {
    label: 'Archive',
    title: 'Archive Organization',
    description: 'Archiving this organization is a permanent action. All users will lose access and the organization cannot be reactivated.',
    destructive: true,
    icon: <ArchiveRegular />,
  },
};

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

interface OverviewTabProps {
  org: Organization;
}

function OverviewTab({ org }: OverviewTabProps) {
  const styles = useStyles();

  return (
    <div className={styles.section}>
      <div className={styles.infoGrid}>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Name</Text>
          <Text className={styles.infoValue}>{org.name}</Text>
        </div>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Slug</Text>
          <Text className={`${styles.infoValue} ${styles.monoValue}`}>{org.slug}</Text>
        </div>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Status</Text>
          <div><StatusBadge status={org.status} /></div>
        </div>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Locale</Text>
          <Text className={styles.infoValue}>{org.defaultLocale}</Text>
        </div>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Two-Factor Policy</Text>
          <Text className={styles.infoValue}>
            {org.twoFactorPolicy.charAt(0).toUpperCase() + org.twoFactorPolicy.slice(1)}
          </Text>
        </div>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Login Methods</Text>
          <Text className={styles.infoValue}>
            {org.defaultLoginMethods.length > 0
              ? org.defaultLoginMethods.map((m) =>
                  m === 'password' ? 'Password' : 'Magic Link',
                ).join(', ')
              : 'None configured'}
          </Text>
        </div>
        {org.isSuperAdmin && (
          <div className={styles.infoItem}>
            <Text size={200} className={styles.infoLabel}>Role</Text>
            <Text className={styles.superAdminBadge}>⭐ Super Admin Organization</Text>
          </div>
        )}
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Created</Text>
          <Text className={styles.infoValue}>{formatDate(org.createdAt)}</Text>
        </div>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Last Updated</Text>
          <Text className={styles.infoValue}>{formatDate(org.updatedAt)}</Text>
        </div>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>ID</Text>
          <Text className={`${styles.infoValue} ${styles.monoValue}`}>{org.id}</Text>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Branding tab
// ---------------------------------------------------------------------------

interface BrandingTabProps {
  org: Organization;
}

function BrandingTab({ org }: BrandingTabProps) {
  const styles = useStyles();
  const updateOrg = useUpdateOrganization();
  const [branding, setBranding] = useState<BrandingData>({
    logoUrl: org.brandingLogoUrl,
    faviconUrl: org.brandingFaviconUrl,
    primaryColor: org.brandingPrimaryColor,
    companyName: org.brandingCompanyName,
    customCss: org.brandingCustomCss,
  });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    setSaveSuccess(false);
    setSaveError(null);
    try {
      await updateOrg.mutateAsync({
        id: org.id,
        data: {
          brandingPrimaryColor: branding.primaryColor,
          brandingCompanyName: branding.companyName,
          brandingCustomCss: branding.customCss,
        } as Partial<Organization>,
      });
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save branding');
    }
  }, [org.id, branding, updateOrg]);

  const isDisabled = org.status === 'archived';

  return (
    <div className={styles.section}>
      {saveSuccess && (
        <MessageBar intent="success">
          <MessageBarBody>Branding settings saved successfully.</MessageBarBody>
        </MessageBar>
      )}
      {saveError && (
        <MessageBar intent="error">
          <MessageBarBody>{saveError}</MessageBarBody>
        </MessageBar>
      )}
      <BrandingEditor
        value={branding}
        onChange={setBranding}
        disabled={isDisabled}
      />
      {!isDisabled && (
        <div className={styles.formActions}>
          <Button
            appearance="primary"
            onClick={handleSave}
            disabled={updateOrg.isPending}
          >
            {updateOrg.isPending ? 'Saving...' : 'Save Branding'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------

interface SettingsTabProps {
  org: Organization;
}

/** Available locale options */
const LOCALE_OPTIONS = [
  { value: 'en', label: 'English (en)' },
  { value: 'nl', label: 'Dutch (nl)' },
  { value: 'de', label: 'German (de)' },
  { value: 'fr', label: 'French (fr)' },
];

/** 2FA policy options */
const TWO_FACTOR_OPTIONS: { value: TwoFactorPolicy; label: string; description: string }[] = [
  { value: 'disabled', label: 'Disabled', description: 'Two-factor authentication is not available' },
  { value: 'optional', label: 'Optional', description: 'Users can choose to enable 2FA' },
  { value: 'required', label: 'Required', description: 'All users must set up 2FA' },
];

function SettingsTab({ org }: SettingsTabProps) {
  const styles = useStyles();
  const updateOrg = useUpdateOrganization();
  const [locale, setLocale] = useState(org.defaultLocale);
  const [loginMethods, setLoginMethods] = useState<LoginMethod[]>(org.defaultLoginMethods);
  const [twoFactorPolicy, setTwoFactorPolicy] = useState<TwoFactorPolicy>(org.twoFactorPolicy);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isDirty =
    locale !== org.defaultLocale ||
    JSON.stringify(loginMethods) !== JSON.stringify(org.defaultLoginMethods) ||
    twoFactorPolicy !== org.twoFactorPolicy;

  const handleSave = useCallback(async () => {
    setSaveSuccess(false);
    setSaveError(null);
    try {
      await updateOrg.mutateAsync({
        id: org.id,
        data: {
          defaultLocale: locale,
          defaultLoginMethods: loginMethods,
          twoFactorPolicy,
        },
      });
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings');
    }
  }, [org.id, locale, loginMethods, twoFactorPolicy, updateOrg]);

  const handleReset = useCallback(() => {
    setLocale(org.defaultLocale);
    setLoginMethods(org.defaultLoginMethods);
    setTwoFactorPolicy(org.twoFactorPolicy);
    setSaveSuccess(false);
    setSaveError(null);
  }, [org]);

  const isDisabled = org.status === 'archived';

  return (
    <div className={styles.section}>
      {saveSuccess && (
        <MessageBar intent="success">
          <MessageBarBody>Settings saved successfully.</MessageBarBody>
        </MessageBar>
      )}
      {saveError && (
        <MessageBar intent="error">
          <MessageBarBody>{saveError}</MessageBarBody>
        </MessageBar>
      )}
      <div className={styles.settingsForm}>
        {/* Default Locale */}
        <div className={styles.formField}>
          <Label weight="semibold">Default Locale</Label>
          <Dropdown
            value={LOCALE_OPTIONS.find((o) => o.value === locale)?.label ?? locale}
            onOptionSelect={(_ev, data) => {
              if (data.optionValue) setLocale(data.optionValue);
            }}
            disabled={isDisabled}
          >
            {LOCALE_OPTIONS.map((opt) => (
              <Option key={opt.value} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Dropdown>
        </div>

        {/* Login Methods */}
        <LoginMethodSelector
          value={loginMethods}
          onChange={(methods) => setLoginMethods(methods ?? [])}
          mode="org"
          disabled={isDisabled}
        />

        {/* Two-Factor Policy */}
        <div className={styles.formField}>
          <Label weight="semibold">Two-Factor Authentication Policy</Label>
          <Dropdown
            value={TWO_FACTOR_OPTIONS.find((o) => o.value === twoFactorPolicy)?.label ?? twoFactorPolicy}
            onOptionSelect={(_ev, data) => {
              if (data.optionValue) setTwoFactorPolicy(data.optionValue as TwoFactorPolicy);
            }}
            disabled={isDisabled}
          >
            {TWO_FACTOR_OPTIONS.map((opt) => (
              <Option key={opt.value} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Dropdown>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {TWO_FACTOR_OPTIONS.find((o) => o.value === twoFactorPolicy)?.description}
          </Text>
        </div>

        {/* Save / Reset buttons */}
        {!isDisabled && (
          <div className={styles.formActions}>
            <Button
              appearance="primary"
              onClick={handleSave}
              disabled={!isDirty || updateOrg.isPending}
            >
              {updateOrg.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
            <Button
              appearance="secondary"
              onClick={handleReset}
              disabled={!isDirty || updateOrg.isPending}
            >
              Reset
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Applications tab
// ---------------------------------------------------------------------------

interface ApplicationsTabProps {
  orgId: string;
}

function ApplicationsTab({ orgId }: ApplicationsTabProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const { data, isLoading } = useApplications({
    search: undefined,
    status: undefined,
    limit: 50,
    offset: 0,
    sortBy: 'name',
    sortOrder: 'asc',
  });

  // Filter applications to this org (the API returns all, we filter client-side)
  const apps = useMemo(
    () => (data?.data ?? []).filter((app: Application) => app.organizationId === orgId),
    [data, orgId],
  );

  if (isLoading) {
    return <Spinner size="medium" label="Loading applications..." />;
  }

  return (
    <div className={styles.section}>
      <div className={styles.listHeader}>
        <Text size={400} weight="semibold">
          Applications ({apps.length})
        </Text>
        <Button
          appearance="primary"
          size="small"
          onClick={() => navigate('/applications/new')}
        >
          Create Application
        </Button>
      </div>
      {apps.length === 0 ? (
        <div className={styles.listEmpty}>
          <Text>No applications in this organization yet.</Text>
        </div>
      ) : (
        <Card>
          {apps.map((app: Application) => (
            <div
              key={app.id}
              className={styles.listItem}
              onClick={() => navigate(`/applications/${app.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate(`/applications/${app.id}`);
              }}
              style={{ cursor: 'pointer' }}
            >
              <div className={styles.listItemLeft}>
                <Text weight="semibold">{app.name}</Text>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {app.slug} · Created {formatShortDate(app.createdAt)}
                </Text>
              </div>
              <StatusBadge status={app.status} size="small" />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users tab
// ---------------------------------------------------------------------------

interface UsersTabProps {
  orgId: string;
}

function UsersTab({ orgId }: UsersTabProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const { data, isLoading } = useUsers(orgId, {
    limit: 50,
    offset: 0,
    sortBy: 'email',
    sortOrder: 'asc',
  });

  const users = data?.data ?? [];
  const total = data?.pagination?.total ?? 0;

  if (isLoading) {
    return <Spinner size="medium" label="Loading users..." />;
  }

  return (
    <div className={styles.section}>
      <div className={styles.listHeader}>
        <Text size={400} weight="semibold">
          Users ({total})
        </Text>
        <Button
          appearance="primary"
          size="small"
          onClick={() => navigate('/users/invite')}
        >
          Invite User
        </Button>
      </div>
      {users.length === 0 ? (
        <div className={styles.listEmpty}>
          <Text>No users in this organization yet.</Text>
        </div>
      ) : (
        <Card>
          {users.map((user: User) => (
            <div
              key={user.id}
              className={styles.listItem}
              onClick={() => navigate(`/users/${user.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate(`/users/${user.id}`);
              }}
              style={{ cursor: 'pointer' }}
            >
              <div className={styles.listItemLeft}>
                <Text weight="semibold">{user.email}</Text>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {[user.givenName, user.familyName].filter(Boolean).join(' ') || 'No name set'}
                  {user.lastLoginAt
                    ? ` · Last login ${formatShortDate(user.lastLoginAt)}`
                    : ' · Never logged in'}
                </Text>
              </div>
              <StatusBadge status={user.status} size="small" />
            </div>
          ))}
          {total > users.length && (
            <div className={styles.listEmpty}>
              <Text size={200}>
                Showing {users.length} of {total} users.{' '}
                <Button
                  appearance="transparent"
                  size="small"
                  onClick={() => navigate('/users')}
                >
                  View all
                </Button>
              </Text>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History tab
// ---------------------------------------------------------------------------

interface HistoryTabProps {
  orgId: string;
}

function HistoryTab({ orgId }: HistoryTabProps) {
  const { data, isLoading } = useAuditLog({
    organizationId: orgId,
    limit: 50,
    offset: 0,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  if (isLoading) {
    return <Spinner size="medium" label="Loading history..." />;
  }

  const entries: TimelineEntry[] = (data?.data ?? []).map(auditToTimeline);

  return (
    <AuditTimeline
      entries={entries}
      emptyMessage="No audit history available for this organization."
    />
  );
}

// ---------------------------------------------------------------------------
// Main component: OrganizationDetail
// ---------------------------------------------------------------------------

/**
 * Organization detail page with tabbed layout.
 * Fetches org data by ID from URL params and renders all tabs.
 */
export function OrganizationDetail() {
  const styles = useStyles();
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { data: org, isLoading, isError, error } = useOrganization(orgId ?? '');

  // Status transition state
  const [pendingAction, setPendingAction] = useState<StatusAction | null>(null);
  const [typeConfirmed, setTypeConfirmed] = useState(false);

  // Status mutation hooks
  const suspendMutation = useSuspendOrganization();
  const activateMutation = useActivateOrganization();
  const archiveMutation = useArchiveOrganization();

  const isMutating =
    suspendMutation.isPending || activateMutation.isPending || archiveMutation.isPending;

  /** Execute the pending status transition */
  const handleConfirmAction = useCallback(async () => {
    if (!orgId || !pendingAction) return;

    try {
      switch (pendingAction) {
        case 'suspend':
          await suspendMutation.mutateAsync(orgId);
          break;
        case 'activate':
          await activateMutation.mutateAsync(orgId);
          break;
        case 'archive':
          await archiveMutation.mutateAsync(orgId);
          break;
      }
      setPendingAction(null);
      setTypeConfirmed(false);
    } catch {
      // Error is handled by React Query — mutation error state
    }
  }, [orgId, pendingAction, suspendMutation, activateMutation, archiveMutation]);

  /** Close the confirmation dialog */
  const handleDismissAction = useCallback(() => {
    setPendingAction(null);
    setTypeConfirmed(false);
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <EntityDetailTabs
        title="Organization"
        loading
        tabs={[]}
        backPath="/organizations"
      />
    );
  }

  // Error state
  if (isError || !org) {
    return (
      <div className={styles.errorContainer}>
        <MessageBar intent="error">
          <MessageBarBody>
            {error instanceof Error ? error.message : 'Organization not found.'}
          </MessageBarBody>
        </MessageBar>
        <Button
          appearance="primary"
          onClick={() => navigate('/organizations')}
          style={{ marginTop: tokens.spacingVerticalL }}
        >
          Back to Organizations
        </Button>
      </div>
    );
  }

  // Build header actions based on current status
  const availableTransitions = STATUS_TRANSITIONS[org.status] ?? [];
  const actions: EntityAction[] = availableTransitions.map((action) => ({
    key: action,
    label: ACTION_CONFIG[action].label,
    onClick: () => setPendingAction(action),
    appearance: action === 'activate' ? 'primary' : 'secondary',
    icon: ACTION_CONFIG[action].icon,
    disabled: isMutating,
  }));

  // Build tabs
  const tabs: EntityTab[] = [
    {
      key: 'overview',
      label: 'Overview',
      icon: <InfoRegular />,
      content: <OverviewTab org={org} />,
    },
    {
      key: 'branding',
      label: 'Branding',
      icon: <PaintBrushRegular />,
      content: <BrandingTab org={org} />,
    },
    {
      key: 'settings',
      label: 'Settings',
      icon: <SettingsRegular />,
      content: <SettingsTab org={org} />,
    },
    {
      key: 'applications',
      label: 'Applications',
      icon: <AppFolderRegular />,
      content: <ApplicationsTab orgId={org.id} />,
    },
    {
      key: 'users',
      label: 'Users',
      icon: <PeopleRegular />,
      content: <UsersTab orgId={org.id} />,
    },
    {
      key: 'history',
      label: 'History',
      icon: <HistoryRegular />,
      content: <HistoryTab orgId={org.id} />,
    },
  ];

  // Determine the confirm dialog config
  const actionConfig = pendingAction ? ACTION_CONFIG[pendingAction] : null;
  const needsTypeConfirm = pendingAction === 'archive' || pendingAction === 'suspend';

  return (
    <>
      <EntityDetailTabs
        title={org.name}
        subtitle={org.slug}
        status={org.status}
        actions={actions}
        tabs={tabs}
        backPath="/organizations"
      />

      {/* Status transition confirmation dialog */}
      {actionConfig && (
        <ConfirmDialog
          open={pendingAction !== null}
          onDismiss={handleDismissAction}
          onConfirm={handleConfirmAction}
          title={actionConfig.title}
          confirmLabel={actionConfig.label}
          destructive={actionConfig.destructive}
          confirmDisabled={needsTypeConfirm && !typeConfirmed}
          loading={isMutating}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM }}>
            <Text>{actionConfig.description}</Text>
            {needsTypeConfirm && (
              <TypeToConfirm
                confirmValue={org.name}
                onConfirmedChange={setTypeConfirmed}
                prompt={`Type "${org.name}" to confirm this action:`}
              />
            )}
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
