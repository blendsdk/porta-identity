/**
 * Create client wizard page.
 * 4-step wizard using WizardStepper:
 *   Step 1: Basic info — name, application, client type (public/confidential)
 *   Step 2: OAuth config — redirect URIs, grant types, response types
 *   Step 3: Security — token endpoint auth method, login methods override
 *   Step 4: Review & create — summary of all settings, submit, show generated secret
 *
 * On successful creation the wizard transitions to a "Success" state showing
 * the generated client_id and (for confidential clients) the client_secret
 * via the SecretDisplay component. The secret is only shown once.
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
  Checkbox,
  Radio,
  RadioGroup,
  MessageBar,
  MessageBarBody,
  Badge,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  AddRegular,
  DismissRegular,
} from '@fluentui/react-icons';
import { useNavigate } from 'react-router';
import { useCreateClient } from '../../api/clients';
import { useApplications } from '../../api/applications';
import { WizardStepper, type WizardStep } from '../../components/WizardStepper';
import { SecretDisplay } from '../../components/SecretDisplay';
import { LoginMethodSelector } from '../../components/LoginMethodSelector';
import { CopyButton } from '../../components/CopyButton';
import type {
  GrantType,
  TokenEndpointAuthMethod,
  LoginMethod,
} from '../../types';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    maxWidth: '720px',
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
  uriRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  uriList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  uriItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    fontFamily: 'monospace',
    fontSize: tokens.fontSizeBase200,
  },
  checkboxGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalS,
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
  clientIdDisplay: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    fontFamily: 'monospace',
  },
});

// ---------------------------------------------------------------------------
// Grant type options
// ---------------------------------------------------------------------------

/** Available OIDC grant types for selection */
const GRANT_TYPE_OPTIONS: { value: GrantType; label: string; description: string }[] = [
  {
    value: 'authorization_code',
    label: 'Authorization Code',
    description: 'Standard OAuth2 flow for user-facing apps (recommended)',
  },
  {
    value: 'client_credentials',
    label: 'Client Credentials',
    description: 'Machine-to-machine communication (no user context)',
  },
  {
    value: 'refresh_token',
    label: 'Refresh Token',
    description: 'Obtain new access tokens without re-authentication',
  },
];

/** Token endpoint auth method options */
const AUTH_METHOD_OPTIONS: { value: TokenEndpointAuthMethod; label: string; description: string }[] = [
  { value: 'none', label: 'None', description: 'Public client — no client authentication (PKCE required)' },
  { value: 'client_secret_post', label: 'Client Secret (POST)', description: 'Secret sent in request body' },
  { value: 'client_secret_basic', label: 'Client Secret (Basic)', description: 'Secret sent via HTTP Basic auth header' },
];

// ---------------------------------------------------------------------------
// Wizard form state
// ---------------------------------------------------------------------------

interface WizardFormState {
  // Step 1: Basic info
  name: string;
  applicationId: string;
  isConfidential: boolean;
  // Step 2: OAuth config
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  grantTypes: GrantType[];
  // Step 3: Security
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;
  loginMethodsOverride: LoginMethod[] | null;
}

const INITIAL_STATE: WizardFormState = {
  name: '',
  applicationId: '',
  isConfidential: false,
  redirectUris: [],
  postLogoutRedirectUris: [],
  grantTypes: ['authorization_code'],
  tokenEndpointAuthMethod: 'none',
  loginMethodsOverride: null,
};

// ---------------------------------------------------------------------------
// URI validation
// ---------------------------------------------------------------------------

