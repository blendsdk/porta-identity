/**
 * Import page.
 *
 * Provides file upload (drag-drop + file picker), dry-run preview
 * showing counts per entity type, confirm import with progress,
 * and result summary.
 */

import { useState, useCallback, useRef } from 'react';
import {
  Text,
  Button,
  makeStyles,
  tokens,
  Card,
  Badge,
  Spinner,
  ProgressBar,
} from '@fluentui/react-components';
import {
  ArrowUploadRegular,
  DocumentRegular,
  CheckmarkCircleRegular,
  DismissRegular,
} from '@fluentui/react-icons';
import { useNavigate } from 'react-router';
import { useImportData } from '../../api/import-export';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../hooks/useToast';

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
  dropZone: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalXXL,
    border: `2px dashed ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    cursor: 'pointer',
    transition: 'border-color 0.2s',
    '&:hover': {
      borderColor: tokens.colorBrandStroke1,
    },
  },
  dropZoneActive: {
    borderColor: tokens.colorBrandStroke1,
    backgroundColor: tokens.colorNeutralBackground1Hover,
  },
  preview: {
    padding: tokens.spacingHorizontalL,
  },
  previewTable: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: tokens.spacingVerticalM,
  },
  th: {
    textAlign: 'left',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderBottom: `2px solid ${tokens.colorNeutralStroke1}`,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  td: {
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    marginTop: tokens.spacingVerticalM,
  },
  result: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalXL,
  },
});

/** Parsed import data with counts per entity type */
interface ImportPreview {
  entityType: string;
  count: number;
}

/**
 * Import page component.
 * Supports JSON file upload, dry-run preview, and confirmed import.
 */
export function ImportPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const importMutation = useImportData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<Record<string, unknown[]> | null>(null);
  const [preview, setPreview] = useState<ImportPreview[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ total: number } | null>(null);

  /** Parse uploaded JSON file and generate preview */
  const parseFile = useCallback(async (f: File) => {
    try {
      const text = await f.text();
      const data = JSON.parse(text) as Record<string, unknown[]>;
      setParsedData(data);
      const items: ImportPreview[] = Object.entries(data)
        .filter(([, v]) => Array.isArray(v))
        .map(([entityType, records]) => ({
          entityType,
          count: (records as unknown[]).length,
        }));
      setPreview(items);
      setFile(f);
      setResult(null);
    } catch {
      showToast('Invalid JSON file', 'error');
    }
  }, [showToast]);

  /** Handle file input change */
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) parseFile(f);
    },
    [parseFile],
  );

  /** Handle drag-and-drop */
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f?.type === 'application/json' || f?.name.endsWith('.json')) {
        parseFile(f);
      } else {
        showToast('Please drop a JSON file', 'error');
      }
    },
    [parseFile, showToast],
  );

  /** Execute import */
  const handleImport = useCallback(async () => {
    if (!parsedData) return;
    setConfirmOpen(false);
    setImporting(true);
    try {
      let total = 0;
      for (const [entityType, records] of Object.entries(parsedData)) {
        if (!Array.isArray(records)) continue;
        await importMutation.mutateAsync({ entityType, data: records });
        total += records.length;
      }
      setResult({ total });
      showToast(`Imported ${total} records`, 'success');
    } catch {
      showToast('Import failed', 'error');
    }
    setImporting(false);
  }, [parsedData, importMutation, showToast]);

  /** Reset to initial state */
  const reset = useCallback(() => {
    setFile(null);
    setParsedData(null);
    setPreview([]);
    setResult(null);
  }, []);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Text as="h1" size={800} weight="bold">
          Import Data
        </Text>
        <Button appearance="outline" onClick={() => navigate('/import-export')}>
          Back to Export
        </Button>
      </div>

      {/* Result summary */}
      {result && (
        <Card className={styles.preview}>
          <div className={styles.result}>
            <CheckmarkCircleRegular style={{ fontSize: 48, color: tokens.colorPaletteGreenForeground1 }} />
            <Text size={500} weight="semibold">
              Import Complete
            </Text>
            <Text>{result.total} records imported successfully.</Text>
            <Button appearance="primary" onClick={reset}>
              Import Another File
            </Button>
          </div>
        </Card>
      )}

      {/* Upload area (hidden when result is shown) */}
      {!result && !file && (
        <div
          className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <ArrowUploadRegular style={{ fontSize: 48 }} />
          <Text size={400}>Drag & drop a JSON file here</Text>
          <Text size={200}>or click to browse</Text>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {/* Dry-run preview */}
      {!result && file && preview.length > 0 && (
        <Card className={styles.preview}>
          <Text size={500} weight="semibold">
            <DocumentRegular /> {file.name}
          </Text>
          <table className={styles.previewTable}>
            <thead>
              <tr>
                <th className={styles.th}>Entity Type</th>
                <th className={styles.th}>Records</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((p) => (
                <tr key={p.entityType}>
                  <td className={styles.td}>
                    <Badge appearance="tint" size="small">
                      {p.entityType}
                    </Badge>
                  </td>
                  <td className={styles.td}>
                    <Text weight="semibold">{p.count}</Text>
                  </td>
                </tr>
              ))}
              <tr>
                <td className={styles.td}>
                  <Text weight="bold">Total</Text>
                </td>
                <td className={styles.td}>
                  <Text weight="bold">
                    {preview.reduce((s, p) => s + p.count, 0)}
                  </Text>
                </td>
              </tr>
            </tbody>
          </table>

          {importing && <ProgressBar />}

          <div className={styles.actions}>
            <Button
              appearance="primary"
              icon={importing ? <Spinner size="tiny" /> : <ArrowUploadRegular />}
              disabled={importing}
              onClick={() => setConfirmOpen(true)}
            >
              {importing ? 'Importing…' : 'Confirm Import'}
            </Button>
            <Button
              appearance="subtle"
              icon={<DismissRegular />}
              onClick={reset}
              disabled={importing}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onDismiss={() => setConfirmOpen(false)}
        onConfirm={handleImport}
        title="Confirm Import"
      >
        <Text>
          Import {preview.reduce((s, p) => s + p.count, 0)} records across{' '}
          {preview.length} entity types? This operation cannot be undone.
        </Text>
      </ConfirmDialog>
    </div>
  );
}
