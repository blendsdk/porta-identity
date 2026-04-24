/**
 * Entity data grid component.
 * Generic table for listing entities with pagination, search, sorting,
 * and optional bulk selection. Uses FluentUI v9 Table components.
 */

import { useState, useCallback, useMemo, type ReactNode } from 'react';
import {
  makeStyles,
  tokens,
  Input,
  Button,
  Checkbox,
  Text,
  Spinner,
  mergeClasses,
} from '@fluentui/react-components';
import {
  SearchRegular,
  ArrowSortUpRegular,
  ArrowSortDownRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
} from '@fluentui/react-icons';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flex: 1,
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  searchInput: {
    maxWidth: '300px',
  },
  tableWrapper: {
    overflowX: 'auto',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  thead: {
    backgroundColor: tokens.colorNeutralBackground3,
  },
  th: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    textAlign: 'left',
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    whiteSpace: 'nowrap',
    userSelect: 'none',
  },
  thSortable: {
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground3Hover,
    },
  },
  thContent: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  td: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  tr: {
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  trSelected: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: tokens.spacingVerticalS,
  },
  paginationInfo: {
    color: tokens.colorNeutralForeground3,
  },
  paginationButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
    color: tokens.colorNeutralForeground3,
  },
});

/** Column definition for the data grid */
export interface DataGridColumn<T> {
  /** Unique column key */
  key: string;
  /** Column header label */
  label: string;
  /** Render function for the cell content */
  render: (item: T) => ReactNode;
  /** Whether this column is sortable (default: false) */
  sortable?: boolean;
  /** Column width (CSS value, e.g., "200px", "auto") */
  width?: string;
}

/** Sort direction */
export type SortDirection = 'asc' | 'desc';

/** Sort state */
export interface SortState {
  column: string;
  direction: SortDirection;
}

/** Props for the EntityDataGrid component */
export interface EntityDataGridProps<T> {
  /** Column definitions */
  columns: DataGridColumn<T>[];
  /** Data items to display */
  items: T[];
  /** Function to extract a unique key from each item */
  getRowKey: (item: T) => string;
  /** Whether data is currently loading */
  loading?: boolean;
  /** Current search query */
  searchQuery?: string;
  /** Callback when search query changes */
  onSearchChange?: (query: string) => void;
  /** Search input placeholder */
  searchPlaceholder?: string;
  /** Current sort state */
  sort?: SortState;
  /** Callback when sort changes */
  onSortChange?: (sort: SortState) => void;
  /** Enable bulk selection (default: false) */
  selectable?: boolean;
  /** Currently selected row keys */
  selectedKeys?: Set<string>;
  /** Callback when selection changes */
  onSelectionChange?: (keys: Set<string>) => void;
  /** Total number of items (for pagination info) */
  totalCount?: number;
  /** Current page number (1-based) */
  page?: number;
  /** Items per page */
  pageSize?: number;
  /** Callback when page changes */
  onPageChange?: (page: number) => void;
  /** Extra toolbar content (rendered on the right) */
  toolbarActions?: ReactNode;
  /** Message when no items found */
  emptyMessage?: string;
  /** Callback when a row is clicked */
  onRowClick?: (item: T) => void;
}

/**
 * Generic entity data grid with search, sort, pagination, and bulk selection.
 * Used for all entity list pages (organizations, users, clients, etc.).
 */
