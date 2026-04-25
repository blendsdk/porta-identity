/**
 * Invite user wizard page.
 * 5-step wizard using WizardStepper:
 *   Step 1: Basic info — email, display name, personal message, organization
 *   Step 2: Role assignment — select application(s), assign roles per app
 *   Step 3: Custom claims — set claim values per application
 *   Step 4: Preview email — render invitation email preview
 *   Step 5: Send & confirm — submit invitation, show success
 *
 * Uses the invitation API endpoints:
 *   POST /organizations/:orgId/users/invite — send invitation
 *   POST /organizations/:orgId/users/invite/preview — preview email
 */

import { useState, useCallback, useMemo } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Input,
  Label,
  Card,
  Dropdown,
  Option,
  Textarea,
  Checkbox,
  MessageBar,
  MessageBarBody,
  Badge,
  Spinner,
  Divider,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  MailRegular,
  PersonRegular,
  ShieldKeyholeRegular,
  TagRegular,
  EyeRegular,
  CheckmarkCircleRegular,
} from '@fluentui/react-icons';
import { useNavigate, useSearchParams } from 'react-router';
import {
  useInviteUser,
  useInvitePreview,
  type InviteUserRequest,
} from '../../api/users';
import { useOrganizations } from '../../api/organizations';
import { useApplications } from '../../api/applications';
import { useRoles } from '../../api/roles';
import { useClaimDefinitions } from '../../api/custom-claims';
import { WizardStepper, type WizardStep } from '../../components/WizardStepper';
import type { Role, ClaimDefinition, Application } from '../../types';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    maxWidth: '780px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
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
  fieldHint: {
    color: tokens.colorNeutralForeground3,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
  },
  appSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  appHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roleGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalM,
  },
  claimRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    paddingLeft: tokens.spacingHorizontalM,
  },
  claimLabel: {
    minWidth: '140px',
    fontWeight: tokens.fontWeightSemibold,
  },
  reviewGrid: {
    display: 'grid',
    gridTemplateColumns: '160px 1fr',
    gap: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    alignItems: 'start',
  },
  reviewLabel: {
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
  },
  previewFrame: {
    width: '100%',
    minHeight: '400px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  previewFallback: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '200px',
    color: tokens.colorNeutralForeground3,
  },
  successCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingVerticalL,
    textAlign: 'center',
  },
  successActions: {
    display: 'flex',
    justifyContent: 'center',
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalM,
  },
  selectedApps: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXL,
    color: tokens.colorNeutralForeground3,
  },
  badgeRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
  },
});

// ---------------------------------------------------------------------------
// Wizard form state
// ---------------------------------------------------------------------------

/** Role assignment — application + role */
interface RoleAssignment {
  applicationId: string;
  roleId: string;
}

/** Claim assignment — application + claim definition + value */
interface ClaimAssignment {
  applicationId: string;
  claimDefinitionId: string;
  value: string;
}

interface WizardFormState {
  // Step 1: Basic info
  organizationId: string;
  email: string;
  displayName: string;
  personalMessage: string;
  locale: string;
  // Step 2: Role assignments
  selectedAppIds: string[];
  roleAssignments: RoleAssignment[];
  // Step 3: Claim assignments
  claimAssignments: ClaimAssignment[];
}

const INITIAL_STATE: WizardFormState = {
  organizationId: '',
  email: '',
  displayName: '',
  personalMessage: '',
  locale: '',
  selectedAppIds: [],
  roleAssignments: [],
  claimAssignments: [],
};

// ---------------------------------------------------------------------------
// Step 1: Basic Info
// ---------------------------------------------------------------------------

