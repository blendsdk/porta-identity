/**
 * Search results page.
 *
 * Full-page search results view navigated to from SearchOverlay
 * "View all results" link. Displays results grouped by entity type
 * with navigation to entity detail pages.
 */

import { useMemo } from 'react';
import {
  Text,
  Button,
  makeStyles,
  tokens,
  Card,
  Badge,
} from '@fluentui/react-components';
import {
  SearchRegular,
  BuildingRegular,
  AppsRegular,
  KeyRegular,
  PeopleRegular,
} from '@fluentui/react-icons';
import { useSearchParams, useNavigate } from 'react-router';
import { useAuditLog } from '../../api/audit';
import { EmptyState } from '../../components/EmptyState';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  group: {
    padding: tokens.spacingHorizontalL,
  },
  groupTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalS,
  },
  resultItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacingVerticalS} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
    '&:last-child': {
      borderBottom: 'none',
    },
  },
});

/** Map entity type to icon */
const ENTITY_ICONS: Record<string, React.ReactNode> = {
  organization: <BuildingRegular />,
  application: <AppsRegular />,
  client: <KeyRegular />,
  user: <PeopleRegular />,
};

/** Map entity type to navigation path prefix */
const ENTITY_PATHS: Record<string, string> = {
  organization: '/organizations',
  application: '/applications',
  client: '/clients',
  user: '/users',
};

/**
 * Full search results page.
 * Reads the query from URL search params (?q=...).
 */
export function SearchResults() {
  const styles = useStyles();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get('q') ?? '';

  // For now, use audit log as a proxy search (real search API in future)
  const { data, isLoading } = useAuditLog(
    query ? { actorEmail: query, limit: '50' } : undefined,
  );
  const entries = (data as any)?.data ?? [];

  // Group results by target type
  const grouped = useMemo(() => {
    const groups: Record<string, typeof entries> = {};
    for (const entry of entries) {
      const type = entry.targetType ?? 'other';
      if (!groups[type]) groups[type] = [];
      groups[type].push(entry);
    }
    return groups;
  }, [entries]);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <SearchRegular style={{ fontSize: 24 }} />
        <Text as="h1" size={800} weight="bold">
          Search Results
        </Text>
        {query && (
          <Badge appearance="outline" size="medium">
            &ldquo;{query}&rdquo;
          </Badge>
        )}
      </div>

      {!query ? (
        <EmptyState
          title="No search query"
          description="Use Cmd+K or the search bar to search."
          icon={<SearchRegular />}
        />
      ) : isLoading ? (
        <LoadingSkeleton variant="table" rows={8} />
      ) : entries.length === 0 ? (
        <EmptyState
          title="No results found"
          description={`No results matching "${query}".`}
          icon={<SearchRegular />}
        />
      ) : (
        Object.entries(grouped).map(([type, items]) => (
          <Card key={type} className={styles.group}>
            <div className={styles.groupTitle}>
              {ENTITY_ICONS[type] ?? <SearchRegular />}
              <Text size={400} weight="semibold">
                {type.charAt(0).toUpperCase() + type.slice(1)}s
              </Text>
              <Badge appearance="tint" size="small">
                {(items as unknown[]).length}
              </Badge>
            </div>
            {(items as any[]).map((item: any) => (
              <div
                key={item.id}
                className={styles.resultItem}
                onClick={() => {
                  const path = ENTITY_PATHS[type];
                  if (path && item.targetId) {
                    navigate(`${path}/${item.targetId}`);
                  }
                }}
              >
                <Text size={300}>{item.actorEmail ?? item.action}</Text>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {new Date(item.createdAt).toLocaleDateString()}
                </Text>
              </div>
            ))}
          </Card>
        ))
      )}
    </div>
  );
}
