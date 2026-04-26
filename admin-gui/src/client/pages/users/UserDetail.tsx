/**
 * User detail page.
 * Displays a single user with tabbed sections:
 * - Overview: key info, status, dates, last login
 * - Profile: editable profile fields (name, contact, address, etc.)
 * - Status: state machine with transition actions and confirm dialogs
 * - Roles: per-app role assignments with add/remove
 * - Claims: custom claim values for the user
 * - Security: 2FA status, password management, email verification
 * - Sessions: login activity and session revocation
 * - History: audit trail filtered to this user
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
  Input,
  Label,
  Dropdown,
  Option,
  Spinner,
  MessageBar,
  MessageBarBody,
  Badge,
  Divider,
} from '@fluentui/react-components';
import {
  InfoRegular,
  PersonRegular,
  ArrowSyncRegular,
  ShieldCheckmarkRegular,
  TagRegular,
  LockClosedRegular,
  DesktopRegular,
  HistoryRegular,
  CheckmarkCircleRegular,
  PauseCircleRegular,
  DismissCircleRegular,
  LockMultipleRegular,
  DeleteRegular,
  AddRegular,
  KeyRegular,
  MailRegular,
  ShieldRegular,
} from '@fluentui/react-icons';
import { useParams, useNavigate } from 'react-router';
import {
  useUser,
  useUpdateUser,
  useSuspendUser,
  useActivateUser,
  useDeactivateUser,
  useUnlockUser,
  useSetPassword,
  useClearPassword,
  useVerifyEmail,
  useUserRoles,
  useAssignUserRoles,
  useRemoveUserRoles,
} from '../../api/users';
import { useApplications } from '../../api/applications';
import { useRoles } from '../../api/roles';
import { useUserClaimValues, useSetUserClaimValue } from '../../api/custom-claims';
import { useAuditLog } from '../../api/audit';
import { useBulkRevokeSessions } from '../../api/sessions';
import {
  EntityDetailTabs,
  type EntityTab,
} from '../../components/EntityDetailTabs';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TypeToConfirm } from '../../components/TypeToConfirm';
import { StatusBadge } from '../../components/StatusBadge';
import { AuditTimeline, type TimelineEntry } from '../../components/AuditTimeline';
import type {
  User,
  UserStatus,
  UpdateUserRequest,
  Role,
  Application,
  UserClaimValue,
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
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingVerticalM,
    maxWidth: '800px',
    '@media (max-width: 640px)': {
      gridTemplateColumns: '1fr',
    },
  },
  formField: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  formFieldFull: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    gridColumn: '1 / -1',
  },
  formActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalM,
  },
  statusCard: {
    padding: tokens.spacingVerticalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  statusActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    paddingTop: tokens.spacingVerticalS,
  },
  transitionInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    paddingTop: tokens.spacingVerticalS,
    color: tokens.colorNeutralForeground3,
  },
  rolesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  roleItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  roleItemInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  addRoleForm: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalS,
  },
  claimRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  claimInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    flex: 1,
  },
  securityGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingVerticalL,
    '@media (max-width: 640px)': {
      gridTemplateColumns: '1fr',
    },
  },
  securityCard: {
    padding: tokens.spacingVerticalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  securityCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    fontWeight: tokens.fontWeightSemibold,
  },
  sessionInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  emptyState: {
    padding: tokens.spacingVerticalXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  errorContainer: {
    padding: tokens.spacingVerticalXL,
    textAlign: 'center',
  },
  sectionTitle: {
    fontWeight: tokens.fontWeightSemibold,
    paddingBottom: tokens.spacingVerticalXS,
  },
});

// ---------------------------------------------------------------------------
// Helper functions
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

function auditToTimeline(entry: AuditEntry): TimelineEntry {
  return {
    id: entry.id,
    action: entry.eventType
      .replace(/\./g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    actor: entry.actorId ?? 'System',
    timestamp: formatDate(entry.createdAt),
    details: entry.description ?? (entry.metadata ? JSON.stringify(entry.metadata) : undefined),
  };
}

function getUserDisplayName(user: User): string {
  const parts = [user.givenName, user.familyName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : user.email;
}

// ---------------------------------------------------------------------------
// Status transition configuration
// ---------------------------------------------------------------------------

type UserStatusAction = 'deactivate' | 'activate' | 'suspend' | 'unlock';

const USER_STATUS_TRANSITIONS: Record<UserStatus, UserStatusAction[]> = {
  active: ['deactivate', 'suspend'],
  inactive: ['activate'],
  suspended: ['activate'],
  locked: ['unlock'],
};

const USER_ACTION_CONFIG: Record<
  UserStatusAction,
  {
    label: string;
    title: string;
    description: string;
    destructive: boolean;
    icon: React.ReactElement;
  }
> = {
  deactivate: {
    label: 'Deactivate',
    title: 'Deactivate User',
    description:
      'Deactivating this user will prevent them from logging in. This can be reversed by activating the user.',
    destructive: true,
    icon: <DismissCircleRegular />,
  },
  activate: {
    label: 'Activate',
    title: 'Activate User',
    description:
      'Activating this user will restore their ability to log in.',
    destructive: false,
    icon: <CheckmarkCircleRegular />,
  },
  suspend: {
    label: 'Suspend',
    title: 'Suspend User',
    description:
      'Suspending this user will immediately prevent them from logging in and terminate active sessions. This can be reversed by activating the user.',
    destructive: true,
    icon: <PauseCircleRegular />,
  },
  unlock: {
    label: 'Unlock',
    title: 'Unlock User',
    description:
      'Unlocking this user will restore their ability to log in. Their failed login count will be reset.',
    destructive: false,
    icon: <LockMultipleRegular />,
  },
};

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

interface OverviewTabProps {
  user: User;
}

function OverviewTab({ user }: OverviewTabProps) {
  const styles = useStyles();

  return (
    <div className={styles.section}>
      <div className={styles.infoGrid}>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Email</Text>
          <Text className={styles.infoValue}>{user.email}</Text>
        </div>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Status</Text>
          <div><StatusBadge status={user.status} /></div>
        </div>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Name</Text>
          <Text className={styles.infoValue}>
            {[user.givenName, user.middleName, user.familyName]
              .filter(Boolean)
              .join(' ') || '—'}
          </Text>
        </div>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Nickname</Text>
          <Text className={styles.infoValue}>{user.nickname ?? '—'}</Text>
        </div>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Email Verified</Text>
          <div>
            <Badge
              appearance="filled"
              color={user.emailVerified ? 'success' : 'warning'}
              size="medium"
            >
              {user.emailVerified ? 'Verified' : 'Unverified'}
            </Badge>
          </div>
        </div>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Password</Text>
          <div>
            <Badge
              appearance="filled"
              color={user.hasPassword ? 'success' : 'informative'}
              size="medium"
            >
              {user.hasPassword ? 'Set' : 'Not Set (Passwordless)'}
            </Badge>
          </div>
        </div>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Two-Factor Auth</Text>
          <div>
            <Badge
              appearance="filled"
              color={user.twoFactorEnabled ? 'success' : 'informative'}
              size="medium"
            >
              {user.twoFactorEnabled
                ? `Enabled (${user.twoFactorMethod ?? 'unknown'})`
                : 'Disabled'}
            </Badge>
          </div>
        </div>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Locale</Text>
          <Text className={styles.infoValue}>{user.locale ?? 'Default'}</Text>
        </div>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Last Login</Text>
          <Text className={styles.infoValue}>
            {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never'}
          </Text>
        </div>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Failed Login Attempts</Text>
          <Text className={styles.infoValue}>{user.failedLoginCount}</Text>
        </div>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Created</Text>
          <Text className={styles.infoValue}>{formatDate(user.createdAt)}</Text>
        </div>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Last Updated</Text>
          <Text className={styles.infoValue}>{formatDate(user.updatedAt)}</Text>
        </div>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>Organization ID</Text>
          <Text className={`${styles.infoValue} ${styles.monoValue}`}>
            {user.organizationId}
          </Text>
        </div>
        <div className={styles.infoItem}>
          <Text size={200} className={styles.infoLabel}>User ID</Text>
          <Text className={`${styles.infoValue} ${styles.monoValue}`}>
            {user.id}
          </Text>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile tab
// ---------------------------------------------------------------------------

interface ProfileFormState {
  givenName: string;
  familyName: string;
  middleName: string;
  nickname: string;
  preferredUsername: string;
  profileUrl: string;
  pictureUrl: string;
  websiteUrl: string;
  gender: string;
  birthdate: string;
  zoneinfo: string;
  locale: string;
  phoneNumber: string;
  addressStreet: string;
  addressLocality: string;
  addressRegion: string;
  addressPostalCode: string;
  addressCountry: string;
}

function initProfileForm(user: User): ProfileFormState {
  return {
    givenName: user.givenName ?? '',
    familyName: user.familyName ?? '',
    middleName: user.middleName ?? '',
    nickname: user.nickname ?? '',
    preferredUsername: user.preferredUsername ?? '',
    profileUrl: user.profileUrl ?? '',
    pictureUrl: user.pictureUrl ?? '',
    websiteUrl: user.websiteUrl ?? '',
    gender: user.gender ?? '',
    birthdate: user.birthdate ?? '',
    zoneinfo: user.zoneinfo ?? '',
    locale: user.locale ?? '',
    phoneNumber: user.phoneNumber ?? '',
    addressStreet: user.addressStreet ?? '',
    addressLocality: user.addressLocality ?? '',
    addressRegion: user.addressRegion ?? '',
    addressPostalCode: user.addressPostalCode ?? '',
    addressCountry: user.addressCountry ?? '',
  };
}

interface ProfileTabProps {
  user: User;
}

function ProfileTab({ user }: ProfileTabProps) {
  const styles = useStyles();
  const updateUser = useUpdateUser();
  const [form, setForm] = useState<ProfileFormState>(() => initProfileForm(user));
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const original = useMemo(() => initProfileForm(user), [user]);

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(original),
    [form, original],
  );

  const updateField = useCallback(
    (field: keyof ProfileFormState) =>
      (_ev: unknown, data: { value: string }) => {
        setForm((prev) => ({ ...prev, [field]: data.value }));
      },
    [],
  );

  const handleSave = useCallback(async () => {
    setSaveSuccess(false);
    setSaveError(null);
    // Build payload with only changed fields
    const payload: Partial<UpdateUserRequest> = {};
    for (const key of Object.keys(form) as Array<keyof ProfileFormState>) {
      if (form[key] !== original[key]) {
        (payload as Record<string, string | undefined>)[key] =
          form[key] || undefined;
      }
    }
    try {
      await updateUser.mutateAsync({ id: user.id, data: payload });
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Failed to save profile',
      );
    }
  }, [user.id, form, original, updateUser]);

  const handleReset = useCallback(() => {
    setForm(initProfileForm(user));
    setSaveSuccess(false);
    setSaveError(null);
  }, [user]);

  return (
    <div className={styles.section}>
      {saveSuccess && (
        <MessageBar intent="success">
          <MessageBarBody>Profile saved successfully.</MessageBarBody>
        </MessageBar>
      )}
      {saveError && (
        <MessageBar intent="error">
          <MessageBarBody>{saveError}</MessageBarBody>
        </MessageBar>
      )}

      {/* Personal Information */}
      <Text size={400} className={styles.sectionTitle}>
        Personal Information
      </Text>
      <div className={styles.formGrid}>
        <div className={styles.formField}>
          <Label weight="semibold">Given Name</Label>
          <Input
            value={form.givenName}
            onChange={updateField('givenName')}
            placeholder="John"
          />
        </div>
        <div className={styles.formField}>
          <Label weight="semibold">Family Name</Label>
          <Input
            value={form.familyName}
            onChange={updateField('familyName')}
            placeholder="Doe"
          />
        </div>
        <div className={styles.formField}>
          <Label weight="semibold">Middle Name</Label>
          <Input
            value={form.middleName}
            onChange={updateField('middleName')}
          />
        </div>
        <div className={styles.formField}>
          <Label weight="semibold">Nickname</Label>
          <Input
            value={form.nickname}
            onChange={updateField('nickname')}
          />
        </div>
        <div className={styles.formField}>
          <Label weight="semibold">Preferred Username</Label>
          <Input
            value={form.preferredUsername}
            onChange={updateField('preferredUsername')}
          />
        </div>
        <div className={styles.formField}>
          <Label weight="semibold">Gender</Label>
          <Input
            value={form.gender}
            onChange={updateField('gender')}
          />
        </div>
        <div className={styles.formField}>
          <Label weight="semibold">Birthdate</Label>
          <Input
            value={form.birthdate}
            onChange={updateField('birthdate')}
            placeholder="YYYY-MM-DD"
          />
        </div>
        <div className={styles.formField}>
          <Label weight="semibold">Locale</Label>
          <Input
            value={form.locale}
            onChange={updateField('locale')}
            placeholder="en"
          />
        </div>
        <div className={styles.formField}>
          <Label weight="semibold">Timezone</Label>
          <Input
            value={form.zoneinfo}
            onChange={updateField('zoneinfo')}
            placeholder="Europe/Amsterdam"
          />
        </div>
      </div>

      <Divider />

      {/* Contact */}
      <Text size={400} className={styles.sectionTitle}>
        Contact
      </Text>
      <div className={styles.formGrid}>
        <div className={styles.formFieldFull}>
          <Label weight="semibold">Email</Label>
          <Input value={user.email} disabled />
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            Email cannot be changed from the profile editor.
          </Text>
        </div>
        <div className={styles.formField}>
          <Label weight="semibold">Phone Number</Label>
          <Input
            value={form.phoneNumber}
            onChange={updateField('phoneNumber')}
            placeholder="+1234567890"
          />
        </div>
      </div>

      <Divider />

      {/* URLs */}
      <Text size={400} className={styles.sectionTitle}>
        Online Presence
      </Text>
      <div className={styles.formGrid}>
        <div className={styles.formField}>
          <Label weight="semibold">Profile URL</Label>
          <Input
            value={form.profileUrl}
            onChange={updateField('profileUrl')}
            placeholder="https://..."
          />
        </div>
        <div className={styles.formField}>
          <Label weight="semibold">Picture URL</Label>
          <Input
            value={form.pictureUrl}
            onChange={updateField('pictureUrl')}
            placeholder="https://..."
          />
        </div>
        <div className={styles.formField}>
          <Label weight="semibold">Website URL</Label>
          <Input
            value={form.websiteUrl}
            onChange={updateField('websiteUrl')}
            placeholder="https://..."
          />
        </div>
      </div>

      <Divider />

      {/* Address */}
      <Text size={400} className={styles.sectionTitle}>
        Address
      </Text>
      <div className={styles.formGrid}>
        <div className={styles.formFieldFull}>
          <Label weight="semibold">Street Address</Label>
          <Input
            value={form.addressStreet}
            onChange={updateField('addressStreet')}
          />
        </div>
        <div className={styles.formField}>
          <Label weight="semibold">City / Locality</Label>
          <Input
            value={form.addressLocality}
            onChange={updateField('addressLocality')}
          />
        </div>
        <div className={styles.formField}>
          <Label weight="semibold">Region / State</Label>
          <Input
            value={form.addressRegion}
            onChange={updateField('addressRegion')}
          />
        </div>
        <div className={styles.formField}>
          <Label weight="semibold">Postal Code</Label>
          <Input
            value={form.addressPostalCode}
            onChange={updateField('addressPostalCode')}
          />
        </div>
        <div className={styles.formField}>
          <Label weight="semibold">Country (2-letter code)</Label>
          <Input
            value={form.addressCountry}
            onChange={updateField('addressCountry')}
            placeholder="US"
            maxLength={2}
          />
        </div>
      </div>

      {/* Save / Reset */}
      <div className={styles.formActions}>
        <Button
          appearance="primary"
          onClick={handleSave}
          disabled={!isDirty || updateUser.isPending}
        >
          {updateUser.isPending ? 'Saving...' : 'Save Profile'}
        </Button>
        <Button
          appearance="secondary"
          onClick={handleReset}
          disabled={!isDirty || updateUser.isPending}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status tab
