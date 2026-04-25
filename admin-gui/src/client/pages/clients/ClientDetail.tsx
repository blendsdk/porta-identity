/**
 * Client detail page.
 * Displays full OIDC client details with tabbed interface:
 * - Overview: name, client ID, application, type, status, grant types, redirect URIs
 * - Settings: editable fields (name, description, redirect URIs, grant types)
 * - Login Methods: inherit/override toggle via LoginMethodSelector
 * - Secrets: (confidential only) generate, list, revoke client secrets
 * - History: audit log filtered to this client
 *
 * Status lifecycle: active → revoked (revoke only, no reactivation)
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
  Checkbox,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  SaveRegular,
  ShieldLockRegular,
  AddRegular,
  DeleteRegular,
  DismissRegular,
} from '@fluentui/react-icons';
import { useParams, useNavigate } from 'react-router';
import {
  useClient,
  useUpdateClient,
  useRevokeClient,
  useClientSecrets,
  useGenerateClientSecret,
  useRevokeClientSecret,
} from '../../api/clients';
import { useApplication } from '../../api/applications';
import { useOrganization } from '../../api/organizations';
import { useAuditLog } from '../../api/audit';
import { EntityDetailTabs, type EntityTab, type EntityAction } from '../../components/EntityDetailTabs';
import { StatusBadge } from '../../components/StatusBadge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TypeToConfirm } from '../../components/TypeToConfirm';
import { LoginMethodSelector } from '../../components/LoginMethodSelector';
import { SecretDisplay } from '../../components/SecretDisplay';
import { CopyButton } from '../../components/CopyButton';
import { AuditTimeline, type TimelineEntry } from '../../components/AuditTimeline';
import type {
  Client,
  ClientSecret,
  GrantType,
  LoginMethod,
  AuditEntry,
} from '../../types';

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
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: '160px 1fr',
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
  uriList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    fontFamily: 'monospace',
    fontSize: tokens.fontSizeBase200,
  },
  uriRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  uriInput: {
    flex: 1,
  },
  badgeGroup: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
  },
  secretRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  secretInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  secretMeta: {
    color: tokens.colorNeutralForeground3,
  },
  listEmpty: {
    padding: tokens.spacingVerticalL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
  },
  generateForm: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalM,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

interface OverviewTabProps {
  client: Client;
  appName: string;
  orgName: string;
}

/**
 * Overview tab showing read-only client details:
 * name, client ID, application, organization, type, status,
 * grant types, redirect URIs, and timestamps.
 */
