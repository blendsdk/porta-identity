/**
 * Organization selector dropdown.
 * Allows the admin to scope the GUI to a specific organization
 * or view data across all organizations (super-admin only).
 * Shows a search field, recent selections, and the full org list.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Popover,
  PopoverTrigger,
  PopoverSurface,
  Button,
  Badge,
  Divider,
} from '@fluentui/react-components';
import {
  BuildingRegular,
  ChevronDownRegular,
  SearchRegular,
  DismissRegular,
  GlobeRegular,
} from '@fluentui/react-icons';

import { useOrgContext } from '../hooks/useOrgContext';
import type { Organization } from '../types';

const useStyles = makeStyles({
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    maxWidth: '220px',
  },
  triggerLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  surface: {
    width: '280px',
    maxHeight: '360px',
    display: 'flex',
    flexDirection: 'column',
    padding: 0,
  },
  searchBox: {
    padding: tokens.spacingHorizontalS,
  },
  list: {
    overflowY: 'auto',
    maxHeight: '260px',
    padding: tokens.spacingVerticalXS,
  },
  sectionLabel: {
    paddingLeft: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXXS,
  },
  orgItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    width: '100%',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    borderRadius: tokens.borderRadiusMedium,
    textAlign: 'left',
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  orgItemActive: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    fontWeight: tokens.fontWeightSemibold,
  },
  orgName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  superBadge: {
    flexShrink: 0,
  },
  allOrgsItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    width: '100%',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    borderRadius: tokens.borderRadiusMedium,
    textAlign: 'left',
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  empty: {
    padding: tokens.spacingHorizontalM,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
});

/** Props for the OrgSelector component */
export interface OrgSelectorProps {
  /** List of available organizations (fetched from API) */
  organizations: Organization[];
  /** Whether the org list is currently loading */
  loading?: boolean;
}

/**
 * Organization selector with search, recents, and "All" option.
 * Used in the TopBar to scope data views to a specific org.
 */
export function OrgSelector({ organizations, loading }: OrgSelectorProps) {
  const styles = useStyles();
  const { selectedOrg, recentOrgs, selectOrg, clearSelection } = useOrgContext();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  /** Filter organizations by search query (case-insensitive name/slug match) */
  const filteredOrgs = useMemo(() => {
    if (!search.trim()) return organizations;
    const query = search.toLowerCase();
    return organizations.filter(
      (org) =>
        org.name.toLowerCase().includes(query) ||
        org.slug.toLowerCase().includes(query),
    );
  }, [organizations, search]);

  /** Handle org selection and close the popover */
  const handleSelect = useCallback(
    (org: Organization | null) => {
      if (org) {
        selectOrg(org);
      } else {
        clearSelection();
      }
      setOpen(false);
      setSearch('');
    },
    [selectOrg, clearSelection],
  );

  /** Trigger button label */
  const triggerLabel = selectedOrg?.name ?? 'All Organizations';

  return (
    <Popover open={open} onOpenChange={(_e, data) => setOpen(data.open)}>
      <PopoverTrigger disableButtonEnhancement>
        <Button
          appearance="subtle"
          icon={selectedOrg ? <BuildingRegular /> : <GlobeRegular />}
          aria-label={`Organization: ${triggerLabel}`}
        >
          <span className={styles.trigger}>
            <span className={styles.triggerLabel}>{triggerLabel}</span>
            <ChevronDownRegular />
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverSurface className={styles.surface}>
        {/* Search input */}
        <div className={styles.searchBox}>
          <Input
            placeholder="Search organizations..."
            contentBefore={<SearchRegular />}
            contentAfter={
              search ? (
                <Button
                  appearance="transparent"
                  icon={<DismissRegular />}
                  size="small"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                />
              ) : undefined
            }
            value={search}
            onChange={(_e, data) => setSearch(data.value)}
            autoFocus
          />
        </div>

        <Divider />

        <div className={styles.list}>
          {/* "All Organizations" option */}
          <button
            type="button"
            className={`${styles.allOrgsItem} ${!selectedOrg ? styles.orgItemActive : ''}`}
            onClick={() => handleSelect(null)}
          >
            <GlobeRegular />
            <span>All Organizations</span>
          </button>

          {/* Recent organizations section */}
          {recentOrgs.length > 0 && !search && (
            <>
              <div className={styles.sectionLabel}>
                <Text size={200} weight="semibold">
                  Recent
                </Text>
              </div>
              {recentOrgs.map((org) => (
                <button
                  key={`recent-${org.id}`}
                  type="button"
                  className={`${styles.orgItem} ${selectedOrg?.id === org.id ? styles.orgItemActive : ''}`}
                  onClick={() => handleSelect(org)}
                >
                  <BuildingRegular />
                  <span className={styles.orgName}>{org.name}</span>
                  {org.isSuperAdmin && (
                    <Badge
                      appearance="filled"
                      color="brand"
                      size="small"
                      className={styles.superBadge}
                    >
                      Super
                    </Badge>
                  )}
                </button>
              ))}
              <Divider />
            </>
          )}

          {/* All organizations section */}
          <div className={styles.sectionLabel}>
            <Text size={200} weight="semibold">
              {search ? 'Results' : 'All'}
            </Text>
          </div>
          {loading && (
            <div className={styles.empty}>
              <Text size={200}>Loading...</Text>
            </div>
          )}
          {!loading && filteredOrgs.length === 0 && (
            <div className={styles.empty}>
              <Text size={200}>No organizations found</Text>
            </div>
          )}
          {filteredOrgs.map((org) => (
            <button
              key={org.id}
              type="button"
              className={`${styles.orgItem} ${selectedOrg?.id === org.id ? styles.orgItemActive : ''}`}
              onClick={() => handleSelect(org)}
            >
              <BuildingRegular />
              <span className={styles.orgName}>{org.name}</span>
              {org.isSuperAdmin && (
                <Badge
                  appearance="filled"
                  color="brand"
                  size="small"
                  className={styles.superBadge}
                >
                  Super
                </Badge>
              )}
            </button>
          ))}
        </div>
      </PopoverSurface>
    </Popover>
  );
}