// ---------------------------------------------------------------------------

interface StatusTabProps {
  user: User;
  onAction: (action: UserStatusAction) => void;
  isMutating: boolean;
}

function StatusTab({ user, onAction, isMutating }: StatusTabProps) {
  const styles = useStyles();
  const available = USER_STATUS_TRANSITIONS[user.status] ?? [];

  return (
    <div className={styles.section}>
      <Card className={styles.statusCard}>
        <div className={styles.statusRow}>
          <Text weight="semibold" size={400}>
            Current Status:
          </Text>
          <StatusBadge status={user.status} size="large" />
        </div>

        <div className={styles.transitionInfo}>
          <Text size={300}>
            {user.status === 'active' &&
              'This user is active and can log in normally.'}
            {user.status === 'inactive' &&
              'This user is inactive and cannot log in. Activate to restore access.'}
            {user.status === 'suspended' &&
              'This user is suspended and cannot log in. Active sessions have been terminated.'}
            {user.status === 'locked' &&
              'This user account is locked (usually due to too many failed login attempts). Unlock to restore access.'}
          </Text>
        </div>

        {available.length > 0 && (
          <>
            <Divider />
            <Text weight="semibold" size={300}>
              Available Actions
            </Text>
            <div className={styles.statusActions}>
              {available.map((action) => {
                const config = USER_ACTION_CONFIG[action];
                return (
                  <Button
                    key={action}
                    appearance={action === 'activate' || action === 'unlock' ? 'primary' : 'secondary'}
                    icon={config.icon}
                    onClick={() => onAction(action)}
                    disabled={isMutating}
                  >
                    {config.label}
                  </Button>
                );
              })}
            </div>
          </>
        )}

        {available.length === 0 && (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            No status transitions are available from the current state.
          </Text>
        )}
      </Card>

      {/* Status transition reference */}
      <Card className={styles.statusCard}>
        <Text weight="semibold" size={300}>
          Status Lifecycle Reference
        </Text>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '100px auto',
            gap: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
            fontSize: tokens.fontSizeBase200,
            color: tokens.colorNeutralForeground3,
          }}
        >
          <Text size={200} weight="semibold">Active →</Text>
          <Text size={200}>Deactivate, Suspend</Text>
          <Text size={200} weight="semibold">Inactive →</Text>
          <Text size={200}>Activate</Text>
          <Text size={200} weight="semibold">Suspended →</Text>
          <Text size={200}>Activate</Text>
          <Text size={200} weight="semibold">Locked →</Text>
          <Text size={200}>Unlock</Text>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roles tab
