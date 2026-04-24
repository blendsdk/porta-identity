/**
 * Frontend-specific types for the admin GUI React SPA.
 * Re-exports shared types and adds client-only types.
 */

// Re-export shared types used by the client
export type {
  AdminUser,
  SessionInfo,
  EnvironmentInfo,
  HealthStatus,
} from '../../shared/types';

/** Paginated API response from the BFF proxy */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/** Generic API error response body */
export interface ApiErrorResponse {
  error: string;
  message?: string;
  details?: unknown;
}

/** Navigation item for the sidebar */
export interface NavItem {
  /** Route path */
  path: string;
  /** Display label */
  label: string;
  /** FluentUI icon name */
  icon: string;
  /** Whether this item requires specific roles */
  requiredRoles?: string[];
}
