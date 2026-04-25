/**
 * Export page.
 *
 * Allows admin to select entity types, choose format, and download
 * exported data as JSON file. Supports multiple entity type selection
 * and triggers download via Blob URL.
 */

import { useState, useCallback } from 'react';
import {
  Text,
  Button,
  Checkbox,
  makeStyles,
  tokens,
  Card,
  Spinner,
} from '@fluentui/react-components';
import {
  ArrowDownloadRegular,
  ArrowImportRegular,
} from '@fluentui/react-icons';
import { useNavigate } from 'react-router';
import { useExportData, type EntityType } from '../../api/import-export';
import { useToast } from '../../hooks/useToast';

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
  card: {
    padding: tokens.spacingHorizontalL,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalM,
  },
  checkboxGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: tokens.spacingVerticalXS,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    marginTop: tokens.spacingVerticalL,
  },
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All exportable entity types with display labels */
const ENTITY_OPTIONS: { value: EntityType; label: string }[] = [
  { value: 'organizations', label: 'Organizations' },
  { value: 'applications', label: 'Applications' },
  { value: 'clients', label: 'Clients' },
  { value: 'users', label: 'Users' },
  { value: 'roles', label: 'Roles' },
  { value: 'permissions', label: 'Permissions' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Export page component.
 * Allows selecting entity types and exporting them as JSON.
 */
export function ExportPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const exportMutation = useExportData();

  const [selected, setSelected] = useState<Set<EntityType>>(new Set());
  const [exporting, setExporting] = useState(false);

  /** Toggle an entity type selection */
  const toggleEntity = useCallback((entity: EntityType) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(entity)) next.delete(entity);
      else next.add(entity);
      return next;
    });
  }, []);

  /** Select or deselect all entity types */
  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === ENTITY_OPTIONS.length
        ? new Set()
        : new Set(ENTITY_OPTIONS.map((o) => o.value)),
    );
  }, []);

  /** Export selected entity types one by one and bundle into download */
  const handleExport = useCallback(async () => {
    if (selected.size === 0) return;
    setExporting(true);
    try {
      // Export each selected entity type
      const results: Record<string, unknown> = {};
      for (const entityType of selected) {
        const data = await exportMutation.mutateAsync({
          entityType,
          format: 'json',
        });
        results[entityType] = data;
      }

      // Create downloadable JSON file
      const json = JSON.stringify(results, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `porta-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);

      showToast('Export downloaded successfully', 'success');
    } catch {
      showToast('Export failed', 'error');
    }
    setExporting(false);
  }, [selected, exportMutation, showToast]);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Text as="h1" size={800} weight="bold">
          Export Data
        </Text>
        <Button
          appearance="outline"
          icon={<ArrowImportRegular />}
          onClick={() => navigate('/import-export/import')}
        >
          Import Data
        </Button>
      </div>

      <Card className={styles.card}>
        <Text size={500} weight="semibold">
          Select Entity Types
        </Text>
        <div className={styles.section}>
          <Checkbox
            label="Select All"
            checked={
              selected.size === ENTITY_OPTIONS.length
                ? true
                : selected.size === 0
                  ? false
                  : 'mixed'
            }
            onChange={toggleAll}
          />
          <div className={styles.checkboxGrid}>
            {ENTITY_OPTIONS.map((opt) => (
              <Checkbox
                key={opt.value}
                label={opt.label}
                checked={selected.has(opt.value)}
                onChange={() => toggleEntity(opt.value)}
              />
            ))}
          </div>
        </div>

        <div className={styles.actions}>
          <Button
            appearance="primary"
            icon={exporting ? <Spinner size="tiny" /> : <ArrowDownloadRegular />}
            disabled={selected.size === 0 || exporting}
            onClick={handleExport}
          >
            {exporting ? 'Exporting…' : 'Export JSON'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
