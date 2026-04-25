/**
 * Signing key management page.
 *
 * Displays ES256 signing keys with:
 * - Key list: key ID (truncated + copy), algorithm, created date, status
 * - Generate new key (with confirm)
 * - Rotate key (mark old as rotated, generate new — with TypeToConfirm)
 * - JWKS endpoint URL with CopyButton
 */

import { useState, useCallback } from 'react';
import {
  Text,
  Button,
  makeStyles,
  tokens,
  Card,
  Badge,
} from '@fluentui/react-components';
import {
  AddRegular,
  ArrowSyncRegular,
  KeyRegular,
  LinkRegular,
} from '@fluentui/react-icons';
import { useSigningKeys, useGenerateKey, useRotateKey } from '../../api/keys';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TypeToConfirm } from '../../components/TypeToConfirm';
import { CopyButton } from '../../components/CopyButton';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../hooks/useToast';
import type { SigningKey } from '../../types';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
  },
  jwksRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    fontFamily: 'monospace',
    fontSize: tokens.fontSizeBase200,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `2px solid ${tokens.colorNeutralStroke1}`,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
  },
  td: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    fontSize: tokens.fontSizeBase300,
    verticalAlign: 'middle',
  },
  row: {
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  keyId: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSizeBase200,
  },
  typeToConfirmWrapper: {
    marginTop: tokens.spacingVerticalM,
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Truncate a key ID for display, showing first 12 chars */
function truncateKeyId(kid: string): string {
  return kid.length > 12 ? `${kid.slice(0, 12)}…` : kid;
}

/** Format date for display */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Map key status to badge color */
function statusColor(status: string): 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'active': return 'success';
    case 'rotated': return 'warning';
    default: return 'danger';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Signing key management page.
 * Displays keys, supports generation and rotation.
 */
export function SigningKeys() {
  const styles = useStyles();
  const { showToast } = useToast();

  const { data, isLoading } = useSigningKeys();
  const generateMutation = useGenerateKey();
  const rotateMutation = useRotateKey();

  const keys: SigningKey[] = (data as any)?.data ?? (data as any) ?? [];

  // Dialog state
  const [generateOpen, setGenerateOpen] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotateConfirmed, setRotateConfirmed] = useState(false);

  // Build JWKS URL from current window location
  const jwksUrl = `${window.location.origin}/.well-known/jwks.json`;

  /** Generate a new signing key */
  const handleGenerate = useCallback(async () => {
    try {
      await generateMutation.mutateAsync();
      showToast('New signing key generated', 'success');
    } catch {
      showToast('Failed to generate signing key', 'error');
    }
    setGenerateOpen(false);
  }, [generateMutation, showToast]);

  /** Rotate keys: mark current as rotated, generate new */
  const handleRotate = useCallback(async () => {
    try {
      await rotateMutation.mutateAsync();
      showToast('Signing keys rotated', 'success');
    } catch {
      showToast('Failed to rotate signing keys', 'error');
    }
    setRotateOpen(false);
    setRotateConfirmed(false);
  }, [rotateMutation, showToast]);

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <Text as="h1" size={800} weight="bold">
          Signing Keys
        </Text>
        <div className={styles.actions}>
          <Button
            appearance="primary"
            icon={<AddRegular />}
            onClick={() => setGenerateOpen(true)}
          >
            Generate Key
          </Button>
          <Button
            appearance="outline"
            icon={<ArrowSyncRegular />}
            onClick={() => setRotateOpen(true)}
            disabled={keys.length === 0}
          >
            Rotate Keys
          </Button>
        </div>
      </div>

      {/* JWKS Endpoint URL */}
      <Card>
        <div className={styles.jwksRow}>
          <LinkRegular />
          <Text size={200}>JWKS Endpoint:</Text>
          <Text size={200} weight="semibold">
            {jwksUrl}
          </Text>
          <CopyButton value={jwksUrl} />
        </div>
      </Card>

      {/* Key List */}
      {isLoading ? (
        <LoadingSkeleton variant="table" rows={4} />
      ) : keys.length === 0 ? (
        <EmptyState
          title="No signing keys"
          description="Generate your first signing key to start signing tokens."
          icon={<KeyRegular />}
        />
      ) : (
        <Card>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Key ID</th>
                <th className={styles.th}>Algorithm</th>
                <th className={styles.th}>Created</th>
                <th className={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className={styles.row}>
                  <td className={styles.td}>
                    <span className={styles.keyId}>
                      {truncateKeyId(key.kid)}
                    </span>
                    <CopyButton value={key.kid} />
                  </td>
                  <td className={styles.td}>
                    <Badge appearance="outline" size="small">
                      {key.algorithm}
                    </Badge>
                  </td>
                  <td className={styles.td}>
                    <Text size={200}>{formatDate(key.createdAt)}</Text>
                  </td>
                  <td className={styles.td}>
                    <Badge
                      appearance="filled"
                      color={statusColor(key.status)}
                      size="small"
                    >
                      {key.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Generate confirm dialog */}
      <ConfirmDialog
        open={generateOpen}
        onDismiss={() => setGenerateOpen(false)}
        onConfirm={handleGenerate}
        title="Generate Signing Key"
        loading={generateMutation.isPending}
      >
        <Text>
          Generate a new ES256 signing key? This key will be used for
          signing new tokens.
        </Text>
      </ConfirmDialog>

      {/* Rotate confirm dialog with TypeToConfirm */}
      <ConfirmDialog
        open={rotateOpen}
        onDismiss={() => {
          setRotateOpen(false);
          setRotateConfirmed(false);
        }}
        onConfirm={handleRotate}
        title="Rotate Signing Keys"
        destructive
        confirmDisabled={!rotateConfirmed}
        loading={rotateMutation.isPending}
      >
        <Text>
          This will mark the current active key as <strong>rotated</strong>{' '}
          and generate a new active key. Existing tokens signed with the
          old key will still be valid until they expire.
        </Text>
        <div className={styles.typeToConfirmWrapper}>
          <TypeToConfirm
            confirmText="ROTATE"
            onConfirmed={setRotateConfirmed}
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
