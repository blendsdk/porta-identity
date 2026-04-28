/**
 * Loading skeleton component.
 *
 * Renders animated placeholder shapes while content is loading. Provides three
 * layout variants that visually approximate the content they replace:
 *
 * | Variant    | Use case                                           |
 * |------------|----------------------------------------------------|
 * | `"table"`  | Data grids and list views (default)                 |
 * | `"card"`   | Card-based layouts (e.g. dashboard widgets)         |
 * | `"detail"` | Detail/show pages with header + sections            |
 *
 * The `rows` prop controls how many skeleton rows/cards are rendered
 * (ignored for the `"detail"` variant which has a fixed structure).
 *
 * **When to use:** As the loading state for any async data-driven view.
 * Prefer skeletons over spinners when the layout of the final content is
 * predictable — they reduce perceived loading time.
 *
 * **Provider requirement:** Must be rendered inside a `FluentProvider`.
 *
 * @example
 * ```tsx
 * import { LoadingSkeleton } from '../components/LoadingSkeleton';
 *
 * function OrganizationList() {
 *   const { data, loading } = useOrganizations();
 *
 *   if (loading) return <LoadingSkeleton variant="table" rows={8} />;
 *   return <OrgTable data={data} />;
 * }
 *
 * function OrgDetailPage() {
 *   const { data, loading } = useOrganization(id);
 *
 *   if (loading) return <LoadingSkeleton variant="detail" />;
 *   return <OrgDetail org={data} />;
 * }
 * ```
 *
 * @module LoadingSkeleton
 */

import {
  makeStyles,
  tokens,
  SkeletonItem,
  Skeleton,
} from '@fluentui/react-components';

const useStyles = makeStyles({
  table: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  tableRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalL,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  cardRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
  },
  detail: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  detailHeader: {
    display: 'flex',
    gap: tokens.spacingHorizontalL,
    alignItems: 'center',
  },
  detailSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
});

/** Supported skeleton variants */
export type SkeletonVariant = 'table' | 'card' | 'detail';

/** Props for the LoadingSkeleton component */
export interface LoadingSkeletonProps {
  /** Skeleton variant (default: "table") */
  variant?: SkeletonVariant;
  /** Number of rows/items to render (default: 5) */
  rows?: number;
}

/** Table skeleton — rows of lines mimicking a data grid */
function TableSkeleton({ rows }: { rows: number }) {
  const styles = useStyles();

  return (
    <Skeleton className={styles.table} aria-label="Loading table...">
      {/* Header row */}
      <div className={styles.tableRow}>
        <SkeletonItem size={16} style={{ width: '120px' }} />
        <SkeletonItem size={16} style={{ width: '200px' }} />
        <SkeletonItem size={16} style={{ width: '100px' }} />
        <SkeletonItem size={16} style={{ width: '80px' }} />
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.tableRow}>
          <SkeletonItem size={16} style={{ width: '120px' }} />
          <SkeletonItem size={16} style={{ width: '200px' }} />
          <SkeletonItem size={16} style={{ width: '100px' }} />
          <SkeletonItem size={16} style={{ width: '80px' }} />
        </div>
      ))}
    </Skeleton>
  );
}

/** Card skeleton — rectangular block with lines */
function CardSkeleton({ rows }: { rows: number }) {
  const styles = useStyles();

  return (
    <div style={{ display: 'flex', gap: tokens.spacingHorizontalM, flexWrap: 'wrap' }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={styles.card} style={{ width: '280px' }} aria-label="Loading card...">
          <div className={styles.cardRow}>
            <SkeletonItem shape="circle" size={32} />
            <SkeletonItem size={16} style={{ width: '120px' }} />
          </div>
          <SkeletonItem size={12} style={{ width: '200px' }} />
          <SkeletonItem size={12} style={{ width: '160px' }} />
        </Skeleton>
      ))}
    </div>
  );
}

/** Detail skeleton — mimics a detail page with header and sections */
function DetailSkeleton() {
  const styles = useStyles();

  return (
    <Skeleton className={styles.detail} aria-label="Loading details...">
      {/* Header */}
      <div className={styles.detailHeader}>
        <SkeletonItem shape="circle" size={48} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS }}>
          <SkeletonItem size={24} style={{ width: '200px' }} />
          <SkeletonItem size={12} style={{ width: '150px' }} />
        </div>
      </div>
      {/* Section 1 */}
      <div className={styles.detailSection}>
        <SkeletonItem size={16} style={{ width: '120px' }} />
        <SkeletonItem size={12} style={{ width: '300px' }} />
        <SkeletonItem size={12} style={{ width: '250px' }} />
        <SkeletonItem size={12} style={{ width: '280px' }} />
      </div>
      {/* Section 2 */}
      <div className={styles.detailSection}>
        <SkeletonItem size={16} style={{ width: '100px' }} />
        <SkeletonItem size={12} style={{ width: '260px' }} />
        <SkeletonItem size={12} style={{ width: '220px' }} />
      </div>
    </Skeleton>
  );
}

/**
 * Animated loading skeleton placeholder.
 * Choose a variant to match the content that will replace it.
 */
export function LoadingSkeleton({ variant = 'table', rows = 5 }: LoadingSkeletonProps) {
  switch (variant) {
    case 'table':
      return <TableSkeleton rows={rows} />;
    case 'card':
      return <CardSkeleton rows={rows} />;
    case 'detail':
      return <DetailSkeleton />;
    default:
      return <TableSkeleton rows={rows} />;
  }
}
