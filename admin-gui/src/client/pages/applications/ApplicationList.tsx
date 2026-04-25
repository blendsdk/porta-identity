/**
 * Application list page.
 * Displays a paginated, searchable, filterable list of applications
 * using the EntityDataGrid component. Supports:
 * - Text search by name/slug
 * - Status filter dropdown (active / archived)
 * - Organization filter dropdown
 * - Row click navigation to application detail
 * - "Create Application" button linking to /applications/new
 */

import { useState, useCallback, useMemo } from 'react';
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
import { useApplications } from '../../api/applications';
import { useOrganizations } from '../../api/organizations';
import {
  EntityDataGrid,
  type DataGridColumn,
  type SortState,
} from '../../components/EntityDataGrid';
import { StatusBadge } from '../../components/StatusBadge';
import type { Application, ApplicationStatus } from '../../types';

/** Items per page for the application list */
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

/** Application status filter options */
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

/**
 * Application list page with search, status filter, org filter, and create button.
 * Fetches the organization list to populate the org filter dropdown and
 * to display organization names in the table rows.
 */
export function ApplicationList() {
  const styles = useStyles();
  const navigate = useNavigate();

  // Search and filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | ''>('');
  const [orgFilter, setOrgFilter] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ column: 'name', direction: 'asc' });

  // Fetch organizations for the filter dropdown and name lookups.
  // We fetch a generous page since this is used only for the dropdown.
  const { data: orgsData } = useOrganizations({ limit: 200, sortBy: 'name', sortOrder: 'asc' });
  const organizations = orgsData?.data ?? [];

  // Build a map of org ID → org name for fast lookup in table cells
  const orgNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const org of organizations) {
      map.set(org.id, org.name);
    }
    return map;
  }, [organizations]);

  // Build query params — pass orgFilter as 'organizationId' if available
  const params = {
    search: search || undefined,
    status: statusFilter || undefined,
    organizationId: orgFilter || undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    sortBy: sort.column,
    sortOrder: sort.direction,
  };

  const { data, isLoading } = useApplications(params);
  const applications = data?.data ?? [];
  const totalCount = data?.pagination?.total ?? 0;

  /** Column definitions for the application data grid */
  const columns: DataGridColumn<Application>[] = useMemo(
    () => [
      {
        key: 'name',
        label: 'Name',
        sortable: true,
        render: (app) => <Text weight="semibold">{app.name}</Text>,
      },
      {
        key: 'slug',
        label: 'Slug',
        sortable: true,
        render: (app) => (
          <Text size={200} style={{ fontFamily: 'monospace' }}>
            {app.slug}
          </Text>
        ),
      },
      {
        key: 'organization',
        label: 'Organization',
        render: (app) => (
          <Text size={200}>
            {orgNameMap.get(app.organizationId) ?? app.organizationId}
          </Text>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        sortable: true,
        render: (app) => <StatusBadge status={app.status} size="small" />,
      },
      {
        key: 'createdAt',
        label: 'Created',
        sortable: true,
        render: (app) => new Date(app.createdAt).toLocaleDateString(),
      },
    ],
    [orgNameMap],
  );

  /** Navigate to application detail on row click */
  const handleRowClick = useCallback(
    (app: Application) => {
      navigate(`/applications/${app.id}`);
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
          Applications
        </Text>
        <div className={styles.filters}>
          {/* Organization filter */}
          <Dropdown
            placeholder="All Organizations"
            value={
              orgFilter
                ? organizations.find((o) => o.id === orgFilter)?.name ?? 'All Organizations'
                : 'All Organizations'
            }
            onOptionSelect={(_ev, data) => {
              setOrgFilter(data.optionValue ?? '');
              setPage(1);
            }}
          >
            <Option key="" value="">
              All Organizations
            </Option>
            {organizations.map((org) => (
              <Option key={org.id} value={org.id}>
                {org.name}
              </Option>
            ))}
          </Dropdown>

          {/* Status filter */}
          <Dropdown
            value={STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? 'All Statuses'}
            onOptionSelect={(_ev, data) => {
              setStatusFilter((data.optionValue as ApplicationStatus | '') ?? '');
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <Option key={opt.value} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Dropdown>

          {/* Create button */}
          <Button
            appearance="primary"
            icon={<AddRegular />}
            onClick={() => navigate('/applications/new')}
          >
            Create Application
          </Button>
        </div>
      </div>

      {/* Data grid */}
      <EntityDataGrid<Application>
        columns={columns}
        items={applications}
        getRowKey={(app) => app.id}
        loading={isLoading}
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search applications..."
        sort={sort}
        onSortChange={handleSortChange}
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={totalCount}
        onPageChange={setPage}
        onRowClick={handleRowClick}
        emptyMessage={
          search || statusFilter || orgFilter
            ? 'No applications found. Try adjusting your search or filters.'
            : 'No applications yet. Create your first application to get started.'
        }
      />
    </div>
  );
}
