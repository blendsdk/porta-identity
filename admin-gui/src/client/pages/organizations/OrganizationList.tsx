/**
 * Organization list page.
 * Displays a paginated, searchable, filterable list of organizations
 * using the EntityDataGrid component. Supports:
 * - Text search by name/slug
 * - Status filter dropdown
 * - Row click navigation to org detail
 * - "Create Organization" button linking to /organizations/new
 */

import { useState, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Dropdown,
  Option,
} from '@fluentui/react-components';
import { AddRegular } from '@fluentui/react-icons';
import { useNavigate } from 'react-router';
import { useOrganizations } from '../../api/organizations';
import {
  EntityDataGrid,
  type DataGridColumn,
  type SortState,
} from '../../components/EntityDataGrid';
import { StatusBadge } from '../../components/StatusBadge';
import type { Organization, OrganizationStatus } from '../../types';

const PAGE_SIZE = 20;

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
    gap: tokens.spacingHorizontalM,
  },
  filters: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
});

/** Status filter options */
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'archived', label: 'Archived' },
];

/** Column definitions for the organization data grid */
const COLUMNS: DataGridColumn<Organization>[] = [
  {
    key: 'name',
    label: 'Name',
    sortable: true,
    render: (org) => (
      <Text weight="semibold">{org.name}</Text>
    ),
  },
  {
    key: 'slug',
    label: 'Slug',
    sortable: true,
    render: (org) => (
      <Text size={200} style={{ fontFamily: 'monospace' }}>
        {org.slug}
      </Text>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    sortable: true,
    render: (org) => <StatusBadge status={org.status} size="small" />,
  },
  {
    key: 'defaultLocale',
    label: 'Locale',
    render: (org) => org.defaultLocale,
  },
  {
    key: 'createdAt',
    label: 'Created',
    sortable: true,
    render: (org) => new Date(org.createdAt).toLocaleDateString(),
  },
];

/**
 * Organization list page with search, status filter, and create button.
 */
export function OrganizationList() {
  const styles = useStyles();
  const navigate = useNavigate();

  // Search and filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrganizationStatus | ''>('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ column: 'name', direction: 'asc' });

  // Build query params from state
  const params = {
    search: search || undefined,
    status: statusFilter || undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    sortBy: sort.column,
    sortOrder: sort.direction,
  };

  const { data, isLoading } = useOrganizations(params);
  const organizations = data?.data ?? [];
  const totalCount = data?.pagination?.total ?? 0;

  /** Navigate to organization detail on row click */
  const handleRowClick = useCallback(
    (org: Organization) => {
      navigate(`/organizations/${org.id}`);
    },
    [navigate],
  );

  /** Handle sort changes from the data grid */
  const handleSortChange = useCallback((newSort: SortState) => {
    setSort(newSort);
    setPage(1); // Reset to first page on sort change
  }, []);

  return (
    <div className={styles.root}>
      {/* Header with title, filters, and create button */}
      <div className={styles.header}>
        <Text size={600} weight="semibold">
          Organizations
        </Text>
        <div className={styles.filters}>
          <Dropdown
            value={STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? 'All Statuses'}
            onOptionSelect={(_ev, data) => {
              setStatusFilter((data.optionValue as OrganizationStatus | '') ?? '');
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <Option key={opt.value} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Dropdown>
          <Button
            appearance="primary"
            icon={<AddRegular />}
            onClick={() => navigate('/organizations/new')}
          >
            Create Organization
          </Button>
        </div>
      </div>

      {/* Data grid */}
      <EntityDataGrid<Organization>
        columns={COLUMNS}
        items={organizations}
        getRowKey={(org) => org.id}
        loading={isLoading}
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search organizations..."
        sort={sort}
        onSortChange={handleSortChange}
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={totalCount}
        onPageChange={setPage}
        onRowClick={handleRowClick}
        emptyMessage={
          search || statusFilter
            ? 'No organizations found. Try adjusting your search or filters.'
            : 'No organizations yet. Create your first organization to get started.'
        }
      />
    </div>
  );
}
