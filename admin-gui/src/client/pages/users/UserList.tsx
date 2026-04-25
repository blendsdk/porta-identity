/**
 * User list page.
 * Displays a paginated, searchable, filterable list of users
 * using the EntityDataGrid component. Users are scoped to an
 * organization — an org must be selected before users are displayed.
 *
 * Supports:
 * - Organization selector (required — users are org-scoped)
 * - Text search by name/email
 * - Status filter dropdown (active, inactive, suspended, locked)
 * - Row click navigation to user detail
 * - "Create User" and "Invite User" action buttons
 */

import { useState, useCallback, useMemo } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Dropdown,
  Option,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { AddRegular, MailRegular } from '@fluentui/react-icons';
import { useNavigate } from 'react-router';
import { useUsers } from '../../api/users';
import { useOrganizations } from '../../api/organizations';
import {
  EntityDataGrid,
  type DataGridColumn,
  type SortState,
} from '../../components/EntityDataGrid';
import { StatusBadge } from '../../components/StatusBadge';
import type { User, UserStatus, Organization, ListParams } from '../../types';

/** Items per page for the user list */
const PAGE_SIZE = 20;

/** Maximum orgs to load in the filter dropdown */
const MAX_ORGS = 100;

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingVerticalL,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
  },
  title: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
  },
  filters: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    alignItems: 'end',
  },
  filterField: {
    minWidth: '200px',
  },
  orgPrompt: {
    maxWidth: '600px',
  },
});

/** User status options for the filter dropdown */
const STATUS_OPTIONS: { value: UserStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'locked', label: 'Locked' },
];

/**
 * Build a display name from the User's given/family name fields.
 * Falls back to email prefix if no name fields are set.
 */
function formatUserName(user: User): string {
  const parts = [user.givenName, user.familyName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '—';
}

/**
 * User list page component.
 * Requires an organization to be selected before displaying users,
 * because the admin API scopes users to an organization.
 */
export function UserList() {
  const navigate = useNavigate();
  const styles = useStyles();

  // --- Filter state ---
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({
    column: 'createdAt',
    direction: 'desc',
  });

  // --- Data fetching ---
  const { data: orgsData } = useOrganizations({ limit: MAX_ORGS });
  const organizations = useMemo(
    () => orgsData?.data ?? [],
    [orgsData],
  );

  /** Build query params for the users API call */
  const params = useMemo((): ListParams => {
    const p: ListParams = {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    };
    if (search) p.search = search;
    if (statusFilter) p.status = statusFilter;
    if (sort.column) {
      p.sortBy = sort.column;
      p.sortOrder = sort.direction;
    }
    return p;
  }, [page, search, statusFilter, sort]);

  /** Users query — disabled when no org is selected */
  const { data, isLoading } = useUsers(selectedOrgId, params);
  const users = useMemo(() => data?.data ?? [], [data]);
  const totalCount = data?.pagination?.total ?? 0;

  // --- Event handlers ---

  /** Navigate to user detail on row click */
  const handleRowClick = useCallback(
    (user: User) => navigate(`/users/${user.id}`),
    [navigate],
  );

  /** Update selected organization and reset pagination */
  const handleOrgChange = useCallback(
    (_e: unknown, d: { optionValue?: string }) => {
      setSelectedOrgId(d.optionValue ?? '');
      setPage(1);
    },
    [],
  );

  /** Update status filter and reset pagination */
  const handleStatusChange = useCallback(
    (_e: unknown, d: { optionValue?: string }) => {
      setStatusFilter((d.optionValue as UserStatus | '') ?? '');
      setPage(1);
    },
    [],
  );

  /** Update search query and reset pagination */
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  /** Update sort state and reset pagination */
  const handleSortChange = useCallback((newSort: SortState) => {
    setSort(newSort);
    setPage(1);
  }, []);

  /** Extract unique row key from a user */
  const getRowKey = useCallback((user: User) => user.id, []);

  // --- Column definitions ---
  const columns: DataGridColumn<User>[] = useMemo(
    () => [
      {
        key: 'name',
        label: 'Name',
        sortable: true,
        render: (user: User) => (
          <Text weight="semibold">{formatUserName(user)}</Text>
        ),
      },
      {
        key: 'email',
        label: 'Email',
        sortable: true,
        render: (user: User) => <Text>{user.email}</Text>,
      },
      {
        key: 'status',
        label: 'Status',
        sortable: true,
        width: '120px',
        render: (user: User) => <StatusBadge status={user.status} />,
      },
      {
        key: 'lastLoginAt',
        label: 'Last Login',
        sortable: true,
        width: '160px',
        render: (user: User) =>
          user.lastLoginAt
            ? new Date(user.lastLoginAt).toLocaleDateString()
            : '—',
      },
      {
        key: 'createdAt',
        label: 'Created',
        sortable: true,
        width: '140px',
        render: (user: User) => new Date(user.createdAt).toLocaleDateString(),
      },
    ],
    [],
  );

  /** Display label for the currently selected organization */
  const selectedOrgLabel = useMemo(() => {
    const org = organizations.find((o: Organization) => o.id === selectedOrgId);
    return org?.name;
  }, [organizations, selectedOrgId]);

  return (
    <div className={styles.root}>
      {/* Header with title and action buttons */}
      <div className={styles.header}>
        <Text className={styles.title}>Users</Text>
        <div className={styles.actions}>
          <Button
            appearance="primary"
            icon={<AddRegular />}
            onClick={() => navigate('/users/new')}
            data-testid="create-user-btn"
          >
            Create User
          </Button>
          <Button
            appearance="secondary"
            icon={<MailRegular />}
            onClick={() => navigate('/users/invite')}
            data-testid="invite-user-btn"
          >
            Invite User
          </Button>
        </div>
      </div>

      {/* Filter controls: org selector + status filter */}
      <div className={styles.filters}>
        <div className={styles.filterField}>
          <Dropdown
            placeholder="Select organization…"
            value={selectedOrgLabel ?? ''}
            onOptionSelect={handleOrgChange}
            data-testid="org-filter"
          >
            {organizations.map((org: Organization) => (
              <Option key={org.id} value={org.id}>
                {org.name}
              </Option>
            ))}
          </Dropdown>
        </div>
        <div className={styles.filterField}>
          <Dropdown
            placeholder="All statuses"
            value={
              STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? ''
            }
            onOptionSelect={handleStatusChange}
            data-testid="status-filter"
          >
            {STATUS_OPTIONS.map((opt) => (
              <Option key={opt.value} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Dropdown>
        </div>
      </div>

      {/* Prompt to select org, or the user data grid */}
      {!selectedOrgId ? (
        <MessageBar className={styles.orgPrompt} data-testid="org-prompt">
          <MessageBarBody>
            Select an organization above to view its users.
          </MessageBarBody>
        </MessageBar>
      ) : (
        <EntityDataGrid<User>
          columns={columns}
          items={users}
          getRowKey={getRowKey}
          loading={isLoading}
          sort={sort}
          onSortChange={handleSortChange}
          searchQuery={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Search by name or email…"
          onRowClick={handleRowClick}
          page={page}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
          onPageChange={setPage}
          emptyMessage="No users found in this organization."
        />
      )}
    </div>
  );
}