function OverviewTab({ client, appName, orgName }: OverviewTabProps) {
  const styles = useStyles();

  return (
    <div className={styles.section}>
      <div className={styles.infoGrid}>
        <Text className={styles.infoLabel} size={200}>Name</Text>
        <Text weight="semibold">{client.name}</Text>

        <Text className={styles.infoLabel} size={200}>Client ID</Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
          <Text style={{ fontFamily: 'monospace' }}>{client.clientId}</Text>
          <CopyButton value={client.clientId} />
        </div>

        <Text className={styles.infoLabel} size={200}>Application</Text>
        <Text>{appName}</Text>

        <Text className={styles.infoLabel} size={200}>Organization</Text>
        <Text>{orgName}</Text>

        <Text className={styles.infoLabel} size={200}>Type</Text>
        <Badge appearance="outline">
          {client.isConfidential ? 'Confidential' : 'Public'}
        </Badge>

        <Text className={styles.infoLabel} size={200}>Status</Text>
        <StatusBadge status={client.status} />

        <Text className={styles.infoLabel} size={200}>Auth Method</Text>
        <Text style={{ fontFamily: 'monospace' }}>{client.tokenEndpointAuthMethod}</Text>

        <Text className={styles.infoLabel} size={200}>Grant Types</Text>
        <div className={styles.badgeGroup}>
          {client.grantTypes.map((gt) => (
            <Badge key={gt} appearance="outline" size="small">{gt}</Badge>
          ))}
        </div>

        <Text className={styles.infoLabel} size={200}>Response Types</Text>
        <div className={styles.badgeGroup}>
          {client.responseTypes.map((rt) => (
            <Badge key={rt} appearance="outline" size="small">{rt}</Badge>
          ))}
        </div>

        <Text className={styles.infoLabel} size={200}>Redirect URIs</Text>
        <div className={styles.uriList}>
          {client.redirectUris.length > 0
            ? client.redirectUris.map((uri) => <Text key={uri} size={200}>{uri}</Text>)
            : <Text size={200}>—</Text>}
        </div>

        <Text className={styles.infoLabel} size={200}>Post-Logout URIs</Text>
        <div className={styles.uriList}>
          {client.postLogoutRedirectUris.length > 0
            ? client.postLogoutRedirectUris.map((uri) => <Text key={uri} size={200}>{uri}</Text>)
            : <Text size={200}>—</Text>}
        </div>

        <Text className={styles.infoLabel} size={200}>Login Methods</Text>
        <Text>
          {client.loginMethods === null
            ? 'Inherited from organization'
            : client.loginMethods.join(', ') || 'None'}
        </Text>

        <Text className={styles.infoLabel} size={200}>Created</Text>
        <Text>{new Date(client.createdAt).toLocaleString()}</Text>

        <Text className={styles.infoLabel} size={200}>Updated</Text>
        <Text>{new Date(client.updatedAt).toLocaleString()}</Text>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings Tab
// ---------------------------------------------------------------------------

/** All grant type options */
const GRANT_TYPE_OPTIONS: { value: GrantType; label: string }[] = [
  { value: 'authorization_code', label: 'Authorization Code' },
  { value: 'client_credentials', label: 'Client Credentials' },
  { value: 'refresh_token', label: 'Refresh Token' },
];

interface SettingsTabProps {
  client: Client;
  onSave: (data: Partial<Client>) => Promise<void>;
  saving: boolean;
}

/**
 * Settings tab for editing client name, description,
 * redirect URIs, post-logout URIs, and grant types.
 */
function SettingsTab({ client, onSave, saving }: SettingsTabProps) {
  const styles = useStyles();
  const [name, setName] = useState(client.name);
  const [description, setDescription] = useState(client.description ?? '');
  const [redirectUris, setRedirectUris] = useState<string[]>([...client.redirectUris]);
  const [postLogoutUris, setPostLogoutUris] = useState<string[]>([...client.postLogoutRedirectUris]);
  const [grantTypes, setGrantTypes] = useState<GrantType[]>([...client.grantTypes]);
  const [newRedirectUri, setNewRedirectUri] = useState('');
  const [newPostLogoutUri, setNewPostLogoutUri] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isRevoked = client.status === 'revoked';

  /** Whether form values differ from current client state */
  const isDirty =
    name !== client.name ||
    description !== (client.description ?? '') ||
    JSON.stringify(redirectUris) !== JSON.stringify(client.redirectUris) ||
    JSON.stringify(postLogoutUris) !== JSON.stringify(client.postLogoutRedirectUris) ||
    JSON.stringify([...grantTypes].sort()) !== JSON.stringify([...client.grantTypes].sort());

  /** Reset form to current client values */
  const handleReset = useCallback(() => {
    setName(client.name);
    setDescription(client.description ?? '');
    setRedirectUris([...client.redirectUris]);
    setPostLogoutUris([...client.postLogoutRedirectUris]);
    setGrantTypes([...client.grantTypes]);
    setNewRedirectUri('');
    setNewPostLogoutUri('');
    setErrors({});
  }, [client]);

  /** Add a redirect URI */
  const addRedirectUri = useCallback(() => {
    const uri = newRedirectUri.trim();
    if (!uri) return;
    try {
      new URL(uri);
    } catch {
      setErrors((prev) => ({ ...prev, redirectUri: 'Invalid URL format' }));
      return;
    }
    if (redirectUris.includes(uri)) {
      setErrors((prev) => ({ ...prev, redirectUri: 'URI already added' }));
      return;
    }
    setRedirectUris((prev) => [...prev, uri]);
    setNewRedirectUri('');
    setErrors((prev) => {
      const { redirectUri: _, ...rest } = prev;
      return rest;
    });
  }, [newRedirectUri, redirectUris]);

  /** Add a post-logout URI */
  const addPostLogoutUri = useCallback(() => {
    const uri = newPostLogoutUri.trim();
    if (!uri) return;
    try {
      new URL(uri);
    } catch {
      setErrors((prev) => ({ ...prev, postLogoutUri: 'Invalid URL format' }));
      return;
    }
    if (postLogoutUris.includes(uri)) {
      setErrors((prev) => ({ ...prev, postLogoutUri: 'URI already added' }));
      return;
    }
    setPostLogoutUris((prev) => [...prev, uri]);
    setNewPostLogoutUri('');
    setErrors((prev) => {
      const { postLogoutUri: _, ...rest } = prev;
      return rest;
    });
  }, [newPostLogoutUri, postLogoutUris]);

  /** Toggle a grant type */
  const toggleGrantType = useCallback((gt: GrantType, checked: boolean) => {
    setGrantTypes((prev) =>
      checked ? [...prev, gt] : prev.filter((g) => g !== gt),
    );
  }, []);

  /** Validate and save */
  const handleSave = useCallback(async () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    else if (name.trim().length < 2) newErrors.name = 'Name must be at least 2 characters';
    if (redirectUris.length === 0) newErrors.redirectUris = 'At least one redirect URI is required';
    if (grantTypes.length === 0) newErrors.grantTypes = 'At least one grant type is required';

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const data: Partial<Client> = {};
    if (name !== client.name) data.name = name.trim();
    if (description !== (client.description ?? '')) data.description = description.trim();
    if (JSON.stringify(redirectUris) !== JSON.stringify(client.redirectUris)) {
      data.redirectUris = redirectUris;
    }
    if (JSON.stringify(postLogoutUris) !== JSON.stringify(client.postLogoutRedirectUris)) {
      data.postLogoutRedirectUris = postLogoutUris;
    }
    if (JSON.stringify([...grantTypes].sort()) !== JSON.stringify([...client.grantTypes].sort())) {
      data.grantTypes = grantTypes;
    }

    await onSave(data);
  }, [name, description, redirectUris, postLogoutUris, grantTypes, client, onSave]);

  return (
    <div className={styles.section}>
      {/* Name */}
      <div className={styles.field}>
        <Label required weight="semibold">Client Name</Label>
        <Input
          value={name}
          onChange={(_ev, data) => setName(data.value)}
          disabled={isRevoked}
        />
        {errors.name && <Text size={200} className={styles.error}>{errors.name}</Text>}
      </div>

      {/* Description */}
      <div className={styles.field}>
        <Label weight="semibold">Description</Label>
        <Textarea
          value={description}
          onChange={(_ev, data) => setDescription(data.value)}
          rows={2}
          resize="vertical"
          disabled={isRevoked}
        />
      </div>

      {/* Redirect URIs */}
      <div className={styles.field}>
        <Label required weight="semibold">Redirect URIs</Label>
        {redirectUris.map((uri) => (
          <div key={uri} className={styles.uriRow}>
            <Text size={200} style={{ fontFamily: 'monospace', flex: 1 }}>{uri}</Text>
            {!isRevoked && (
              <Button
                appearance="subtle"
                icon={<DismissRegular />}
                size="small"
                onClick={() => setRedirectUris((prev) => prev.filter((u) => u !== uri))}
                aria-label={`Remove ${uri}`}
              />
            )}
          </div>
        ))}
        {!isRevoked && (
          <div className={styles.uriRow}>
            <Input
              className={styles.uriInput}
              placeholder="https://example.com/callback"
              value={newRedirectUri}
              onChange={(_ev, data) => setNewRedirectUri(data.value)}
              onKeyDown={(e) => e.key === 'Enter' && addRedirectUri()}
            />
            <Button
              appearance="subtle"
              icon={<AddRegular />}
              onClick={addRedirectUri}
              aria-label="Add redirect URI"
            />
          </div>
        )}
        {errors.redirectUri && <Text size={200} className={styles.error}>{errors.redirectUri}</Text>}
        {errors.redirectUris && <Text size={200} className={styles.error}>{errors.redirectUris}</Text>}
      </div>

      {/* Post-Logout Redirect URIs */}
      <div className={styles.field}>
        <Label weight="semibold">Post-Logout Redirect URIs</Label>
        {postLogoutUris.map((uri) => (
          <div key={uri} className={styles.uriRow}>
            <Text size={200} style={{ fontFamily: 'monospace', flex: 1 }}>{uri}</Text>
            {!isRevoked && (
              <Button
                appearance="subtle"
                icon={<DismissRegular />}
                size="small"
                onClick={() => setPostLogoutUris((prev) => prev.filter((u) => u !== uri))}
                aria-label={`Remove ${uri}`}
              />
            )}
          </div>
        ))}
        {!isRevoked && (
          <div className={styles.uriRow}>
            <Input
              className={styles.uriInput}
              placeholder="https://example.com/logout"
              value={newPostLogoutUri}
              onChange={(_ev, data) => setNewPostLogoutUri(data.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPostLogoutUri()}
            />
            <Button
              appearance="subtle"
              icon={<AddRegular />}
              onClick={addPostLogoutUri}
              aria-label="Add post-logout URI"
            />
          </div>
        )}
        {errors.postLogoutUri && <Text size={200} className={styles.error}>{errors.postLogoutUri}</Text>}
      </div>

      {/* Grant Types */}
      <div className={styles.field}>
        <Label required weight="semibold">Grant Types</Label>
        {GRANT_TYPE_OPTIONS.map((opt) => (
          <Checkbox
            key={opt.value}
            label={opt.label}
            checked={grantTypes.includes(opt.value)}
            onChange={(_ev, data) => toggleGrantType(opt.value, data.checked === true)}
            disabled={isRevoked}
          />
        ))}
        {errors.grantTypes && <Text size={200} className={styles.error}>{errors.grantTypes}</Text>}
      </div>

      {/* Save/Reset */}
      {!isRevoked && (
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
// Login Methods Tab
// ---------------------------------------------------------------------------

interface LoginMethodsTabProps {
  client: Client;
  inheritedMethods: LoginMethod[];
  onSave: (methods: LoginMethod[] | null) => Promise<void>;
  saving: boolean;
}

/**
 * Login methods tab using the LoginMethodSelector in client mode.
 * Supports inherit-from-org or explicit override.
 */
function LoginMethodsTab({ client, inheritedMethods, onSave, saving }: LoginMethodsTabProps) {
  const styles = useStyles();
  const [methods, setMethods] = useState<LoginMethod[] | null>(client.loginMethods);
  const isRevoked = client.status === 'revoked';

  const isDirty = JSON.stringify(methods) !== JSON.stringify(client.loginMethods);

  const handleSave = useCallback(async () => {
    await onSave(methods);
  }, [methods, onSave]);

  const handleReset = useCallback(() => {
    setMethods(client.loginMethods);
  }, [client.loginMethods]);

  return (
    <div className={styles.section}>
      <Text size={300}>
        Configure which login methods are available for this client.
        Choose to inherit from the organization or override with specific methods.
      </Text>

      <LoginMethodSelector
        value={methods}
        onChange={setMethods}
        mode="client"
        inheritedMethods={inheritedMethods}
        disabled={isRevoked}
      />

      {!isRevoked && (
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
// Secrets Tab
// ---------------------------------------------------------------------------

interface SecretsTabProps {
  clientId: string;
  isRevoked: boolean;
}

/**
 * Secrets tab for managing client secrets (confidential clients only).
 * Shows existing secrets with revoke capability and a form to generate new ones.
 * Newly generated secrets are displayed via SecretDisplay (one-time view).
 */
function SecretsTab({ clientId, isRevoked }: SecretsTabProps) {
  const styles = useStyles();
  const { data: secrets, isLoading } = useClientSecrets(clientId);
  const generateSecret = useGenerateClientSecret();
  const revokeSecret = useRevokeClientSecret();

  const [newLabel, setNewLabel] = useState('');
  const [generatedSecret, setGeneratedSecret] = useState<ClientSecret | null>(null);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ClientSecret | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Generate a new secret */
  const handleGenerate = useCallback(async () => {
    setError(null);
    try {
      const result = await generateSecret.mutateAsync({
        clientId,
        label: newLabel.trim() || undefined,
      });
      setGeneratedSecret(result);
      setNewLabel('');
    } catch (err) {
      setError(`Failed to generate secret: ${(err as Error).message}`);
    }
  }, [clientId, newLabel, generateSecret]);

  /** Confirm revocation of a secret */
  const handleRevoke = useCallback(async () => {
    if (!revokeTarget) return;
    setError(null);
    try {
      await revokeSecret.mutateAsync({
        clientId,
        secretId: revokeTarget.id,
      });
      setRevokeDialogOpen(false);
      setRevokeTarget(null);
    } catch (err) {
      setError(`Failed to revoke secret: ${(err as Error).message}`);
    }
  }, [clientId, revokeTarget, revokeSecret]);

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <Spinner size="small" label="Loading secrets..." />
      </div>
    );
  }

  const secretList = secrets ?? [];

  return (
    <div className={styles.section}>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {/* Show newly generated secret */}
      {generatedSecret?.plaintext && (
        <SecretDisplay
          secret={generatedSecret.plaintext}
          label="Client Secret"
          onDismiss={() => setGeneratedSecret(null)}
        />
      )}

      {/* Generate new secret form */}
      {!isRevoked && (
        <div className={styles.generateForm}>
          <div className={styles.field} style={{ flex: 1 }}>
            <Label weight="semibold">Generate New Secret</Label>
            <Input
              placeholder="Optional label (e.g., production-v2)"
              value={newLabel}
              onChange={(_ev, data) => setNewLabel(data.value)}
            />
          </div>
          <Button
            appearance="primary"
            icon={<AddRegular />}
            onClick={handleGenerate}
            disabled={generateSecret.isPending}
          >
            {generateSecret.isPending ? 'Generating...' : 'Generate'}
          </Button>
        </div>
      )}

      {/* Secret list */}
      {secretList.length === 0 && (
        <div className={styles.listEmpty}>
          <Text>No secrets generated yet. Generate a secret to enable client authentication.</Text>
        </div>
      )}

      {secretList.map((secret) => (
        <div key={secret.id} className={styles.secretRow}>
          <div className={styles.secretInfo}>
            <Text weight="semibold">
              {secret.label || 'Unnamed Secret'}
            </Text>
            <Text size={200} className={styles.secretMeta}>
              Created: {new Date(secret.createdAt).toLocaleString()}
              {secret.lastUsedAt && ` · Last used: ${new Date(secret.lastUsedAt).toLocaleString()}`}
              {secret.expiresAt && ` · Expires: ${new Date(secret.expiresAt).toLocaleString()}`}
            </Text>
          </div>
          {!isRevoked && (
            <Button
              appearance="subtle"
              icon={<DeleteRegular />}
              onClick={() => {
                setRevokeTarget(secret);
                setRevokeDialogOpen(true);
              }}
              aria-label={`Revoke secret ${secret.label || secret.id}`}
            >
              Revoke
            </Button>
          )}
        </div>
      ))}

      {/* Revoke confirmation dialog */}
      <ConfirmDialog
        open={revokeDialogOpen}
        onDismiss={() => {
          setRevokeDialogOpen(false);
          setRevokeTarget(null);
        }}
        onConfirm={handleRevoke}
        title="Revoke Secret"
        confirmLabel="Revoke Secret"
        destructive
        loading={revokeSecret.isPending}
      >
        Are you sure you want to revoke the secret{' '}
        <strong>{revokeTarget?.label || 'Unnamed Secret'}</strong>?
        Any application using this secret will immediately lose access.
        This action cannot be undone.
      </ConfirmDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History Tab
// ---------------------------------------------------------------------------

interface HistoryTabProps {
  clientId: string;
}

/**
 * History tab showing audit log entries related to this client.
 */
function HistoryTab({ clientId }: HistoryTabProps) {
  const styles = useStyles();
  const { data, isLoading } = useAuditLog({
    targetType: 'client',
    limit: 20,
  } as Record<string, unknown>);
  const rawEntries = data?.data ?? [];

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
        <Text>No audit history available for this client.</Text>
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
// Main ClientDetail Component
// ---------------------------------------------------------------------------

/**
 * Client detail page with tabbed interface.
 * Loads the client by ID from the route parameter and displays
 * overview, settings, login methods, secrets (confidential), and history tabs.
 * Supports revoking via a confirm dialog with type-to-confirm.
 */
export function ClientDetail() {
  const styles = useStyles();
  const { clientId: routeClientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();

  // API hooks
  const { data: client, isLoading, refetch } = useClient(routeClientId ?? '');
  const updateClient = useUpdateClient();
  const revokeClient = useRevokeClient();

  // Fetch application and organization for context
  const { data: app } = useApplication(client?.applicationId ?? '');
  const { data: org } = useOrganization(app?.organizationId ?? '');
  const appName = app?.name ?? client?.applicationId ?? '';
  const orgName = org?.name ?? app?.organizationId ?? '';
  const orgLoginMethods: LoginMethod[] = org?.defaultLoginMethods ?? ['password', 'magic_link'];

  // Revoke dialog state
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revokeConfirmed, setRevokeConfirmed] = useState(false);

  /** Handle settings save */
  const handleSettingsSave = useCallback(
    async (data: Partial<Client>) => {
      if (!client) return;
      await updateClient.mutateAsync({ id: client.id, data });
      refetch();
    },
    [client, updateClient, refetch],
  );

  /** Handle login methods save */
  const handleLoginMethodsSave = useCallback(
    async (methods: LoginMethod[] | null) => {
      if (!client) return;
      await updateClient.mutateAsync({
        id: client.id,
        data: { loginMethods: methods } as Partial<Client>,
      });
      refetch();
    },
    [client, updateClient, refetch],
  );

  /** Handle revoke action */
  const handleRevoke = useCallback(async () => {
    if (!client) return;
    await revokeClient.mutateAsync(client.id);
    setRevokeDialogOpen(false);
    setRevokeConfirmed(false);
    refetch();
  }, [client, revokeClient, refetch]);

  // Loading state
  if (isLoading || !client) {
    return (
      <div className={styles.loading}>
        <Spinner size="large" label="Loading client..." />
      </div>
    );
  }

  // Build status action buttons
  const statusActions: EntityAction[] = [];
  if (client.status === 'active') {
    statusActions.push({
      key: 'revoke',
      label: 'Revoke',
      icon: <ShieldLockRegular />,
      onClick: () => setRevokeDialogOpen(true),
      appearance: 'secondary',
    });
  }

  // Build tab definitions
  const tabs: EntityTab[] = [
    {
      key: 'overview',
      label: 'Overview',
      content: <OverviewTab client={client} appName={appName} orgName={orgName} />,
    },
    {
      key: 'settings',
      label: 'Settings',
      content: (
        <SettingsTab
          client={client}
          onSave={handleSettingsSave}
          saving={updateClient.isPending}
        />
      ),
    },
    {
      key: 'login-methods',
      label: 'Login Methods',
      content: (
        <LoginMethodsTab
          client={client}
          inheritedMethods={orgLoginMethods}
          onSave={handleLoginMethodsSave}
          saving={updateClient.isPending}
        />
      ),
    },
  ];

  // Add secrets tab only for confidential clients
  if (client.isConfidential) {
    tabs.push({
      key: 'secrets',
      label: 'Secrets',
      content: <SecretsTab clientId={client.id} isRevoked={client.status === 'revoked'} />,
    });
  }

  // History tab is always last
  tabs.push({
    key: 'history',
    label: 'History',
    content: <HistoryTab clientId={client.id} />,
  });

  return (
    <>
      {/* Page header with back button */}
      <div className={styles.header}>
        <Button
          appearance="subtle"
          icon={<ArrowLeftRegular />}
          onClick={() => navigate('/clients')}
          aria-label="Back to clients"
        />
        <Text size={600} weight="semibold">
          {client.name}
        </Text>
        <Badge appearance="outline">
          {client.isConfidential ? 'Confidential' : 'Public'}
        </Badge>
        <StatusBadge status={client.status} />
      </div>

      {/* Tabbed detail view */}
      <EntityDetailTabs
        title={client.name}
        subtitle={client.clientId}
        status={client.status}
        tabs={tabs}
        actions={statusActions}
        defaultTab="overview"
        backPath="/clients"
      />

      {/* Revoke confirmation dialog */}
      <ConfirmDialog
        open={revokeDialogOpen}
        onDismiss={() => {
          setRevokeDialogOpen(false);
          setRevokeConfirmed(false);
        }}
        onConfirm={handleRevoke}
        title="Revoke Client"
        confirmLabel="Revoke Client"
        destructive
        confirmDisabled={!revokeConfirmed}
        loading={revokeClient.isPending}
      >
        Are you sure you want to revoke <strong>{client.name}</strong>?
        This will immediately invalidate all tokens and secrets for this client.
        Applications using this client will lose access. This action cannot be undone.
        <TypeToConfirm
          confirmValue={client.clientId}
          onConfirmedChange={setRevokeConfirmed}
          prompt={`Type "${client.clientId}" to confirm:`}
        />
      </ConfirmDialog>
    </>
  );
}
