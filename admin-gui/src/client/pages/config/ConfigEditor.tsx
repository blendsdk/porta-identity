/**
 * Configuration editor page.
 *
 * Displays system configuration key-value entries with:
 * - Key-value list from system_config table
 * - Inline edit for config values
 * - Value type indicators (string, number, boolean, duration)
 * - Confirm dialog for changes
 * - Visual distinction for default vs overridden values
 */

import { useState, useCallback } from 'react';
import {
  Text,
  Button,
  Input,
  makeStyles,
  tokens,
  Card,
  Badge,
  Spinner,
} from '@fluentui/react-components';
import {
  EditRegular,
  CheckmarkRegular,
  DismissRegular,
  SettingsRegular,
} from '@fluentui/react-icons';
import { useSystemConfig, useUpdateConfig } from '../../api/config';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../hooks/useToast';
import type { SystemConfig } from '../../types';

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
  editRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  keyName: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSizeBase300,
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Infer a display type from the config value string */
function inferType(value: string): string {
  if (value === 'true' || value === 'false') return 'boolean';
  if (/^\d+$/.test(value)) return 'number';
  if (/^\d+[smhd]$/.test(value)) return 'duration';
  return 'string';
}

/** Map type to badge color */
function typeColor(type: string): 'informative' | 'success' | 'warning' | 'severe' {
  switch (type) {
    case 'boolean': return 'success';
    case 'number': return 'warning';
    case 'duration': return 'severe';
    default: return 'informative';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * System configuration editor page.
 * Allows viewing and inline editing of system config entries.
 */
export function ConfigEditor() {
  const styles = useStyles();
  const { showToast } = useToast();

  const { data, isLoading } = useSystemConfig();
  const updateMutation = useUpdateConfig();

  const configs: SystemConfig[] = Array.isArray(data)
    ? data
    : (data as any)?.data ?? [];

  // Inline edit state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  /** Start editing a config entry */
  const startEdit = useCallback((config: SystemConfig) => {
    setEditingKey(config.key);
    setEditValue(config.value);
  }, []);

  /** Cancel editing */
  const cancelEdit = useCallback(() => {
    setEditingKey(null);
    setEditValue('');
  }, []);

  /** Show confirm dialog before saving */
  const requestSave = useCallback(() => {
    setConfirmOpen(true);
  }, []);

  /** Save the edited config value */
  const handleSave = useCallback(async () => {
    if (!editingKey) return;
    try {
      await updateMutation.mutateAsync({ key: editingKey, value: editValue });
      showToast(`Configuration "${editingKey}" updated`, 'success');
    } catch {
      showToast('Failed to update configuration', 'error');
    }
    setConfirmOpen(false);
    setEditingKey(null);
    setEditValue('');
  }, [editingKey, editValue, updateMutation, showToast]);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Text as="h1" size={800} weight="bold">
          System Configuration
        </Text>
      </div>

      {isLoading ? (
        <LoadingSkeleton variant="table" rows={8} />
      ) : configs.length === 0 ? (
        <EmptyState
          title="No configuration entries"
          description="System configuration entries will appear here."
          icon={<SettingsRegular />}
        />
      ) : (
        <Card>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Key</th>
                <th className={styles.th}>Value</th>
                <th className={styles.th}>Type</th>
                <th className={styles.th} style={{ width: '100px' }} />
              </tr>
            </thead>
            <tbody>
              {configs.map((config) => (
                <tr key={config.key} className={styles.row}>
                  <td className={styles.td}>
                    <span className={styles.keyName}>{config.key}</span>
                  </td>
                  <td className={styles.td}>
                    {editingKey === config.key ? (
                      <div className={styles.editRow}>
                        <Input
                          value={editValue}
                          onChange={(_e, d) => setEditValue(d.value)}
                          size="small"
                          style={{ minWidth: '200px' }}
                        />
                        <Button
                          icon={<CheckmarkRegular />}
                          appearance="primary"
                          size="small"
                          onClick={requestSave}
                        />
                        <Button
                          icon={<DismissRegular />}
                          appearance="subtle"
                          size="small"
                          onClick={cancelEdit}
                        />
                      </div>
                    ) : (
                      <Text size={300}>{config.value}</Text>
                    )}
                  </td>
                  <td className={styles.td}>
                    <Badge
                      appearance="tint"
                      color={typeColor(inferType(config.value))}
                      size="small"
                    >
                      {inferType(config.value)}
                    </Badge>
                  </td>
                  <td className={styles.td}>
                    {editingKey !== config.key && (
                      <Button
                        icon={<EditRegular />}
                        appearance="subtle"
                        size="small"
                        onClick={() => startEdit(config)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Confirm dialog for value changes */}
      <ConfirmDialog
        open={confirmOpen}
        onDismiss={() => setConfirmOpen(false)}
        onConfirm={handleSave}
        title="Update Configuration"
        loading={updateMutation.isPending}
      >
        <Text>
          Update <strong>{editingKey}</strong> to{' '}
          <code>{editValue}</code>?
        </Text>
      </ConfirmDialog>
    </div>
  );
}
