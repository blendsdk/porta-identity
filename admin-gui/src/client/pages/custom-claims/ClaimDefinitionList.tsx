/**
 * Claim definition list page.
 * Shows custom claim definitions scoped to an application.
 * Includes an application dropdown filter and search.
 */

import { useState, useMemo } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Input,
  Spinner,
  Badge,
  Dropdown,
  Option,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { AddRegular, SearchRegular } from '@fluentui/react-icons';
import { useNavigate } from 'react-router';
import { useClaimDefinitions } from '../../api/custom-claims';
import { useApplications } from '../../api/applications';
import type { ClaimDefinition, Application } from '../../types';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingVerticalXXL,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filters: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `2px solid ${tokens.colorNeutralStroke1}`,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  td: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  clickableRow: {
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  mono: { fontFamily: 'monospace', fontSize: tokens.fontSizeBase200 },
  empty: {
    padding: tokens.spacingVerticalXXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
});

// ---------------------------------------------------------------------------
// Value type badge color
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<string, 'brand' | 'informative' | 'success' | 'warning'> = {
  string: 'brand',
  number: 'informative',
  boolean: 'success',
  json: 'warning',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClaimDefinitionList() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [selectedAppId, setSelectedAppId] = useState('');
  const [search, setSearch] = useState('');

  // Fetch all applications for the dropdown
  const { data: appsData } = useApplications({ limit: 200 });
  const apps: Application[] = appsData?.data ?? [];

  // Auto-select first app if none selected
  if (!selectedAppId && apps.length > 0) {
    setSelectedAppId(apps[0].id);
  }

  // Fetch claim definitions for selected app
  const { data: claimsData, isLoading } = useClaimDefinitions(
    selectedAppId,
    { limit: 200 },
  );
  const allClaims: ClaimDefinition[] = claimsData?.data ?? [];

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!search) return allClaims;
    const q = search.toLowerCase();
    return allClaims.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q),
    );
  }, [allClaims, search]);

  const selectedApp = apps.find((a) => a.id === selectedAppId);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <Text size={600} weight="semibold">
          Custom Claims
        </Text>
        <Button
          appearance="primary"
          icon={<AddRegular />}
          disabled={!selectedAppId}
        >
          Create Claim
        </Button>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <Dropdown
          placeholder="Select Application"
          value={selectedApp?.name ?? ''}
          selectedOptions={selectedAppId ? [selectedAppId] : []}
          onOptionSelect={(_e, data) =>
            setSelectedAppId(data.optionValue ?? '')
          }
          style={{ minWidth: '250px' }}
        >
          {apps.map((app) => (
            <Option key={app.id} value={app.id}>
              {app.name}
            </Option>
          ))}
        </Dropdown>

        <Input
          placeholder="Search claims..."
          contentBefore={<SearchRegular />}
          value={search}
          onChange={(_e, data) => setSearch(data.value)}
          style={{ minWidth: '200px' }}
        />
      </div>

      {/* Content */}
      {!selectedAppId ? (
        <MessageBar intent="info">
          <MessageBarBody>
            Select an application to view its custom claim definitions.
          </MessageBarBody>
        </MessageBar>
      ) : isLoading ? (
        <Spinner size="large" label="Loading claim definitions..." />
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <Text>
            {search
              ? 'No claim definitions match your search.'
              : 'No custom claim definitions defined for this application.'}
          </Text>
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Name</th>
              <th className={styles.th}>Slug</th>
              <th className={styles.th}>Type</th>
              <th className={styles.th}>Required</th>
              <th className={styles.th}>ID Token</th>
              <th className={styles.th}>Access Token</th>
              <th className={styles.th}>Userinfo</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((claim) => (
              <tr
                key={claim.id}
                className={styles.clickableRow}
                onClick={() =>
                  navigate(`/claims/${claim.id}`, {
                    state: {
                      appId: selectedAppId,
                      appName: selectedApp?.name ?? '',
                    },
                  })
                }
              >
                <td className={styles.td}>
                  <Text weight="semibold">{claim.name}</Text>
                </td>
                <td className={styles.td}>
                  <Text className={styles.mono}>{claim.slug}</Text>
                </td>
                <td className={styles.td}>
                  <Badge
                    appearance="outline"
                    color={TYPE_COLORS[claim.valueType] ?? 'brand'}
                    size="small"
                  >
                    {claim.valueType}
                  </Badge>
                </td>
                <td className={styles.td}>
                  {claim.isRequired ? '✓' : '—'}
                </td>
                <td className={styles.td}>
                  {(claim as Record<string, unknown>).includeInIdToken ? '✓' : '—'}
                </td>
                <td className={styles.td}>
                  {(claim as Record<string, unknown>).includeInAccessToken ? '✓' : '—'}
                </td>
                <td className={styles.td}>
                  {(claim as Record<string, unknown>).includeInUserinfo ? '✓' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