// ---------------------------------------------------------------------------

interface RolesTabProps {
  user: User;
}

function RolesTab({ user }: RolesTabProps) {
  const styles = useStyles();
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const { data: userRoles = [], isLoading: rolesLoading } = useUserRoles(
    user.organizationId,
    user.id,
  );
  const { data: appsData } = useApplications({ limit: 100 });
  const { data: availableRolesData } = useRoles(selectedAppId);
  const assignRoles = useAssignUserRoles();
  const removeRoles = useRemoveUserRoles();

  // Filter apps to this user's org
  const orgApps = useMemo(
    () =>
      (appsData?.data ?? []).filter(
        (app: Application) => app.organizationId === user.organizationId,
      ),
    [appsData, user.organizationId],
  );

  const availableRoles = useMemo(
    () => availableRolesData?.data ?? [],
    [availableRolesData],
  );

  // Filter out already-assigned roles from the available list
  const assignedRoleIds = useMemo(
    () => new Set((userRoles as Role[]).map((r) => r.id)),
    [userRoles],
  );

  const filteredAvailableRoles = useMemo(
    () => availableRoles.filter((r: Role) => !assignedRoleIds.has(r.id)),
    [availableRoles, assignedRoleIds],
  );

  const handleAssign = useCallback(async () => {
    if (!selectedRoleId) return;
    setError(null);
    try {
      await assignRoles.mutateAsync({
        orgId: user.organizationId,
        userId: user.id,
        roleIds: [selectedRoleId],
      });
      setSelectedRoleId('');
      setShowAddForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign role');
    }
  }, [selectedRoleId, assignRoles, user]);

  const handleRemove = useCallback(
    async (roleId: string) => {
      setError(null);
      try {
        await removeRoles.mutateAsync({
          orgId: user.organizationId,
          userId: user.id,
          roleIds: [roleId],
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove role');
      }
    },
    [removeRoles, user],
  );

  if (rolesLoading) {
    return <Spinner label="Loading roles..." />;
  }

  // Build a lookup: appId → app name
  const appNameMap = new Map(orgApps.map((a: Application) => [a.id, a.name]));

  // Group user roles by application
  const rolesByApp = new Map<string, Role[]>();
  for (const role of userRoles as Role[]) {
    const existing = rolesByApp.get(role.applicationId) ?? [];
    existing.push(role);
    rolesByApp.set(role.applicationId, existing);
  }

  return (
    <div className={styles.section}>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {/* Assigned roles */}
      {rolesByApp.size === 0 && !showAddForm && (
        <div className={styles.emptyState}>
          <Text>No roles assigned to this user.</Text>
        </div>
      )}

      {Array.from(rolesByApp.entries()).map(([appId, roles]) => (
        <div key={appId}>
          <Text size={300} weight="semibold" style={{ paddingBottom: tokens.spacingVerticalXS }}>
            {appNameMap.get(appId) ?? appId}
          </Text>
          <div className={styles.rolesList}>
            {roles.map((role) => (
              <div key={role.id} className={styles.roleItem}>
                <div className={styles.roleItemInfo}>
                  <Text weight="semibold">{role.name}</Text>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {role.slug}
                    {role.isSystem && ' (system)'}
                  </Text>
                </div>
                <Button
                  appearance="subtle"
                  icon={<DeleteRegular />}
                  size="small"
                  onClick={() => handleRemove(role.id)}
                  disabled={removeRoles.isPending}
                  aria-label={`Remove ${role.name}`}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Add role form */}
      {showAddForm ? (
        <Card className={styles.statusCard}>
          <Text weight="semibold" size={300}>
            Assign Role
          </Text>
          <div className={styles.addRoleForm}>
            <div className={styles.formField}>
              <Label>Application</Label>
              <Dropdown
                placeholder="Select application..."
                value={orgApps.find((a: Application) => a.id === selectedAppId)?.name ?? ''}
                onOptionSelect={(_ev, data) => {
                  setSelectedAppId(data.optionValue as string);
                  setSelectedRoleId('');
                }}
              >
                {orgApps.map((app: Application) => (
                  <Option key={app.id} value={app.id}>
                    {app.name}
                  </Option>
                ))}
              </Dropdown>
            </div>
            <div className={styles.formField}>
              <Label>Role</Label>
              <Dropdown
                placeholder="Select role..."
                value={
                  filteredAvailableRoles.find((r: Role) => r.id === selectedRoleId)?.name ?? ''
                }
                onOptionSelect={(_ev, data) => {
                  setSelectedRoleId(data.optionValue as string);
                }}
                disabled={!selectedAppId}
              >
                {filteredAvailableRoles.map((role: Role) => (
                  <Option key={role.id} value={role.id}>
                    {role.name}
                  </Option>
                ))}
              </Dropdown>
            </div>
            <div style={{ display: 'flex', gap: tokens.spacingHorizontalS }}>
              <Button
                appearance="primary"
                onClick={handleAssign}
                disabled={!selectedRoleId || assignRoles.isPending}
              >
                {assignRoles.isPending ? 'Assigning...' : 'Assign'}
              </Button>
              <Button
                appearance="secondary"
                onClick={() => {
                  setShowAddForm(false);
                  setSelectedAppId('');
                  setSelectedRoleId('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Button
          appearance="primary"
          icon={<AddRegular />}
          onClick={() => setShowAddForm(true)}
        >
          Assign Role
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Claims tab
// ---------------------------------------------------------------------------

interface ClaimsTabProps {
  user: User;
}

function ClaimsTab({ user }: ClaimsTabProps) {
  const styles = useStyles();
  const { data: claimValues, isLoading } = useUserClaimValues(user.id);
  const setClaimValue = useSetUserClaimValue();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleEdit = useCallback(
    (cv: UserClaimValue) => {
      setEditingId(cv.claimDefinitionId);
      setEditValue(
        typeof cv.value === 'string' ? cv.value : JSON.stringify(cv.value),
      );
      setError(null);
      setSuccess(false);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!editingId) return;
    setError(null);
    setSuccess(false);
    try {
      // Try to parse as JSON, fall back to string
      let parsedValue: unknown = editValue;
      try {
        parsedValue = JSON.parse(editValue);
      } catch {
        // Keep as string
      }
      await setClaimValue.mutateAsync({
        userId: user.id,
        claimDefinitionId: editingId,
        value: parsedValue,
      });
      setEditingId(null);
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update claim value',
      );
    }
  }, [editingId, editValue, setClaimValue, user.id]);

  if (isLoading) {
    return <Spinner label="Loading claim values..." />;
  }

  const values = claimValues ?? [];

  return (
    <div className={styles.section}>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {success && (
        <MessageBar intent="success">
          <MessageBarBody>Claim value updated successfully.</MessageBarBody>
        </MessageBar>
      )}

      {values.length === 0 ? (
        <div className={styles.emptyState}>
          <Text>No custom claim values set for this user.</Text>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block', paddingTop: tokens.spacingVerticalS }}>
            Claim values can be assigned via the application&apos;s custom claims management.
          </Text>
        </div>
      ) : (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr auto auto',
              gap: tokens.spacingHorizontalS,
              padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
              fontWeight: Number(tokens.fontWeightSemibold),
              fontSize: tokens.fontSizeBase200,
              color: tokens.colorNeutralForeground3,
              borderBottom: `2px solid ${tokens.colorNeutralStroke1}`,
            }}
          >
            <Text size={200} weight="semibold">Claim Definition</Text>
            <Text size={200} weight="semibold">Value</Text>
            <Text size={200} weight="semibold">Updated</Text>
            <Text size={200} weight="semibold">Actions</Text>
          </div>
          {values.map((cv: UserClaimValue) => (
            <div key={cv.id} className={styles.claimRow}>
              <div className={styles.claimInfo}>
                <Text className={styles.monoValue}>
                  {cv.claimDefinitionId.substring(0, 8)}…
                </Text>
              </div>
              <div style={{ flex: 1 }}>
                {editingId === cv.claimDefinitionId ? (
                  <div style={{ display: 'flex', gap: tokens.spacingHorizontalXS }}>
                    <Input
                      value={editValue}
                      onChange={(_e, d) => setEditValue(d.value)}
                      size="small"
                      style={{ flex: 1 }}
                    />
                    <Button
                      size="small"
                      appearance="primary"
                      onClick={handleSave}
                      disabled={setClaimValue.isPending}
                    >
                      Save
                    </Button>
                    <Button
                      size="small"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Text className={styles.monoValue}>
                    {typeof cv.value === 'string'
                      ? cv.value
                      : JSON.stringify(cv.value)}
                  </Text>
                )}
              </div>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                {formatShortDate(cv.updatedAt)}
              </Text>
              {editingId !== cv.claimDefinitionId && (
                <Button
                  size="small"
                  appearance="subtle"
                  onClick={() => handleEdit(cv)}
                >
                  Edit
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Security tab
// ---------------------------------------------------------------------------

interface SecurityTabProps {
  user: User;
}

function SecurityTab({ user }: SecurityTabProps) {
  const styles = useStyles();
  const setPassword = useSetPassword();
  const clearPassword = useClearPassword();
  const verifyEmail = useVerifyEmail();

  const [newPassword, setNewPassword] = useState('');
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showClearPasswordConfirm, setShowClearPasswordConfirm] = useState(false);
  const [showVerifyEmailConfirm, setShowVerifyEmailConfirm] = useState(false);

  const handleSetPassword = useCallback(async () => {
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await setPassword.mutateAsync({ userId: user.id, password: newPassword });
      setNewPassword('');
      setShowSetPassword(false);
      setSuccess('Password updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password');
    }
  }, [newPassword, setPassword, user.id]);

  const handleClearPassword = useCallback(async () => {
    setError(null);
    setSuccess(null);
    try {
      await clearPassword.mutateAsync(user.id);
      setShowClearPasswordConfirm(false);
      setSuccess('Password cleared. User is now passwordless.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear password');
    }
  }, [clearPassword, user.id]);

  const handleVerifyEmail = useCallback(async () => {
    setError(null);
    setSuccess(null);
    try {
      await verifyEmail.mutateAsync(user.id);
      setShowVerifyEmailConfirm(false);
      setSuccess('Email marked as verified.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to verify email',
      );
    }
  }, [verifyEmail, user.id]);

  return (
    <div className={styles.section}>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {success && (
        <MessageBar intent="success">
          <MessageBarBody>{success}</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.securityGrid}>
        {/* Two-Factor Authentication */}
        <Card className={styles.securityCard}>
          <div className={styles.securityCardHeader}>
            <ShieldRegular />
            <Text weight="semibold">Two-Factor Authentication</Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
            <Badge
              appearance="filled"
              color={user.twoFactorEnabled ? 'success' : 'informative'}
            >
              {user.twoFactorEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
            {user.twoFactorMethod && (
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                Method: {user.twoFactorMethod}
              </Text>
            )}
          </div>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {user.twoFactorEnabled
              ? 'Two-factor authentication is active for this user. Manage via CLI: porta user 2fa'
              : 'Two-factor authentication has not been set up by this user.'}
          </Text>
        </Card>

        {/* Email Verification */}
        <Card className={styles.securityCard}>
          <div className={styles.securityCardHeader}>
            <MailRegular />
            <Text weight="semibold">Email Verification</Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
            <Badge
              appearance="filled"
              color={user.emailVerified ? 'success' : 'warning'}
            >
              {user.emailVerified ? 'Verified' : 'Unverified'}
            </Badge>
          </div>
          {!user.emailVerified && (
            <Button
              appearance="primary"
              size="small"
              onClick={() => setShowVerifyEmailConfirm(true)}
              disabled={verifyEmail.isPending}
            >
              Mark as Verified
            </Button>
          )}
        </Card>

        {/* Password */}
        <Card className={styles.securityCard}>
          <div className={styles.securityCardHeader}>
            <KeyRegular />
            <Text weight="semibold">Password</Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
            <Badge
              appearance="filled"
              color={user.hasPassword ? 'success' : 'informative'}
            >
              {user.hasPassword ? 'Password Set' : 'No Password'}
            </Badge>
            {user.passwordChangedAt && (
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                Changed: {formatShortDate(user.passwordChangedAt)}
              </Text>
            )}
          </div>

          {showSetPassword ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS }}>
              <Input
                type="password"
                value={newPassword}
                onChange={(_e, d) => setNewPassword(d.value)}
                placeholder="New password (min 8 characters)"
              />
              <div style={{ display: 'flex', gap: tokens.spacingHorizontalS }}>
                <Button
                  appearance="primary"
                  size="small"
                  onClick={handleSetPassword}
                  disabled={setPassword.isPending || newPassword.length < 8}
                >
                  {setPassword.isPending ? 'Setting...' : 'Set Password'}
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    setShowSetPassword(false);
                    setNewPassword('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: tokens.spacingHorizontalS }}>
              <Button
                size="small"
                onClick={() => setShowSetPassword(true)}
              >
                {user.hasPassword ? 'Change Password' : 'Set Password'}
              </Button>
              {user.hasPassword && (
                <Button
                  size="small"
                  appearance="subtle"
                  onClick={() => setShowClearPasswordConfirm(true)}
                >
                  Clear Password
                </Button>
              )}
            </div>
          )}
        </Card>

        {/* Login Activity */}
        <Card className={styles.securityCard}>
          <div className={styles.securityCardHeader}>
            <LockClosedRegular />
            <Text weight="semibold">Login Activity</Text>
          </div>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <Text size={200} className={styles.infoLabel}>Last Login</Text>
              <Text className={styles.infoValue}>
                {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never'}
              </Text>
            </div>
            <div className={styles.infoItem}>
              <Text size={200} className={styles.infoLabel}>Failed Attempts</Text>
              <Text
                className={styles.infoValue}
                style={{
                  color:
                    user.failedLoginCount > 0
                      ? tokens.colorPaletteRedForeground1
                      : undefined,
                }}
              >
                {user.failedLoginCount}
              </Text>
            </div>
          </div>
        </Card>
      </div>

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={showClearPasswordConfirm}
        onDismiss={() => setShowClearPasswordConfirm(false)}
        onConfirm={handleClearPassword}
        title="Clear Password"
        confirmLabel="Clear Password"
        destructive
        loading={clearPassword.isPending}
      >
        <Text>
          This will remove the user&apos;s password. They will only be able to log in
          using passwordless methods (e.g., magic link). Are you sure?
        </Text>
      </ConfirmDialog>

      <ConfirmDialog
        open={showVerifyEmailConfirm}
        onDismiss={() => setShowVerifyEmailConfirm(false)}
        onConfirm={handleVerifyEmail}
        title="Verify Email"
        confirmLabel="Mark as Verified"
        loading={verifyEmail.isPending}
      >
        <Text>
          This will mark the user&apos;s email ({user.email}) as verified without
          requiring them to click a verification link. Proceed?
        </Text>
      </ConfirmDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sessions tab
// ---------------------------------------------------------------------------

interface SessionsTabProps {
  user: User;
}

function SessionsTab({ user }: SessionsTabProps) {
  const styles = useStyles();
  const bulkRevoke = useBulkRevokeSessions();
  const [showConfirm, setShowConfirm] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRevokeAll = useCallback(async () => {
    setError(null);
    setSuccess(false);
    try {
      await bulkRevoke.mutateAsync({ userId: user.id });
      setShowConfirm(false);
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to revoke sessions',
      );
    }
  }, [bulkRevoke, user.id]);

  return (
    <div className={styles.section}>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {success && (
        <MessageBar intent="success">
          <MessageBarBody>
            All sessions for this user have been revoked.
          </MessageBarBody>
        </MessageBar>
      )}

      <Card className={styles.statusCard}>
        <Text weight="semibold" size={400}>
          Session Information
        </Text>
        <div className={styles.sessionInfo}>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <Text size={200} className={styles.infoLabel}>Last Login</Text>
              <Text className={styles.infoValue}>
                {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never logged in'}
              </Text>
            </div>
            <div className={styles.infoItem}>
              <Text size={200} className={styles.infoLabel}>Account Status</Text>
              <div><StatusBadge status={user.status} /></div>
            </div>
            <div className={styles.infoItem}>
              <Text size={200} className={styles.infoLabel}>Failed Login Count</Text>
              <Text className={styles.infoValue}>{user.failedLoginCount}</Text>
            </div>
            <div className={styles.infoItem}>
              <Text size={200} className={styles.infoLabel}>Password Changed</Text>
              <Text className={styles.infoValue}>
                {user.passwordChangedAt
                  ? formatDate(user.passwordChangedAt)
                  : 'Never'}
              </Text>
            </div>
          </div>
        </div>

        <Divider />

        <Text weight="semibold" size={300}>
          Session Actions
        </Text>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          Revoking all sessions will force the user to log in again on all devices.
        </Text>
        <div>
          <Button
            appearance="secondary"
            icon={<DesktopRegular />}
            onClick={() => setShowConfirm(true)}
            disabled={bulkRevoke.isPending}
          >
            Revoke All Sessions
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={showConfirm}
        onDismiss={() => setShowConfirm(false)}
        onConfirm={handleRevokeAll}
        title="Revoke All Sessions"
        confirmLabel="Revoke All"
        destructive
        loading={bulkRevoke.isPending}
      >
        <Text>
          This will terminate all active sessions for {user.email}. They will
          need to log in again on all devices. Continue?
        </Text>
      </ConfirmDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History tab
// ---------------------------------------------------------------------------

interface HistoryTabProps {
  userId: string;
}

function HistoryTab({ userId }: HistoryTabProps) {
  const { data, isLoading } = useAuditLog({
    userId,
    limit: 50,
  });

  if (isLoading) {
    return <Spinner label="Loading history..." />;
  }

  // Filter audit entries for this user (as target or actor)
  const entries = (data?.data ?? [])
    .filter(
      (entry: AuditEntry) =>
        entry.userId === userId || entry.actorId === userId,
    )
    .map(auditToTimeline);

  return (
    <AuditTimeline
      entries={entries}
      emptyMessage="No history available for this user."
    />
  );
}

// ---------------------------------------------------------------------------
// Main UserDetail component
// ---------------------------------------------------------------------------

export function UserDetail() {
  const styles = useStyles();
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  // Fetch user data
  const { data: user, isLoading, isError, error } = useUser(userId ?? '');

  // Status transition state
  const [pendingAction, setPendingAction] = useState<UserStatusAction | null>(
    null,
  );
  const [typeConfirmed, setTypeConfirmed] = useState(false);

  // Status mutation hooks
  const deactivateMutation = useDeactivateUser();
  const activateMutation = useActivateUser();
  const suspendMutation = useSuspendUser();
  const unlockMutation = useUnlockUser();

  const isMutating =
    deactivateMutation.isPending ||
    activateMutation.isPending ||
    suspendMutation.isPending ||
    unlockMutation.isPending;

  /** Execute a status transition */
  const handleConfirmAction = useCallback(async () => {
    if (!userId || !pendingAction) return;

    try {
      switch (pendingAction) {
        case 'deactivate':
          await deactivateMutation.mutateAsync(userId);
          break;
        case 'activate':
          await activateMutation.mutateAsync(userId);
          break;
        case 'suspend':
          await suspendMutation.mutateAsync(userId);
          break;
        case 'unlock':
          await unlockMutation.mutateAsync(userId);
          break;
      }
      setPendingAction(null);
      setTypeConfirmed(false);
    } catch {
      // Error is handled by React Query — mutation error state
    }
  }, [
    userId,
    pendingAction,
    deactivateMutation,
    activateMutation,
    suspendMutation,
    unlockMutation,
  ]);

  /** Close the confirmation dialog */
  const handleDismissAction = useCallback(() => {
    setPendingAction(null);
    setTypeConfirmed(false);
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <EntityDetailTabs
        title="User"
        loading
        tabs={[]}
        backPath="/users"
      />
    );
  }

  // Error state
  if (isError || !user) {
    return (
      <div className={styles.errorContainer}>
        <MessageBar intent="error">
          <MessageBarBody>
            {error instanceof Error ? error.message : 'User not found.'}
          </MessageBarBody>
        </MessageBar>
        <Button
          appearance="primary"
          onClick={() => navigate('/users')}
          style={{ marginTop: tokens.spacingVerticalL }}
        >
          Back to Users
        </Button>
      </div>
    );
  }

  // Build tabs
  const tabs: EntityTab[] = [
    {
      key: 'overview',
      label: 'Overview',
      icon: <InfoRegular />,
      content: <OverviewTab user={user} />,
    },
    {
      key: 'profile',
      label: 'Profile',
      icon: <PersonRegular />,
      content: <ProfileTab user={user} />,
    },
    {
      key: 'status',
      label: 'Status',
      icon: <ArrowSyncRegular />,
      content: (
        <StatusTab
          user={user}
          onAction={setPendingAction}
          isMutating={isMutating}
        />
      ),
    },
    {
      key: 'roles',
      label: 'Roles',
      icon: <ShieldCheckmarkRegular />,
      content: <RolesTab user={user} />,
    },
    {
      key: 'claims',
      label: 'Claims',
      icon: <TagRegular />,
      content: <ClaimsTab user={user} />,
    },
    {
      key: 'security',
      label: 'Security',
      icon: <LockClosedRegular />,
      content: <SecurityTab user={user} />,
    },
    {
      key: 'sessions',
      label: 'Sessions',
      icon: <DesktopRegular />,
      content: <SessionsTab user={user} />,
    },
    {
      key: 'history',
      label: 'History',
      icon: <HistoryRegular />,
      content: <HistoryTab userId={user.id} />,
    },
  ];

  // Determine the confirm dialog config
  const actionConfig = pendingAction
    ? USER_ACTION_CONFIG[pendingAction]
    : null;
  const needsTypeConfirm =
    pendingAction === 'suspend' || pendingAction === 'deactivate';

  return (
    <>
      <EntityDetailTabs
        title={getUserDisplayName(user)}
        subtitle={user.email}
        status={user.status}
        tabs={tabs}
        backPath="/users"
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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: tokens.spacingVerticalM,
            }}
          >
            <Text>{actionConfig.description}</Text>
            {needsTypeConfirm && (
              <TypeToConfirm
                confirmValue={user.email}
                onConfirmedChange={setTypeConfirmed}
                prompt={`Type "${user.email}" to confirm this action:`}
              />
            )}
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