export function EntityDataGrid<T>({
  columns,
  items,
  getRowKey,
  loading = false,
  searchQuery = '',
  onSearchChange,
  searchPlaceholder = 'Search...',
  sort,
  onSortChange,
  selectable = false,
  selectedKeys = new Set(),
  onSelectionChange,
  totalCount,
  page = 1,
  pageSize = 20,
  onPageChange,
  toolbarActions,
  emptyMessage = 'No items found',
  onRowClick,
}: EntityDataGridProps<T>) {
  const styles = useStyles();
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const effectiveTotal = totalCount ?? items.length;
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));

  /** Handle search input change */
  const handleSearchChange = useCallback(
    (_e: unknown, data: { value: string }) => {
      setLocalSearch(data.value);
      onSearchChange?.(data.value);
    },
    [onSearchChange],
  );

  /** Handle column header click for sorting */
  const handleSort = useCallback(
    (column: string) => {
      if (!onSortChange) return;
      if (sort?.column === column) {
        onSortChange({
          column,
          direction: sort.direction === 'asc' ? 'desc' : 'asc',
        });
      } else {
        onSortChange({ column, direction: 'asc' });
      }
    },
    [sort, onSortChange],
  );

  /** Toggle select all */
  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;
    if (selectedKeys.size === items.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(items.map(getRowKey)));
    }
  }, [items, selectedKeys, onSelectionChange, getRowKey]);

  /** Toggle individual row selection */
  const handleSelectRow = useCallback(
    (key: string) => {
      if (!onSelectionChange) return;
      const next = new Set(selectedKeys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      onSelectionChange(next);
    },
    [selectedKeys, onSelectionChange],
  );

  /** All items selected? */
  const allSelected = useMemo(
    () => items.length > 0 && selectedKeys.size === items.length,
    [items.length, selectedKeys.size],
  );

  return (
    <div className={styles.root}>
      {/* Toolbar: search + actions */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {onSearchChange && (
            <Input
              className={styles.searchInput}
              contentBefore={<SearchRegular />}
              placeholder={searchPlaceholder}
              value={localSearch}
              onChange={handleSearchChange}
            />
          )}
          {selectable && selectedKeys.size > 0 && (
            <Text size={200}>
              {selectedKeys.size} selected
            </Text>
          )}
        </div>
        <div className={styles.toolbarRight}>
          {toolbarActions}
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead className={styles.thead}>
            <tr>
              {selectable && (
                <th className={styles.th} style={{ width: '40px' }}>
                  <Checkbox
                    checked={allSelected ? true : selectedKeys.size > 0 ? 'mixed' : false}
                    onChange={handleSelectAll}
                    aria-label="Select all"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={mergeClasses(
                    styles.th,
                    col.sortable && styles.thSortable,
                  )}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className={styles.thContent}>
                    {col.label}
                    {col.sortable && sort?.column === col.key && (
                      sort.direction === 'asc'
                        ? <ArrowSortUpRegular />
                        : <ArrowSortDownRegular />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className={styles.loading}
                >
                  <Spinner size="small" label="Loading..." />
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className={styles.empty}
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
            {!loading &&
              items.map((item) => {
                const key = getRowKey(item);
                const selected = selectedKeys.has(key);
                return (
                  <tr
                    key={key}
                    className={mergeClasses(
                      styles.tr,
                      selected && styles.trSelected,
                    )}
                    onClick={onRowClick ? () => onRowClick(item) : undefined}
                    style={onRowClick ? { cursor: 'pointer' } : undefined}
                  >
                    {selectable && (
                      <td className={styles.td}>
                        <Checkbox
                          checked={selected}
                          onChange={() => handleSelectRow(key)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select row ${key}`}
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.key} className={styles.td}>
                        {col.render(item)}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {onPageChange && (
        <div className={styles.pagination}>
          <Text size={200} className={styles.paginationInfo}>
            Showing {Math.min((page - 1) * pageSize + 1, effectiveTotal)}–
            {Math.min(page * pageSize, effectiveTotal)} of {effectiveTotal}
          </Text>
          <div className={styles.paginationButtons}>
            <Button
              appearance="subtle"
              icon={<ChevronLeftRegular />}
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              aria-label="Previous page"
            />
            <Text size={200}>
              Page {page} of {totalPages}
            </Text>
            <Button
              appearance="subtle"
              icon={<ChevronRightRegular />}
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              aria-label="Next page"
            />
          </div>
        </div>
      )}
    </div>
  );
}
