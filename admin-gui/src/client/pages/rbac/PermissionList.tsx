/**
 * Permission list page.
 * Displays a paginated, searchable list of permissions scoped to an application.
 * Requires selecting an application first via the app filter dropdown.
 * Supports:
 * - Application filter dropdown (required to view permissions)
 * - Text search by name/slug
 * - Row click navigation to permission detail
 * - "Create Permission" button linking to /permissions/new
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
import { AddRegular } from '@fluentui/react-icons';
import { useNavigate } from 'react-router';
import { useApplications } from '../../api/applications';
import { usePermissions } from '../../api/permissions';
import {
  EntityDataGrid,
  type DataGridColumn,
  type SortState,
} from '../../components/EntityDataGrid';
import type { Permission } from '../../types';

/** Items per page for the permission list */
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

/**
 * Permission list page with application filter, search, and create button.
 * Permissions are scoped to an application — the user must select an app first.
 */
export function PermissionList() {
  const styles = useStyles();
  const navigate = useNavigate();

  // State
  const [selectedAppId, setSelectedAppId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({
    column: 'name',
    direction: 'asc',
  });

  // Fetch applications for the filter dropdown
  const { data: appsData } = useApplications({
    limit: 100,
    sortBy: 'name',
    sortOrder: 'asc',
  });
  const applications = appsData?.data ?? [];

  // Build a name map for display
  const appNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const app of applications) {
      map.set(app.id, app.name);
    }
    return map;
  }, [applications]);

  // Auto-select first app if none selected
  if (!selectedAppId && applications.length > 0) {
    setSelectedAppId(applications[0].id);
  }

  // Build query params
  const params = {
    search: search || undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    sortBy: sort.column,
    sortOrder: sort.direction,
  };

  const { data, isLoading } = usePermissions(selectedAppId, params);
  const permissions = data?.data ?? [];
  const totalCount = data?.pagination?.total ?? 0;

  /** Column definitions */
  const columns: DataGridColumn<Permission>[] = useMemo(
    () => [
      {
        key: 'name',
        label: 'Name',
        sortable: true,
        render: (perm) => <Text weight="semibold">{perm.name}</Text>,
      },
      {
        key: 'slug',
        label: 'Slug',
        sortable: true,
        render: (perm) => (
          <Text size={200} style={{ fontFamily: 'monospace' }}>
            {perm.slug}
          </Text>
        ),
      },
      {
        key: 'description',
        label: 'Description',
        render: (perm) => (
          <Text size={200}>{perm.description ?? '—'}</Text>
        ),
      },
      {
        key: 'createdAt',
        label: 'Created',
        sortable: true,
        render: (perm) => new Date(perm.createdAt).toLocaleDateString(),
      },
    ],
    [],
  );

  /** Navigate to permission detail on row click */
  const handleRowClick = useCallback(
    (perm: Permission) => {
      navigate(`/permissions/${perm.id}`, {
        state: {
          appId: selectedAppId,
          appName: appNameMap.get(selectedAppId),
        },
      });
    },
    [navigate, selectedAppId, appNameMap],
  );

  /** Handle sort changes */
  const handleSortChange = useCallback((newSort: SortState) => {
    setSort(newSort);
    setPage(1);
  }, []);

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <Text size={600} weight="semibold">
          Permissions
        </Text>
        <div className={styles.filters}>
          {/* Application filter */}
          <Dropdown
            placeholder="Select Application"
            value={
              selectedAppId
                ? appNameMap.get(selectedAppId) ?? 'Select Application'
                : 'Select Application'
            }
            onOptionSelect={(_ev, data) => {
              setSelectedAppId(data.optionValue ?? '');
              setPage(1);
              setSearch('');
            }}
          >
            {applications.map((app) => (
              <Option key={app.id} value={app.id}>
                {app.name}
              </Option>
            ))}
          </Dropdown>

          {/* Create button */}
          <Button
            appearance="primary"
            icon={<AddRegular />}
            disabled={!selectedAppId}
            onClick={() =>
              navigate('/permissions/new', {
                state: { appId: selectedAppId },
              })
            }
          >
            Create Permission
          </Button>
        </div>
      </div>

      {/* Info message when no app selected */}
      {!selectedAppId && applications.length > 0 && (
        <MessageBar intent="info">
          <MessageBarBody>
            Select an application to view its permissions.
          </MessageBarBody>
        </MessageBar>
      )}

      {/* Data grid — only shown when an app is selected */}
      {selectedAppId && (
        <EntityDataGrid<Permission>
          columns={columns}
          items={permissions}
          getRowKey={(perm) => perm.id}
          loading={isLoading}
          searchQuery={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search permissions..."
          sort={sort}
          onSortChange={handleSortChange}
          page={page}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
          onPageChange={setPage}
          onRowClick={handleRowClick}
          emptyMessage={
            search
              ? 'No permissions found. Try adjusting your search.'
              : 'No permissions yet. Create your first permission to define access controls.'
          }
        />
      )}
    </div>
  );
}
