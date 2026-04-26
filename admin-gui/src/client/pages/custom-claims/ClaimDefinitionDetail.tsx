/**
 * Claim definition detail page.
 * Shows claim definition information with two tabs:
 * - Overview: Read-only info grid (name, slug, type, required, token inclusion, etc.)
 * - History: Audit timeline for this claim definition
 *
 * AppId is passed via router location state from the ClaimDefinitionList page.
 */

import { useState } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Badge,
  Button,
  Spinner,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { DeleteRegular } from '@fluentui/react-icons';
import { useParams, useLocation, useNavigate } from 'react-router';
import { useClaimDefinition, useArchiveClaimDefinition } from '../../api/custom-claims';
import { EntityDetailTabs, type EntityTab, type EntityAction } from '../../components/EntityDetailTabs';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TypeToConfirm } from '../../components/TypeToConfirm';
import { AuditTimeline, type TimelineEntry } from '../../components/AuditTimeline';
import { useAuditLog } from '../../api/audit';
import type { AuditEntry } from '../../types';

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
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(iso: string): string {
  return new Date(iso).toLocaleString();
}

const TYPE_COLORS: Record<string, 'brand' | 'informative' | 'success' | 'warning'> = {
  string: 'brand',
  number: 'informative',
  boolean: 'success',
  json: 'warning',
};

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab({
  claim,
  appName,
}: {
  claim: {
    name: string;
    slug: string;
    description: string | null;
    valueType: string;
    isRequired: boolean;
    defaultValue: unknown | null;
    validationRules: Record<string, unknown> | null;
    applicationId: string;
    createdAt: string;
    updatedAt: string;
    id: string;
  };
  appName: string;
}) {
  const styles = useStyles();
  const rec = claim as Record<string, unknown>;

  return (
    <div className={styles.infoGrid}>
      <Text className={styles.label} size={200}>Name</Text>
      <Text weight="semibold">{claim.name}</Text>

      <Text className={styles.label} size={200}>Slug</Text>
      <Text className={styles.mono} size={200}>{claim.slug}</Text>

      <Text className={styles.label} size={200}>Description</Text>
      <Text>{claim.description ?? '—'}</Text>

      <Text className={styles.label} size={200}>Value Type</Text>
      <Badge
        appearance="outline"
        color={TYPE_COLORS[claim.valueType] ?? 'brand'}
        size="small"
      >
        {claim.valueType}
      </Badge>

      <Text className={styles.label} size={200}>Required</Text>
      <Text>{claim.isRequired ? 'Yes' : 'No'}</Text>

      <Text className={styles.label} size={200}>Default Value</Text>
      <Text className={styles.mono} size={200}>
        {claim.defaultValue != null ? JSON.stringify(claim.defaultValue) : '—'}
      </Text>

      <Text className={styles.label} size={200}>Include in ID Token</Text>
      <Text>{rec.includeInIdToken ? '✓ Yes' : '✗ No'}</Text>

      <Text className={styles.label} size={200}>Include in Access Token</Text>
      <Text>{rec.includeInAccessToken ? '✓ Yes' : '✗ No'}</Text>

      <Text className={styles.label} size={200}>Include in Userinfo</Text>
      <Text>{rec.includeInUserinfo ? '✓ Yes' : '✗ No'}</Text>

      <Text className={styles.label} size={200}>Application</Text>
      <Text>{appName}</Text>

      <Text className={styles.label} size={200}>Claim ID</Text>
      <Text className={styles.mono} size={200}>{claim.id}</Text>

      <Text className={styles.label} size={200}>Created</Text>
      <Text size={200}>{fmt(claim.createdAt)}</Text>

      <Text className={styles.label} size={200}>Updated</Text>
      <Text size={200}>{fmt(claim.updatedAt)}</Text>

      {claim.validationRules && Object.keys(claim.validationRules).length > 0 && (
        <>
          <Text className={styles.label} size={200}>Validation Rules</Text>
          <Text className={styles.mono} size={200}>
            {JSON.stringify(claim.validationRules, null, 2)}
          </Text>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History Tab
// ---------------------------------------------------------------------------

function mapAuditEntries(entries: AuditEntry[]): TimelineEntry[] {
  return entries.map((e) => ({
    id: e.id,
    action: e.eventType,
    actor: e.actorId ?? 'System',
    timestamp: new Date(e.createdAt).toLocaleString(),
    details: e.description ?? (e.metadata ? JSON.stringify(e.metadata) : undefined),
  }));
}

function HistoryTab({ claimId }: { claimId: string }) {
  const { data } = useAuditLog({ limit: 50 });
  const allEntries = data?.data ?? [];
  const filtered = allEntries.filter((e) => e.eventType.startsWith('claim.'));
  return <AuditTimeline entries={mapAuditEntries(filtered)} />;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ClaimDefinitionDetail() {
  const { claimId = '' } = useParams<{ claimId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as
    | { appId?: string; appName?: string }
    | undefined;
  const appId = state?.appId ?? '';
  const appName = state?.appName ?? 'Unknown Application';

  const [showArchive, setShowArchive] = useState(false);
  const [archiveConfirmed, setArchiveConfirmed] = useState(false);

  const { data: claim, isLoading } = useClaimDefinition(claimId);
  const archiveClaim = useArchiveClaimDefinition();

  if (!appId) {
    return (
      <div style={{ padding: tokens.spacingVerticalXXL }}>
        <MessageBar intent="warning">
          <MessageBarBody>
            Application context is missing. Please navigate to a claim from the{' '}
            <Button
              appearance="transparent"
              onClick={() => navigate('/claims')}
              style={{ minWidth: 0, padding: 0, textDecoration: 'underline' }}
            >
              Claims list
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
        <Spinner size="large" label="Loading claim definition..." />
      </div>
    );
  }

  if (!claim) {
    return (
      <div style={{ padding: tokens.spacingVerticalXXL }}>
        <MessageBar intent="error">
          <MessageBarBody>Claim definition not found.</MessageBarBody>
        </MessageBar>
      </div>
    );
  }

  const claimData =
    (claim as { data?: typeof claim })?.data ?? claim;

  const handleArchive = () => {
    archiveClaim.mutate(claimId, {
      onSuccess: () => navigate('/claims'),
    });
  };

  const tabs: EntityTab[] = [
    {
      key: 'overview',
      label: 'Overview',
      content: <OverviewTab claim={claimData} appName={appName} />,
    },
    {
      key: 'history',
      label: 'History',
      content: <HistoryTab claimId={claimId} />,
    },
  ];

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
        title={claimData.name}
        tabs={tabs}
        actions={actions}
        defaultTab="overview"
        backPath="/claims"
      />

      <ConfirmDialog
        open={showArchive}
        title="Archive Claim Definition"
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
          confirmValue={claimData.name}
          onConfirmedChange={setArchiveConfirmed}
          prompt={`This will archive the claim "${claimData.name}" and remove it from all users. Type "${claimData.name}" to confirm:`}
        />
      </ConfirmDialog>
    </>
  );
}
