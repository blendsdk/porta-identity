/**
 * Status badge component.
 *
 * Renders a colored FluentUI Badge indicating entity status. Maps Porta's
 * status strings to appropriate badge colors:
 *
 * | Status      | Color         | Meaning                     |
 * |-------------|---------------|-----------------------------|
 * | `active`    | `success`     | Entity is live and usable   |
 * | `suspended` | `warning`     | Temporarily disabled        |
 * | `archived`  | `informative` | Soft-deleted / read-only    |
 * | `invited`   | `brand`       | User invitation sent        |
 * | `pending`   | `warning`     | Awaiting action             |
 * | `locked`    | `danger`      | Locked due to security      |
 * | `disabled`  | `informative` | Manually disabled           |
 * | `revoked`   | `danger`      | Access revoked              |
 * | `expired`   | `informative` | Time-limited, now expired   |
 *
 * Unknown status values fall back to `"informative"` color and display the
 * raw status string as the label.
 *
 * **When to use:** Anywhere an entity status needs visual representation —
 * table rows, detail page headers, list items.
 *
 * **Provider requirement:** Must be rendered inside a `FluentProvider`.
 *
 * @example
 * ```tsx
 * import { StatusBadge } from '../components/StatusBadge';
 *
 * // In a table cell
 * <StatusBadge status={org.status} />
 *
 * // With custom size
 * <StatusBadge status="suspended" size="small" />
 * ```
 *
 * @module StatusBadge
 */

import { Badge } from '@fluentui/react-components';
import type { BadgeProps } from '@fluentui/react-components';

/** Supported status values across all Porta entities */
export type EntityStatus =
  | 'active'
  | 'suspended'
  | 'archived'
  | 'invited'
  | 'pending'
  | 'locked'
  | 'disabled'
  | 'revoked'
  | 'expired';

/** Map status values to FluentUI badge colors */
const STATUS_COLOR_MAP: Record<EntityStatus, BadgeProps['color']> = {
  active: 'success',
  suspended: 'warning',
  archived: 'informative',
  invited: 'brand',
  pending: 'warning',
  locked: 'danger',
  disabled: 'informative',
  revoked: 'danger',
  expired: 'informative',
};

/** Map status values to display labels */
const STATUS_LABEL_MAP: Record<EntityStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  archived: 'Archived',
  invited: 'Invited',
  pending: 'Pending',
  locked: 'Locked',
  disabled: 'Disabled',
  revoked: 'Revoked',
  expired: 'Expired',
};

/** Props for the StatusBadge component */
export interface StatusBadgeProps {
  /** The status value to display */
  status: EntityStatus | string;
  /** Optional size (default: "medium") */
  size?: BadgeProps['size'];
}

/**
 * Colored badge for entity status display.
 * Falls back to "informative" color for unknown status values.
 */
export function StatusBadge({ status, size = 'medium' }: StatusBadgeProps) {
  const normalizedStatus = (status ?? 'pending').toLowerCase() as EntityStatus;
  const color = STATUS_COLOR_MAP[normalizedStatus] ?? 'informative';
  const label = STATUS_LABEL_MAP[normalizedStatus] ?? status ?? 'Unknown';

  return (
    <Badge appearance="filled" color={color} size={size}>
      {label}
    </Badge>
  );
}
