/**
 * Client list page.
 * Displays a paginated, searchable, filterable list of OIDC clients
 * using the EntityDataGrid component. Supports:
 * - Text search by name/client ID
 * - Application filter dropdown
 * - Client type filter (public / confidential)
 * - Status filter (active / revoked)
 * - Row click navigation to client detail
 * - "Create Client" button linking to /clients/new
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
import { useClients } from '../../api/clients';
import { useApplications } from '../../api/applications';
import {
  EntityDataGrid,
  type DataGridColumn,
  type SortState,
} from '../../components/EntityDataGrid';
import { StatusBadge } from '../../components/StatusBadge';
import type { Client, ClientStatus } from '../../types';

/** Items per page for the client list */
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

/** Client status filter options */
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'revoked', label: 'Revoked' },
];

/** Client type filter options (public vs confidential) */
const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'public', label: 'Public' },
  { value: 'confidential', label: 'Confidential' },
];

/**
 * Client list page with search, app/type/status filters, and create button.
 * Fetches the application list to populate the app filter dropdown and
 * to display application names in the table rows.
 */
export function ClientList() {
  const styles = useStyles();
  const navigate = useNavigate();

  // Search and filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ClientStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState('');
  const [appFilter, setAppFilter] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ column: 'name', direction: 'asc' });

  // Fetch applications for the filter dropdown and name lookups
  const { data: appsData } = useApplications({ limit: 200, sortBy: 'name', sortOrder: 'asc' });
  const applications = appsData?.data ?? [];

  // Build a map of app ID → app name for fast lookup in table cells
  const appNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const app of applications) {
      map.set(app.id, app.name);
    }
    return map;
  }, [applications]);

  // Build query params — pass filters as ListParams
  const params = {
    search: search || undefined,
    status: statusFilter || undefined,
    applicationId: appFilter || undefined,
    isConfidential: typeFilter === 'confidential' ? 'true' : typeFilter === 'public' ? 'false' : undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    sortBy: sort.column,
    sortOrder: sort.direction,
  };

  const { data, isLoading } = useClients(params);
  const clients = data?.data ?? [];
  const totalCount = data?.pagination?.total ?? 0;

  /** Column definitions for the client data grid */
  const columns: DataGridColumn<Client>[] = useMemo(
    () => [
      {
        key: 'name',
        label: 'Name',
        sortable: true,
        render: (client) => <Text weight="semibold">{client.name}</Text>,
      },
      {
        key: 'clientId',
        label: 'Client ID',
        render: (client) => (
          <Text size={200} style={{ fontFamily: 'monospace' }}>
            {client.clientId}
          </Text>
        ),
      },
      {
        key: 'application',
        label: 'Application',
        render: (client) => (
          <Text size={200}>
            {appNameMap.get(client.applicationId) ?? client.applicationId}
          </Text>
        ),
      },
      {
        key: 'type',
        label: 'Type',
        render: (client) => (
          <Text size={200}>{client.isConfidential ? 'Confidential' : 'Public'}</Text>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        sortable: true,
        render: (client) => <StatusBadge status={client.status} size="small" />,
      },
      {
        key: 'createdAt',
        label: 'Created',
        sortable: true,
        render: (client) => new Date(client.createdAt).toLocaleDateString(),
      },
    ],
    [appNameMap],
  );

  /** Navigate to client detail on row click */
  const handleRowClick = useCallback(
    (client: Client) => {
      navigate(`/clients/${client.id}`);
    },
    [navigate],
  );

  /** Handle sort changes from the data grid */
  const handleSortChange = useCallback((newSort: SortState) => {
    setSort(newSort);
    setPage(1);
  }, []);

  return (
    <div className={styles.root}>
      {/* Header with title, filters, and create button */}
      <div className={styles.header}>
        <Text size={600} weight="semibold">
          Clients
        </Text>
        <div className={styles.filters}>
          {/* Application filter */}
          <Dropdown
            placeholder="All Applications"
            value={
              appFilter
                ? applications.find((a) => a.id === appFilter)?.name ?? 'All Applications'
                : 'All Applications'
            }
            onOptionSelect={(_ev, data) => {
              setAppFilter(data.optionValue ?? '');
              setPage(1);
            }}
          >
            <Option key="" value="">
              All Applications
            </Option>
            {applications.map((app) => (
              <Option key={app.id} value={app.id}>
                {app.name}
              </Option>
            ))}
          </Dropdown>

          {/* Type filter */}
          <Dropdown
            value={TYPE_OPTIONS.find((o) => o.value === typeFilter)?.label ?? 'All Types'}
            onOptionSelect={(_ev, data) => {
              setTypeFilter(data.optionValue ?? '');
              setPage(1);
            }}
          >
            {TYPE_OPTIONS.map((opt) => (
              <Option key={opt.value} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Dropdown>

          {/* Status filter */}
          <Dropdown
            value={STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? 'All Statuses'}
            onOptionSelect={(_ev, data) => {
              setStatusFilter((data.optionValue as ClientStatus | '') ?? '');
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
            onClick={() => navigate('/clients/new')}
          >
            Create Client
          </Button>
        </div>
      </div>

      {/* Data grid */}
      <EntityDataGrid<Client>
        columns={columns}
        items={clients}
        getRowKey={(client) => client.id}
        loading={isLoading}
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search clients..."
        sort={sort}
        onSortChange={handleSortChange}
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={totalCount}
        onPageChange={setPage}
        onRowClick={handleRowClick}
        emptyMessage={
          search || statusFilter || typeFilter || appFilter
            ? 'No clients found. Try adjusting your search or filters.'
            : 'No clients yet. Create your first client to get started.'
        }
      />
    </div>
  );
}