/** Basic URI validation — must be a valid URL */
function isValidUri(uri: string): boolean {
  try {
    new URL(uri);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Step Components
// ---------------------------------------------------------------------------

/** Step 1: Basic Info — client name, application, type */
function Step1BasicInfo({
  form,
  onUpdate,
  errors,
  applications,
}: {
  form: WizardFormState;
  onUpdate: (partial: Partial<WizardFormState>) => void;
  errors: Record<string, string>;
  applications: { id: string; name: string }[];
}) {
  const styles = useStyles();

  return (
    <div className={styles.section}>
      {/* Application */}
      <div className={styles.field}>
        <Label required weight="semibold">Application</Label>
        <Dropdown
          placeholder="Select an application"
          value={applications.find((a) => a.id === form.applicationId)?.name ?? ''}
          onOptionSelect={(_ev, data) => onUpdate({ applicationId: data.optionValue ?? '' })}
        >
          {applications.map((app) => (
            <Option key={app.id} value={app.id}>{app.name}</Option>
          ))}
        </Dropdown>
        {errors.applicationId && (
          <Text size={200} className={styles.error}>{errors.applicationId}</Text>
        )}
      </div>

      {/* Client name */}
      <div className={styles.field}>
        <Label required weight="semibold">Client Name</Label>
        <Input
          value={form.name}
          onChange={(_ev, data) => onUpdate({ name: data.value })}
          placeholder="e.g. My Web App"
        />
        {errors.name && (
          <Text size={200} className={styles.error}>{errors.name}</Text>
        )}
      </div>

      {/* Client type */}
      <div className={styles.field}>
        <Label required weight="semibold">Client Type</Label>
        <RadioGroup
          value={form.isConfidential ? 'confidential' : 'public'}
          onChange={(_ev, data) => {
            const isConf = data.value === 'confidential';
            onUpdate({
              isConfidential: isConf,
              // Auto-set auth method based on type
              tokenEndpointAuthMethod: isConf ? 'client_secret_post' : 'none',
            });
          }}
        >
          <Radio value="public" label="Public — Browser SPA, mobile app (PKCE enforced)" />
          <Radio value="confidential" label="Confidential — Server-side app, BFF (has a client secret)" />
        </RadioGroup>
      </div>
    </div>
  );
}

/** Step 2: OAuth Config — redirect URIs, grant types */
function Step2OAuthConfig({
  form,
  onUpdate,
  errors,
}: {
  form: WizardFormState;
  onUpdate: (partial: Partial<WizardFormState>) => void;
  errors: Record<string, string>;
}) {
  const styles = useStyles();
  const [newUri, setNewUri] = useState('');
  const [newPostLogoutUri, setNewPostLogoutUri] = useState('');

  /** Add a redirect URI */
  const addRedirectUri = useCallback(() => {
    const uri = newUri.trim();
    if (!uri || !isValidUri(uri)) return;
    if (form.redirectUris.includes(uri)) return;
    onUpdate({ redirectUris: [...form.redirectUris, uri] });
    setNewUri('');
  }, [newUri, form.redirectUris, onUpdate]);

  /** Remove a redirect URI */
  const removeRedirectUri = useCallback(
    (uri: string) => {
      onUpdate({ redirectUris: form.redirectUris.filter((u) => u !== uri) });
    },
    [form.redirectUris, onUpdate],
  );

  /** Add a post-logout redirect URI */
  const addPostLogoutUri = useCallback(() => {
    const uri = newPostLogoutUri.trim();
    if (!uri || !isValidUri(uri)) return;
    if (form.postLogoutRedirectUris.includes(uri)) return;
    onUpdate({ postLogoutRedirectUris: [...form.postLogoutRedirectUris, uri] });
    setNewPostLogoutUri('');
  }, [newPostLogoutUri, form.postLogoutRedirectUris, onUpdate]);

  /** Remove a post-logout redirect URI */
  const removePostLogoutUri = useCallback(
    (uri: string) => {
      onUpdate({ postLogoutRedirectUris: form.postLogoutRedirectUris.filter((u) => u !== uri) });
    },
    [form.postLogoutRedirectUris, onUpdate],
  );

  /** Toggle a grant type on/off */
  const toggleGrantType = useCallback(
    (gt: GrantType, checked: boolean) => {
      const current = new Set(form.grantTypes);
      if (checked) current.add(gt);
      else current.delete(gt);
      onUpdate({ grantTypes: Array.from(current) });
    },
    [form.grantTypes, onUpdate],
  );

  return (
    <div className={styles.section}>
      {/* Redirect URIs */}
      <div className={styles.field}>
        <Label required weight="semibold">Redirect URIs</Label>
        <Text size={200} className={styles.fieldHint}>
          URIs where the authorization server redirects after login
        </Text>
        <div className={styles.uriRow}>
          <Input
            value={newUri}
            onChange={(_ev, data) => setNewUri(data.value)}
            placeholder="https://example.com/callback"
            style={{ flex: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && addRedirectUri()}
          />
          <Button
            icon={<AddRegular />}
            appearance="secondary"
            onClick={addRedirectUri}
            disabled={!newUri.trim() || !isValidUri(newUri.trim())}
          >
            Add
          </Button>
        </div>
        {errors.redirectUris && (
          <Text size={200} className={styles.error}>{errors.redirectUris}</Text>
        )}
        {form.redirectUris.length > 0 && (
          <div className={styles.uriList}>
            {form.redirectUris.map((uri) => (
              <div key={uri} className={styles.uriItem}>
                <span>{uri}</span>
                <Button
                  icon={<DismissRegular />}
                  appearance="subtle"
                  size="small"
                  onClick={() => removeRedirectUri(uri)}
                  aria-label={`Remove ${uri}`}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Post-Logout Redirect URIs */}
      <div className={styles.field}>
        <Label weight="semibold">Post-Logout Redirect URIs</Label>
        <Text size={200} className={styles.fieldHint}>
          URIs where the user is redirected after logout (optional)
        </Text>
        <div className={styles.uriRow}>
          <Input
            value={newPostLogoutUri}
            onChange={(_ev, data) => setNewPostLogoutUri(data.value)}
            placeholder="https://example.com"
            style={{ flex: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && addPostLogoutUri()}
          />
          <Button
            icon={<AddRegular />}
            appearance="secondary"
            onClick={addPostLogoutUri}
            disabled={!newPostLogoutUri.trim() || !isValidUri(newPostLogoutUri.trim())}
          >
            Add
          </Button>
        </div>
        {form.postLogoutRedirectUris.length > 0 && (
          <div className={styles.uriList}>
            {form.postLogoutRedirectUris.map((uri) => (
              <div key={uri} className={styles.uriItem}>
                <span>{uri}</span>
                <Button
                  icon={<DismissRegular />}
                  appearance="subtle"
                  size="small"
                  onClick={() => removePostLogoutUri(uri)}
                  aria-label={`Remove ${uri}`}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grant Types */}
      <div className={styles.field}>
        <Label required weight="semibold">Grant Types</Label>
        <div className={styles.checkboxGroup}>
          {GRANT_TYPE_OPTIONS.map((gt) => (
            <Checkbox
              key={gt.value}
              checked={form.grantTypes.includes(gt.value)}
              onChange={(_ev, data) => toggleGrantType(gt.value, !!data.checked)}
              label={
                <span>
                  {gt.label}
                  <Text size={200} style={{ display: 'block', color: tokens.colorNeutralForeground3 }}>
                    {gt.description}
                  </Text>
                </span>
              }
            />
          ))}
        </div>
        {errors.grantTypes && (
          <Text size={200} className={styles.error}>{errors.grantTypes}</Text>
        )}
      </div>
    </div>
  );
}

/** Step 3: Security — auth method, login methods override */
function Step3Security({
  form,
  onUpdate,
}: {
  form: WizardFormState;
  onUpdate: (partial: Partial<WizardFormState>) => void;
}) {
  const styles = useStyles();

  return (
    <div className={styles.section}>
      {/* Token Endpoint Auth Method */}
      <div className={styles.field}>
        <Label required weight="semibold">Token Endpoint Auth Method</Label>
        <RadioGroup
          value={form.tokenEndpointAuthMethod}
          onChange={(_ev, data) =>
            onUpdate({ tokenEndpointAuthMethod: data.value as TokenEndpointAuthMethod })
          }
        >
          {AUTH_METHOD_OPTIONS.map((opt) => (
            <Radio
              key={opt.value}
              value={opt.value}
              label={`${opt.label} — ${opt.description}`}
              disabled={
                // Public clients must use 'none'; confidential clients shouldn't use 'none'
                (!form.isConfidential && opt.value !== 'none') ||
                (form.isConfidential && opt.value === 'none')
              }
            />
          ))}
        </RadioGroup>
      </div>

      {/* Login Methods Override */}
      <div className={styles.field}>
        <Label weight="semibold">Login Methods Override</Label>
        <Text size={200} className={styles.fieldHint}>
          Override the organization&apos;s default login methods for this client, or inherit them.
        </Text>
        <LoginMethodSelector
          value={form.loginMethodsOverride}
          onChange={(methods) => onUpdate({ loginMethodsOverride: methods })}
          mode="client"
        />
      </div>
    </div>
  );
}

/** Step 4: Review & Create — summary of all settings */
function Step4Review({
  form,
  applications,
}: {
  form: WizardFormState;
  applications: { id: string; name: string }[];
}) {
  const styles = useStyles();
  const appName = applications.find((a) => a.id === form.applicationId)?.name ?? form.applicationId;

  return (
    <div className={styles.section}>
      <Text size={400} weight="semibold">Review Client Configuration</Text>

      <div className={styles.reviewGrid}>
        <Text className={styles.reviewLabel} size={200}>Name</Text>
        <Text>{form.name}</Text>

        <Text className={styles.reviewLabel} size={200}>Application</Text>
        <Text>{appName}</Text>

        <Text className={styles.reviewLabel} size={200}>Type</Text>
        <Text>{form.isConfidential ? 'Confidential' : 'Public'}</Text>

        <Text className={styles.reviewLabel} size={200}>Redirect URIs</Text>
        <div>
          {form.redirectUris.length === 0
            ? <Text style={{ color: tokens.colorNeutralForeground3 }}>None</Text>
            : form.redirectUris.map((uri) => (
                <Text key={uri} size={200} style={{ fontFamily: 'monospace', display: 'block' }}>
                  {uri}
                </Text>
              ))
          }
        </div>

        <Text className={styles.reviewLabel} size={200}>Post-Logout URIs</Text>
        <div>
          {form.postLogoutRedirectUris.length === 0
            ? <Text style={{ color: tokens.colorNeutralForeground3 }}>None</Text>
            : form.postLogoutRedirectUris.map((uri) => (
                <Text key={uri} size={200} style={{ fontFamily: 'monospace', display: 'block' }}>
                  {uri}
                </Text>
              ))
          }
        </div>

        <Text className={styles.reviewLabel} size={200}>Grant Types</Text>
        <div style={{ display: 'flex', gap: tokens.spacingHorizontalXS, flexWrap: 'wrap' }}>
          {form.grantTypes.map((gt) => (
            <Badge key={gt} appearance="outline">{gt}</Badge>
          ))}
        </div>

        <Text className={styles.reviewLabel} size={200}>Auth Method</Text>
        <Text>{AUTH_METHOD_OPTIONS.find((o) => o.value === form.tokenEndpointAuthMethod)?.label ?? form.tokenEndpointAuthMethod}</Text>

        <Text className={styles.reviewLabel} size={200}>Login Methods</Text>
        <Text>
          {form.loginMethodsOverride === null
            ? 'Inherit from organization'
            : form.loginMethodsOverride.join(', ') || 'None selected'}
        </Text>
      </div>

      {form.isConfidential && (
        <MessageBar intent="warning">
          <MessageBarBody>
            A client secret will be generated. You will only see it <strong>once</strong> after creation.
          </MessageBarBody>
        </MessageBar>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Success State (after creation)
// ---------------------------------------------------------------------------

/** Props for the success view shown after client creation */
interface SuccessViewProps {
  clientId: string;
  clientSecret?: string;
  clientName: string;
  createdId: string;
}

/** Success view showing client_id and (optionally) client_secret */
function SuccessView({ clientId, clientSecret, clientName, createdId }: SuccessViewProps) {
  const styles = useStyles();
  const navigate = useNavigate();

  return (
    <Card className={styles.successCard}>
      <Text size={500} weight="semibold">
        🎉 Client Created Successfully
      </Text>
      <Text>{clientName} has been created.</Text>

      {/* Client ID */}
      <div className={styles.field}>
        <Label weight="semibold">Client ID</Label>
        <div className={styles.clientIdDisplay}>
          <Text style={{ fontFamily: 'monospace' }}>{clientId}</Text>
          <CopyButton value={clientId} />
        </div>
      </div>

      {/* Client Secret (confidential clients only) */}
      {clientSecret && (
        <SecretDisplay
          secret={clientSecret}
          label="Client Secret"
        />
      )}

      <div className={styles.successActions}>
        <Button appearance="secondary" onClick={() => navigate('/clients')}>
          Back to Clients
        </Button>
        <Button appearance="primary" onClick={() => navigate(`/clients/${createdId}`)}>
          View Client Detail
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main CreateClient Component
// ---------------------------------------------------------------------------

/**
 * 4-step client creation wizard.
 * Uses WizardStepper for navigation and validates each step independently.
 * On successful creation, shows the generated client_id and secret.
 */
export function CreateClient() {
  const styles = useStyles();
  const navigate = useNavigate();
  const createClient = useCreateClient();

  // Fetch active applications for step 1 dropdown
  const { data: appsData } = useApplications({
    limit: 100,
    status: 'active',
    sortBy: 'name',
    sortOrder: 'asc',
  });
  const applications = appsData?.data ?? [];

  // Wizard state
  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState<WizardFormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Success state — set after creation completes
  const [createdResult, setCreatedResult] = useState<{
    id: string;
    clientId: string;
    clientSecret?: string;
  } | null>(null);

  /** Merge partial updates into form state */
  const updateForm = useCallback((partial: Partial<WizardFormState>) => {
    setForm((prev) => ({ ...prev, ...partial }));
    // Clear related errors when user modifies fields
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(partial)) {
        delete next[key];
      }
      return next;
    });
  }, []);

  /** Validate the current step before proceeding */
  const validateStep = useCallback(
    (step: number): boolean => {
      const newErrors: Record<string, string> = {};

      if (step === 0) {
        if (!form.name.trim()) newErrors.name = 'Client name is required';
        else if (form.name.trim().length < 2) newErrors.name = 'Name must be at least 2 characters';
        if (!form.applicationId) newErrors.applicationId = 'Application is required';
      }

      if (step === 1) {
        if (form.redirectUris.length === 0) {
          newErrors.redirectUris = 'At least one redirect URI is required';
        }
        if (form.grantTypes.length === 0) {
          newErrors.grantTypes = 'At least one grant type is required';
        }
      }

      // Step 2 (security) has no required validation beyond what's already set
      // Step 3 (review) is read-only

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
    [form],
  );

  /** Handle step navigation with validation */
  const handleStepChange = useCallback(
    (newStep: number) => {
      // Only validate when moving forward
      if (newStep > activeStep) {
        if (!validateStep(activeStep)) return;
      }
      setActiveStep(newStep);
    },
    [activeStep, validateStep],
  );

  /** Submit the wizard — create the client */
  const handleComplete = useCallback(async () => {
    if (!validateStep(activeStep)) return;

    // Look up organizationId from the selected application
    const selectedApp = applications.find((a) => a.id === form.applicationId);

    try {
      const result = await createClient.mutateAsync({
        name: form.name.trim(),
        applicationId: form.applicationId,
        isConfidential: form.isConfidential,
        organizationId: selectedApp?.organizationId,
        redirectUris: form.redirectUris,
        postLogoutRedirectUris: form.postLogoutRedirectUris.length > 0
          ? form.postLogoutRedirectUris
          : undefined,
        grantTypes: form.grantTypes,
        tokenEndpointAuthMethod: form.tokenEndpointAuthMethod,
      });

      // The API response may include the secret for confidential clients
      const apiResult = result as unknown as Record<string, unknown>;
      setCreatedResult({
        id: (apiResult.id as string) ?? '',
        clientId: (apiResult.clientId as string) ?? '',
        clientSecret: (apiResult.clientSecret as string) ?? undefined,
      });
    } catch {
      // API errors are shown via createClient.error
    }
  }, [form, activeStep, validateStep, createClient, applications]);

  // After successful creation, show the success view
  if (createdResult) {
    return (
      <div className={styles.root}>
        <div className={styles.header}>
          <Text size={600} weight="semibold">Client Created</Text>
        </div>
        <SuccessView
          clientId={createdResult.clientId}
          clientSecret={createdResult.clientSecret}
          clientName={form.name}
          createdId={createdResult.id}
        />
      </div>
    );
  }

  // Step validity for WizardStepper (controls Next button)
  const step1Valid = !!form.name.trim() && form.name.trim().length >= 2 && !!form.applicationId;
  const step2Valid = form.redirectUris.length > 0 && form.grantTypes.length > 0;

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
            applications={applications}
          />
        ),
      },
      {
        key: 'oauth',
        label: 'OAuth Config',
        isValid: step2Valid,
        content: (
          <Step2OAuthConfig form={form} onUpdate={updateForm} errors={errors} />
        ),
      },
      {
        key: 'security',
        label: 'Security',
        isValid: true, // Security step always valid (has defaults)
        content: (
          <Step3Security form={form} onUpdate={updateForm} />
        ),
      },
      {
        key: 'review',
        label: 'Review & Create',
        isValid: true,
        content: (
          <Step4Review form={form} applications={applications} />
        ),
      },
    ],
    [form, errors, applications, step1Valid, step2Valid, updateForm],
  );

  return (
    <div className={styles.root}>
      {/* Page header with back button */}
      <div className={styles.header}>
        <Button
          appearance="subtle"
          icon={<ArrowLeftRegular />}
          onClick={() => navigate('/clients')}
          aria-label="Back to clients"
        />
        <Text size={600} weight="semibold">
          Create Client
        </Text>
      </div>

      {/* API error */}
      {createClient.isError && (
        <MessageBar intent="error">
          <MessageBarBody>
            {(createClient.error as Error)?.message ?? 'Failed to create client'}
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
          completeLabel={createClient.isPending ? 'Creating...' : 'Create Client'}
        />
      </Card>
    </div>
  );
}