function Step1BasicInfo({
  form,
  onUpdate,
  errors,
  organizations,
}: {
  form: WizardFormState;
  onUpdate: (partial: Partial<WizardFormState>) => void;
  errors: Record<string, string>;
  organizations: { id: string; name: string }[];
}) {
  const styles = useStyles();

  return (
    <div className={styles.section}>
      {/* Organization */}
      <div className={styles.field}>
        <Label required weight="semibold">Organization</Label>
        <Dropdown
          placeholder="Select an organization"
          value={organizations.find((o) => o.id === form.organizationId)?.name ?? ''}
          onOptionSelect={(_ev, data) => onUpdate({
            organizationId: data.optionValue ?? '',
            // Reset app-dependent state when org changes
            selectedAppIds: [],
            roleAssignments: [],
            claimAssignments: [],
          })}
        >
          {organizations.map((org) => (
            <Option key={org.id} value={org.id}>{org.name}</Option>
          ))}
        </Dropdown>
        {errors.organizationId && (
          <Text size={200} className={styles.error}>{errors.organizationId}</Text>
        )}
      </div>

      {/* Email */}
      <div className={styles.field}>
        <Label required weight="semibold">Email Address</Label>
        <Input
          value={form.email}
          onChange={(_ev, data) => onUpdate({ email: data.value })}
          placeholder="user@example.com"
          type="email"
          contentBefore={<MailRegular />}
        />
        <Text size={200} className={styles.fieldHint}>
          If the user already exists in this organization, they will receive a new invitation link.
        </Text>
        {errors.email && (
          <Text size={200} className={styles.error}>{errors.email}</Text>
        )}
      </div>

      {/* Display Name */}
      <div className={styles.field}>
        <Label weight="semibold">Display Name</Label>
        <Input
          value={form.displayName}
          onChange={(_ev, data) => onUpdate({ displayName: data.value })}
          placeholder="e.g. Jane Smith"
          contentBefore={<PersonRegular />}
        />
        <Text size={200} className={styles.fieldHint}>
          Optional. Used in the invitation email greeting.
        </Text>
      </div>

      {/* Personal Message */}
      <div className={styles.field}>
        <Label weight="semibold">Personal Message</Label>
        <Textarea
          value={form.personalMessage}
          onChange={(_ev, data) => onUpdate({ personalMessage: data.value })}
          placeholder="Welcome to our platform! We're excited to have you on board."
          resize="vertical"
          rows={3}
        />
        <Text size={200} className={styles.fieldHint}>
          Optional. Included in the invitation email (max 500 characters).
        </Text>
        {form.personalMessage.length > 0 && (
          <Text size={200} className={form.personalMessage.length > 500 ? styles.error : styles.fieldHint}>
            {form.personalMessage.length}/500
          </Text>
        )}
      </div>

      {/* Locale */}
      <div className={styles.field}>
        <Label weight="semibold">Email Language</Label>
        <Dropdown
          placeholder="Default (organization locale)"
          value={form.locale || 'Default (organization locale)'}
          onOptionSelect={(_ev, data) => onUpdate({ locale: data.optionValue ?? '' })}
        >
          <Option value="">Default (organization locale)</Option>
          <Option value="en">English</Option>
          <Option value="nl">Nederlands</Option>
          <Option value="de">Deutsch</Option>
          <Option value="fr">Français</Option>
        </Dropdown>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Role Assignment
// ---------------------------------------------------------------------------

function Step2Roles({
  form,
  onUpdate,
  applications,
}: {
  form: WizardFormState;
  onUpdate: (partial: Partial<WizardFormState>) => void;
  applications: Application[];
}) {
  const styles = useStyles();

  // Fetch roles for each selected app
  // We use individual hooks per-app via a sub-component
  const toggleApp = useCallback(
    (appId: string, checked: boolean) => {
      const current = new Set(form.selectedAppIds);
      if (checked) {
        current.add(appId);
      } else {
        current.delete(appId);
        // Remove role assignments for this app
        onUpdate({
          selectedAppIds: Array.from(current),
          roleAssignments: form.roleAssignments.filter((r) => r.applicationId !== appId),
          claimAssignments: form.claimAssignments.filter((c) => c.applicationId !== appId),
        });
        return;
      }
      onUpdate({ selectedAppIds: Array.from(current) });
    },
    [form.selectedAppIds, form.roleAssignments, form.claimAssignments, onUpdate],
  );

  const toggleRole = useCallback(
    (appId: string, roleId: string, checked: boolean) => {
      if (checked) {
        onUpdate({
          roleAssignments: [...form.roleAssignments, { applicationId: appId, roleId }],
        });
      } else {
        onUpdate({
          roleAssignments: form.roleAssignments.filter(
            (r) => !(r.applicationId === appId && r.roleId === roleId),
          ),
        });
      }
    },
    [form.roleAssignments, onUpdate],
  );

  if (applications.length === 0) {
    return (
      <div className={styles.section}>
        <Text size={400} weight="semibold">
          <ShieldKeyholeRegular style={{ marginRight: '8px' }} />
          Application & Role Assignment
        </Text>
        <div className={styles.emptyState}>
          <Text>No applications available. Select an organization first, or create an application.</Text>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <Text size={400} weight="semibold">
        <ShieldKeyholeRegular style={{ marginRight: '8px' }} />
        Application & Role Assignment
      </Text>
      <Text size={200} className={styles.fieldHint}>
        Select applications to grant access, then choose roles within each. Roles are pre-assigned when the user accepts the invitation.
      </Text>

      {applications.map((app) => {
        const isSelected = form.selectedAppIds.includes(app.id);
        return (
          <div key={app.id} className={styles.appSection}>
            <div className={styles.appHeader}>
              <Checkbox
                checked={isSelected}
                onChange={(_ev, data) => toggleApp(app.id, !!data.checked)}
                label={
                  <Text weight="semibold">{app.name}</Text>
                }
              />
              {app.description && (
                <Text size={200} className={styles.fieldHint}>{app.description}</Text>
              )}
            </div>
            {isSelected && (
              <AppRoleSelector
                appId={app.id}
                selectedRoleIds={form.roleAssignments
                  .filter((r) => r.applicationId === app.id)
                  .map((r) => r.roleId)}
                onToggleRole={(roleId, checked) => toggleRole(app.id, roleId, checked)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Sub-component that fetches and displays roles for a specific application */
function AppRoleSelector({
  appId,
  selectedRoleIds,
  onToggleRole,
}: {
  appId: string;
  selectedRoleIds: string[];
  onToggleRole: (roleId: string, checked: boolean) => void;
}) {
  const styles = useStyles();
  const { data: rolesData, isLoading } = useRoles(appId, { limit: 100 });
  const roles = rolesData?.data ?? [];

  if (isLoading) {
    return (
      <div className={styles.roleGrid}>
        <Spinner size="tiny" label="Loading roles..." />
      </div>
    );
  }

  if (roles.length === 0) {
    return (
      <div className={styles.roleGrid}>
        <Text size={200} className={styles.fieldHint}>No roles defined for this application.</Text>
      </div>
    );
  }

  return (
    <div className={styles.roleGrid}>
      {roles.map((role: Role) => (
        <Checkbox
          key={role.id}
          checked={selectedRoleIds.includes(role.id)}
          onChange={(_ev, data) => onToggleRole(role.id, !!data.checked)}
          label={
            <span>
              {role.name}
              {role.description && (
                <Text size={200} style={{ display: 'block', color: tokens.colorNeutralForeground3 }}>
                  {role.description}
                </Text>
              )}
            </span>
          }
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Custom Claims
// ---------------------------------------------------------------------------

function Step3Claims({
  form,
  onUpdate,
  applications,
}: {
  form: WizardFormState;
  onUpdate: (partial: Partial<WizardFormState>) => void;
  applications: Application[];
}) {
  const styles = useStyles();

  // Only show claims for selected applications
  const selectedApps = applications.filter((a) => form.selectedAppIds.includes(a.id));

  const updateClaimValue = useCallback(
    (appId: string, claimDefId: string, value: string) => {
      const existing = form.claimAssignments.findIndex(
        (c) => c.applicationId === appId && c.claimDefinitionId === claimDefId,
      );
      if (existing >= 0) {
        const updated = [...form.claimAssignments];
        if (value === '') {
          // Remove empty claim values
          updated.splice(existing, 1);
        } else {
          updated[existing] = { applicationId: appId, claimDefinitionId: claimDefId, value };
        }
        onUpdate({ claimAssignments: updated });
      } else if (value !== '') {
        onUpdate({
          claimAssignments: [
            ...form.claimAssignments,
            { applicationId: appId, claimDefinitionId: claimDefId, value },
          ],
        });
      }
    },
    [form.claimAssignments, onUpdate],
  );

  if (selectedApps.length === 0) {
    return (
      <div className={styles.section}>
        <Text size={400} weight="semibold">
          <TagRegular style={{ marginRight: '8px' }} />
          Custom Claim Values
        </Text>
        <div className={styles.emptyState}>
          <Text>No applications selected. Go back to Step 2 to select applications.</Text>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <Text size={400} weight="semibold">
        <TagRegular style={{ marginRight: '8px' }} />
        Custom Claim Values
      </Text>
      <Text size={200} className={styles.fieldHint}>
        Set initial claim values for the invited user. These are pre-assigned when the invitation is accepted.
        Leave blank to skip.
      </Text>

      {selectedApps.map((app) => (
        <AppClaimEditor
          key={app.id}
          appId={app.id}
          appName={app.name}
          claimAssignments={form.claimAssignments.filter((c) => c.applicationId === app.id)}
          onUpdateClaim={(claimDefId, value) => updateClaimValue(app.id, claimDefId, value)}
        />
      ))}
    </div>
  );
}

/** Sub-component that fetches and displays claim definitions for a specific application */
function AppClaimEditor({
  appId,
  appName,
  claimAssignments,
  onUpdateClaim,
}: {
  appId: string;
  appName: string;
  claimAssignments: ClaimAssignment[];
  onUpdateClaim: (claimDefId: string, value: string) => void;
}) {
  const styles = useStyles();
  const { data: claimsData, isLoading } = useClaimDefinitions(appId, { limit: 100 });
  const claims = claimsData?.data ?? [];

  return (
    <div className={styles.appSection}>
      <Text weight="semibold">{appName}</Text>

      {isLoading && <Spinner size="tiny" label="Loading claim definitions..." />}

      {!isLoading && claims.length === 0 && (
        <Text size={200} className={styles.fieldHint}>
          No custom claims defined for this application.
        </Text>
      )}

      {claims.map((claim: ClaimDefinition) => {
        const assignment = claimAssignments.find(
          (c) => c.claimDefinitionId === claim.id,
        );
        return (
          <div key={claim.id} className={styles.claimRow}>
            <Text size={300} className={styles.claimLabel}>
              {claim.name}
              {claim.isRequired && <span style={{ color: tokens.colorPaletteRedForeground1 }}> *</span>}
            </Text>
            <Input
              value={assignment?.value ?? ''}
              onChange={(_ev, data) => onUpdateClaim(claim.id, data.value)}
              placeholder={
                claim.valueType === 'boolean'
                  ? 'true / false'
                  : claim.valueType === 'number'
                    ? '0'
                    : claim.valueType === 'json'
                      ? '{ }'
                      : 'Enter value'
              }
              size="small"
              style={{ flex: 1 }}
            />
            <Badge appearance="outline" size="small">{claim.valueType}</Badge>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Email Preview
// ---------------------------------------------------------------------------

function Step4Preview({
  form,
  organizationId,
}: {
  form: WizardFormState;
  organizationId: string;
}) {
  const styles = useStyles();
  const invitePreview = useInvitePreview();
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string>('');
  const [previewLoaded, setPreviewLoaded] = useState(false);

  // Load preview on mount (or when form changes)
  const loadPreview = useCallback(async () => {
    if (!organizationId || !form.email) return;
    try {
      const result = await invitePreview.mutateAsync({
        orgId: organizationId,
        data: {
          email: form.email,
          displayName: form.displayName || undefined,
          personalMessage: form.personalMessage || undefined,
          locale: form.locale || undefined,
        },
      });
      setPreviewHtml(result.data.html);
      setPreviewSubject(result.data.subject);
      setPreviewLoaded(true);
    } catch {
      // Error handled by mutation state
    }
  }, [organizationId, form.email, form.displayName, form.personalMessage, form.locale, invitePreview]);

  // Auto-load preview when entering this step
  useState(() => {
    loadPreview();
  });

  return (
    <div className={styles.section}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text size={400} weight="semibold">
          <EyeRegular style={{ marginRight: '8px' }} />
          Email Preview
        </Text>
        <Button
          appearance="secondary"
          size="small"
          onClick={loadPreview}
          disabled={invitePreview.isPending}
        >
          {invitePreview.isPending ? 'Loading...' : 'Refresh Preview'}
        </Button>
      </div>

      {invitePreview.isError && (
        <MessageBar intent="warning">
          <MessageBarBody>
            Could not load email preview. The invitation will still be sent with the correct content.
          </MessageBarBody>
        </MessageBar>
      )}

      {invitePreview.isPending && !previewLoaded && (
        <div className={styles.previewFallback}>
          <Spinner label="Loading email preview..." />
        </div>
      )}

      {previewLoaded && previewHtml && (
        <>
          <div className={styles.field}>
            <Label weight="semibold">Subject</Label>
            <Text>{previewSubject}</Text>
          </div>
          <iframe
            className={styles.previewFrame}
            srcDoc={previewHtml}
            title="Email preview"
            sandbox=""
          />
        </>
      )}

      {previewLoaded && !previewHtml && !invitePreview.isError && (
        <div className={styles.previewFallback}>
          <Text>No preview available. Click &quot;Refresh Preview&quot; to try again.</Text>
        </div>
      )}

      <MessageBar intent="info">
        <MessageBarBody>
          This is a preview of the invitation email. The actual email may vary slightly based on the
          recipient&apos;s email client.
        </MessageBarBody>
      </MessageBar>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5: Review & Send
// ---------------------------------------------------------------------------

function Step5Review({
  form,
  organizations,
  applications,
  roleNames,
  claimNames,
}: {
  form: WizardFormState;
  organizations: { id: string; name: string }[];
  applications: Application[];
  roleNames: Map<string, string>;
  claimNames: Map<string, string>;
}) {
  const styles = useStyles();
  const orgName = organizations.find((o) => o.id === form.organizationId)?.name ?? form.organizationId;

  return (
    <div className={styles.section}>
      <Text size={400} weight="semibold">Review Invitation</Text>
      <Text size={200} className={styles.fieldHint}>
        Please review the invitation details before sending.
      </Text>

      <div className={styles.reviewGrid}>
        <Text className={styles.reviewLabel} size={200}>Organization</Text>
        <Text>{orgName}</Text>

        <Text className={styles.reviewLabel} size={200}>Email</Text>
        <Text>{form.email}</Text>

        {form.displayName && (
          <>
            <Text className={styles.reviewLabel} size={200}>Display Name</Text>
            <Text>{form.displayName}</Text>
          </>
        )}

        {form.personalMessage && (
          <>
            <Text className={styles.reviewLabel} size={200}>Personal Message</Text>
            <Text style={{ whiteSpace: 'pre-wrap' }}>{form.personalMessage}</Text>
          </>
        )}

        <Text className={styles.reviewLabel} size={200}>Language</Text>
        <Text>{form.locale || 'Default (organization locale)'}</Text>
      </div>

      {/* Role assignments summary */}
      {form.roleAssignments.length > 0 && (
        <>
          <Divider />
          <Text weight="semibold">Role Assignments</Text>
          {form.selectedAppIds.map((appId) => {
            const appRoles = form.roleAssignments.filter((r) => r.applicationId === appId);
            if (appRoles.length === 0) return null;
            const app = applications.find((a) => a.id === appId);
            return (
              <div key={appId} className={styles.field}>
                <Text size={200} className={styles.reviewLabel}>{app?.name ?? appId}</Text>
                <div className={styles.badgeRow}>
                  {appRoles.map((r) => (
                    <Badge key={r.roleId} appearance="tint" color="brand">
                      {roleNames.get(r.roleId) ?? r.roleId}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Claim assignments summary */}
      {form.claimAssignments.length > 0 && (
        <>
          <Divider />
          <Text weight="semibold">Custom Claim Values</Text>
          {form.selectedAppIds.map((appId) => {
            const appClaims = form.claimAssignments.filter((c) => c.applicationId === appId);
            if (appClaims.length === 0) return null;
            const app = applications.find((a) => a.id === appId);
            return (
              <div key={appId} className={styles.field}>
                <Text size={200} className={styles.reviewLabel}>{app?.name ?? appId}</Text>
                {appClaims.map((c) => (
                  <div key={c.claimDefinitionId} style={{ display: 'flex', gap: tokens.spacingHorizontalS }}>
                    <Text size={200}>{claimNames.get(c.claimDefinitionId) ?? c.claimDefinitionId}:</Text>
                    <Text size={200} style={{ fontFamily: 'monospace' }}>{c.value}</Text>
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}

      {form.roleAssignments.length === 0 && form.claimAssignments.length === 0 && (
        <>
          <Divider />
          <Text size={200} className={styles.fieldHint}>
            No roles or claims pre-assigned. The user will be invited without any initial assignments.
          </Text>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Success State
// ---------------------------------------------------------------------------

function SuccessView({ email, orgName }: { email: string; orgName: string }) {
  const styles = useStyles();
  const navigate = useNavigate();

  return (
    <Card className={styles.successCard}>
      <CheckmarkCircleRegular
        style={{ fontSize: '48px', color: tokens.colorPaletteGreenForeground1 }}
      />
      <Text size={500} weight="semibold">
        Invitation Sent!
      </Text>
      <Text>
        An invitation email has been sent to <strong>{email}</strong> for the <strong>{orgName}</strong> organization.
      </Text>
      <Text size={200} className={styles.fieldHint}>
        The invitation link will expire in 48 hours. The user will be asked to set a password when they accept.
      </Text>

      <div className={styles.successActions}>
        <Button appearance="secondary" onClick={() => navigate('/users')}>
          Back to Users
        </Button>
        <Button appearance="primary" onClick={() => navigate('/users/invite')}>
          Invite Another User
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main InviteUser Component
// ---------------------------------------------------------------------------

/**
 * 5-step user invitation wizard.
 * Uses WizardStepper for navigation and validates each step independently.
 * On successful invitation, shows a confirmation message.
 */
export function InviteUser() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteUser = useInviteUser();

  // Pre-fill org from query param if provided (e.g. from org detail page)
  const prefilledOrgId = searchParams.get('orgId') ?? '';

  // Fetch organizations for step 1 dropdown
  const { data: orgsData } = useOrganizations({
    limit: 200,
    status: 'active',
    sortBy: 'name',
    sortOrder: 'asc',
  });
  const organizations = orgsData?.data ?? [];

  // Fetch applications (for step 2 & 3) — we load all active apps
  const { data: appsData } = useApplications({
    limit: 200,
    status: 'active',
    sortBy: 'name',
    sortOrder: 'asc',
  });
  const applications = appsData?.data ?? [];

  // Wizard state
  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState<WizardFormState>(() => ({
    ...INITIAL_STATE,
    organizationId: prefilledOrgId,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Success state
  const [inviteSent, setInviteSent] = useState(false);

  // Build lookup maps for role/claim names (for review step)
  const [roleNames] = useState<Map<string, string>>(new Map());
  const [claimNames] = useState<Map<string, string>>(new Map());

  /** Merge partial updates into form state */
  const updateForm = useCallback((partial: Partial<WizardFormState>) => {
    setForm((prev) => ({ ...prev, ...partial }));
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(partial)) {
        delete next[key];
      }
      return next;
    });
  }, []);

  /** Validate the current step */
  const validateStep = useCallback(
    (step: number): boolean => {
      const newErrors: Record<string, string> = {};

      if (step === 0) {
        if (!form.organizationId) newErrors.organizationId = 'Organization is required';
        if (!form.email.trim()) newErrors.email = 'Email address is required';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
          newErrors.email = 'Please enter a valid email address';
        }
        if (form.personalMessage.length > 500) {
          newErrors.personalMessage = 'Personal message must be 500 characters or less';
        }
      }

      // Steps 1-3 (roles, claims, preview) have no required validation
      // Step 4 (review) is read-only

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
    [form],
  );

  /** Handle step navigation with validation */
  const handleStepChange = useCallback(
    (newStep: number) => {
      if (newStep > activeStep) {
        if (!validateStep(activeStep)) return;
      }
      setActiveStep(newStep);
    },
    [activeStep, validateStep],
  );

  /** Submit the invitation */
  const handleComplete = useCallback(async () => {
    if (!validateStep(activeStep)) return;

    // Build the invitation request
    const data: InviteUserRequest = {
      email: form.email.trim(),
      displayName: form.displayName.trim() || undefined,
      personalMessage: form.personalMessage.trim() || undefined,
      locale: form.locale || undefined,
    };

    // Add role assignments if any
    if (form.roleAssignments.length > 0) {
      data.roles = form.roleAssignments;
    }

    // Add claim assignments if any — parse values to appropriate types
    if (form.claimAssignments.length > 0) {
      data.claims = form.claimAssignments.map((c) => ({
        applicationId: c.applicationId,
        claimDefinitionId: c.claimDefinitionId,
        value: parseClaimValue(c.value),
      }));
    }

    try {
      await inviteUser.mutateAsync({
        orgId: form.organizationId,
        data,
      });
      setInviteSent(true);
    } catch {
      // API errors shown via inviteUser.error
    }
  }, [form, activeStep, validateStep, inviteUser]);

  // After successful invitation, show success view
  if (inviteSent) {
    const orgName = organizations.find((o) => o.id === form.organizationId)?.name ?? 'the organization';
    return (
      <div className={styles.root}>
        <div className={styles.header}>
          <Text size={600} weight="semibold">Invitation Sent</Text>
        </div>
        <SuccessView email={form.email} orgName={orgName} />
      </div>
    );
  }

  // Step validity
  const step1Valid =
    !!form.organizationId &&
    !!form.email.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
    form.personalMessage.length <= 500;

  // Build wizard steps
  const steps: WizardStep[] = useMemo(
    () => [
      {
        key: 'basic',
        label: 'Basic Info',
        isValid: step1Valid,
        content: (
          <Step1BasicInfo
            form={form}
            onUpdate={updateForm}
            errors={errors}
            organizations={organizations}
          />
        ),
      },
      {
        key: 'roles',
        label: 'Roles',
        isValid: true, // Optional step
        content: (
          <Step2Roles
            form={form}
            onUpdate={updateForm}
            applications={applications}
          />
        ),
      },
      {
        key: 'claims',
        label: 'Claims',
        isValid: true, // Optional step
        content: (
          <Step3Claims
            form={form}
            onUpdate={updateForm}
            applications={applications}
          />
        ),
      },
      {
        key: 'preview',
        label: 'Preview',
        isValid: true,
        content: (
          <Step4Preview
            form={form}
            organizationId={form.organizationId}
          />
        ),
      },
      {
        key: 'review',
        label: 'Send',
        isValid: true,
        content: (
          <Step5Review
            form={form}
            organizations={organizations}
            applications={applications}
            roleNames={roleNames}
            claimNames={claimNames}
          />
        ),
      },
    ],
    [form, errors, organizations, applications, step1Valid, updateForm, roleNames, claimNames],
  );

  return (
    <div className={styles.root}>
      {/* Page header with back button */}
      <div className={styles.header}>
        <Button
          appearance="subtle"
          icon={<ArrowLeftRegular />}
          onClick={() => navigate('/users')}
          aria-label="Back to users"
        />
        <Text size={600} weight="semibold">
          Invite User
        </Text>
      </div>

      {/* API error */}
      {inviteUser.isError && (
        <MessageBar intent="error">
          <MessageBarBody>
            {(inviteUser.error as Error)?.message ?? 'Failed to send invitation'}
          </MessageBarBody>
        </MessageBar>
      )}

      {/* Wizard */}
      <Card style={{ padding: tokens.spacingHorizontalL }}>
        <WizardStepper
          steps={steps}
          activeStep={activeStep}
          onStepChange={handleStepChange}
          onComplete={handleComplete}
          completeLabel={inviteUser.isPending ? 'Sending...' : 'Send Invitation'}
        />
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a string claim value to its appropriate type */
function parseClaimValue(value: string): unknown {
  const trimmed = value.trim();

  // Boolean
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // Number
  const num = Number(trimmed);
  if (trimmed !== '' && !isNaN(num)) return num;

  // JSON object/array
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Not valid JSON, return as string
    }
  }

  // Default: string
  return trimmed;
}
