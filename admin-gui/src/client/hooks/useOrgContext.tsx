/**
 * Organization context provider and hook.
 * Manages the currently selected organization for filtering data across
 * the admin GUI. Persists selection to localStorage and tracks recent orgs.
 *
 * Super-admin users can select "All Organizations" (null) to see
 * cross-tenant data, or scope to a specific org.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type { Organization } from '../types';

/** Maximum number of recently selected organizations to track */
const MAX_RECENT_ORGS = 5;

/** localStorage key for persisting the selected org ID */
const STORAGE_KEY_SELECTED = 'porta-admin-selected-org';

/** localStorage key for persisting recent org IDs */
const STORAGE_KEY_RECENT = 'porta-admin-recent-orgs';

/** Shape of the organization context value */
export interface OrgContextValue {
  /** Currently selected organization (null = "All Organizations") */
  selectedOrg: Organization | null;
  /** ID of the selected org (null = all) — for quick access without the full object */
  selectedOrgId: string | null;
  /** Recently selected organizations (most recent first) */
  recentOrgs: Organization[];
  /** Select an organization (or null for "All") */
  selectOrg: (org: Organization | null) => void;
  /** Clear the selection (back to "All") */
  clearSelection: () => void;
}

const OrgContext = createContext<OrgContextValue | null>(null);

/** Props for the OrgContextProvider */
export interface OrgContextProviderProps {
  children: ReactNode;
}

/**
 * Read persisted org ID from localStorage.
 * Returns null if nothing is stored or localStorage is unavailable.
 */
function getPersistedOrgId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_SELECTED);
  } catch {
    return null;
  }
}

/**
 * Read persisted recent org IDs from localStorage.
 * Returns empty array if nothing is stored or data is invalid.
 */
function getPersistedRecentIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECENT);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')) {
      return parsed as string[];
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Persist values to localStorage. Fails silently if storage unavailable.
 */
function persistSelection(orgId: string | null, recentIds: string[]): void {
  try {
    if (orgId) {
      localStorage.setItem(STORAGE_KEY_SELECTED, orgId);
    } else {
      localStorage.removeItem(STORAGE_KEY_SELECTED);
    }
    localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(recentIds));
  } catch {
    // localStorage unavailable — graceful degradation
  }
}

/**
 * Provider component that wraps the application with org context.
 * Restores selection from localStorage on mount.
 */
export function OrgContextProvider({ children }: OrgContextProviderProps) {
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [recentOrgs, setRecentOrgs] = useState<Organization[]>([]);

  // Track persisted IDs separately so we can match orgs when they arrive
  const [persistedOrgId] = useState<string | null>(getPersistedOrgId);
  const [persistedRecentIds] = useState<string[]>(getPersistedRecentIds);

  // Expose persisted ID for consumers that need to restore selection
  // after fetching the org list (e.g., OrgSelector)
  const selectedOrgId = selectedOrg?.id ?? persistedOrgId;

  /** Select an organization and update recents */
  const selectOrg = useCallback(
    (org: Organization | null) => {
      setSelectedOrg(org);

      if (org) {
        setRecentOrgs((prev) => {
          // Remove if already in recents, then prepend
          const filtered = prev.filter((r) => r.id !== org.id);
          const updated = [org, ...filtered].slice(0, MAX_RECENT_ORGS);
          persistSelection(
            org.id,
            updated.map((o) => o.id),
          );
          return updated;
        });
      } else {
        persistSelection(null, recentOrgs.map((o) => o.id));
      }
    },
    [recentOrgs],
  );

  /** Clear selection back to "All Organizations" */
  const clearSelection = useCallback(() => {
    setSelectedOrg(null);
    persistSelection(null, recentOrgs.map((o) => o.id));
  }, [recentOrgs]);

  // Expose persisted recent IDs for initial hydration by OrgSelector
  // This is a minor "leak" to support lazy loading of org objects
  useEffect(() => {
    // On mount, if there were persisted IDs but no org objects yet,
    // store the IDs so OrgSelector can hydrate them after fetching
    if (persistedRecentIds.length > 0 && recentOrgs.length === 0) {
      // Will be hydrated by OrgSelector when org list loads
    }
  }, [persistedRecentIds, recentOrgs]);

  const value: OrgContextValue = {
    selectedOrg,
    selectedOrgId,
    recentOrgs,
    selectOrg,
    clearSelection,
  };

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

/**
 * Hook to access the organization context.
 * Must be used within an OrgContextProvider.
 *
 * @returns The current org context value
 * @throws Error if used outside OrgContextProvider
 */
export function useOrgContext(): OrgContextValue {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error('useOrgContext must be used within an OrgContextProvider');
  }
  return context;
}
