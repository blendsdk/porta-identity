/**
 * Stats card component.
 * Displays a single statistic with title, value, and optional trend indicator.
 * Used on the Dashboard page for aggregate metrics.
 */

import { makeStyles, tokens, Text } from '@fluentui/react-components';
import { ArrowUpRegular, ArrowDownRegular } from '@fluentui/react-icons';
import type { ReactNode } from 'react';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalL,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    minWidth: '180px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: {
    fontSize: '28px',
    fontWeight: tokens.fontWeightBold,
    lineHeight: '1',
  },
  trend: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    fontSize: tokens.fontSizeBase200,
  },
  trendUp: {
    color: tokens.colorPaletteGreenForeground1,
  },
  trendDown: {
    color: tokens.colorPaletteRedForeground1,
  },
});

/** Props for the StatsCard component */
export interface StatsCardProps {
  /** Card title (e.g., "Total Organizations") */
  title: string;
  /** Stat value (e.g., "142") */
  value: string | number;
  /** Optional icon displayed next to the title */
  icon?: ReactNode;
  /** Optional trend percentage (positive = up, negative = down) */
  trend?: number;
  /** Trend label (e.g., "vs last month") */
  trendLabel?: string;
}

/**
 * Dashboard statistic card with value and optional trend.
 */
export function StatsCard({ title, value, icon, trend, trendLabel }: StatsCardProps) {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Text size={200} weight="semibold">
          {title}
        </Text>
        {icon && <span>{icon}</span>}
      </div>
      <Text className={styles.value}>{value}</Text>
      {trend !== undefined && (
        <span className={`${styles.trend} ${trend >= 0 ? styles.trendUp : styles.trendDown}`}>
          {trend >= 0 ? <ArrowUpRegular /> : <ArrowDownRegular />}
          <Text size={200}>
            {Math.abs(trend)}%{trendLabel ? ` ${trendLabel}` : ''}
          </Text>
        </span>
      )}
    </div>
  );
}
