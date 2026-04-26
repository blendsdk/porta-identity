/**
 * Permission Matrix page.
 * Visual grid showing roles × permissions for an application.
 * Each cell is a checkbox toggling whether a role has a permission.
 * Supports:
 * - Application selector dropdown
 * - Matrix grid with roles as rows and permissions as columns
 * - Click-to-toggle assignment with save/reset controls
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Dropdown,
  Option,
  Checkbox,
  Spinner,
  MessageBar,
  MessageBarBody,
  Badge,
} from '@fluentui/react-components';
import { SaveRegular, DismissRegular } from '@fluentui/react-icons';
import { useApplications } from '../../api/applications';
import { useRoles, useRolePermissions, useSetRolePermissions } from '../../api/roles';
import { usePermissions } from '../../api/permissions';
import type { Role, Permission } from '../../types';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
  matrixContainer: {
    overflowX: 'auto',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    textAlign: 'left',
    position: 'sticky' as const,
    top: 0,
    whiteSpace: 'nowrap',
  },
  thRotated: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    textAlign: 'center',
    verticalAlign: 'bottom',
    minWidth: '48px',
  },
  td: {
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  tdCenter: {
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    textAlign: 'center',
  },
  roleCell: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
  },
  legend: {
    display: 'flex',
    gap: tokens.spacingHorizontalL,
    alignItems: 'center',
    padding: `${tokens.spacingVerticalS} 0`,
  },
});

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Map of roleId → Set of permissionIds */
type MatrixState = Map<string, Set<string>>;

// ---------------------------------------------------------------------------
// Hook: fetch all role–permission data for an app
// ---------------------------------------------------------------------------

function useMatrixData(appId: string) {
  // Fetch all roles
  const { data: rolesData, isLoading: rolesLoading } = useRoles(appId, {
    limit: 100,
  });
  const roles: Role[] = rolesData?.data ?? [];

  // Fetch all permissions
  const { data: permsData, isLoading: permsLoading } = usePermissions(appId, {
    limit: 100,
  });
  const permissions: Permission[] = permsData?.data ?? [];

  return {
    roles,
    permissions,
    isLoading: rolesLoading || permsLoading,
  };
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * Permission Matrix page.
 * Shows a grid of roles × permissions with toggle checkboxes.
 */
export function PermissionMatrix() {
  const styles = useStyles();

  // State
  const [selectedAppId, setSelectedAppId] = useState('');
  const [matrix, setMatrix] = useState<MatrixState>(new Map());
  const [originalMatrix, setOriginalMatrix] = useState<MatrixState>(new Map());
  const [isDirty, setIsDirty] = useState(false);
  const [loadingRolePerms, setLoadingRolePerms] = useState(false);
  const [savingRole, setSavingRole] = useState<string | null>(null);

  // Fetch applications
  const { data: appsData } = useApplications({
    limit: 100,
    sortBy: 'name',
    sortOrder: 'asc',
  });
  const applications = appsData?.data ?? [];

  const appNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const app of applications) {
      map.set(app.id, app.name);
    }
    return map;
  }, [applications]);

  // Auto-select first app
  if (!selectedAppId && applications.length > 0) {
    setSelectedAppId(applications[0].id);
  }

  // Fetch roles and permissions for selected app
  const { roles, permissions, isLoading: matrixLoading } =
    useMatrixData(selectedAppId);

  // Fetch role permissions using individual hooks per role
  // We use a loading approach: fetch all at once when roles change
  const setRolePermissions = useSetRolePermissions();

  // Load initial permission assignments when roles change
  useEffect(() => {
    if (!selectedAppId || roles.length === 0) return;

    let cancelled = false;
    setLoadingRolePerms(true);

    async function loadPermissions() {
      const newMatrix: MatrixState = new Map();
      // Fetch permissions for each role in parallel
      const promises = roles.map(async (role) => {
        try {
          const response = await fetch(
            `/api/applications/${selectedAppId}/roles/${role.id}/permissions`,
          );
          if (response.ok) {
            const data = await response.json();
            const perms: Permission[] = Array.isArray(data)
              ? data
              : data?.data ?? [];
            return { roleId: role.id, permIds: perms.map((p) => p.id) };
          }
          return { roleId: role.id, permIds: [] };
        } catch {
          return { roleId: role.id, permIds: [] };
        }
      });

      const results = await Promise.all(promises);
      if (cancelled) return;

      for (const { roleId, permIds } of results) {
        newMatrix.set(roleId, new Set(permIds));
      }

      setMatrix(new Map(newMatrix));
      setOriginalMatrix(new Map(newMatrix));
      setLoadingRolePerms(false);
      setIsDirty(false);
    }

    loadPermissions();
    return () => {
      cancelled = true;
    };
  }, [selectedAppId, roles.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle a cell
  const handleToggle = useCallback(
    (roleId: string, permId: string, checked: boolean) => {
      setMatrix((prev) => {
        const next = new Map(prev);
        const rolePerms = new Set(next.get(roleId) ?? []);
        if (checked) {
          rolePerms.add(permId);
        } else {
          rolePerms.delete(permId);
        }
        next.set(roleId, rolePerms);
        return next;
      });
      setIsDirty(true);
    },
    [],
  );

  // Save all changes
  const handleSave = useCallback(async () => {
    // Find which roles changed
    for (const [roleId, permIds] of matrix.entries()) {
      const original = originalMatrix.get(roleId) ?? new Set();
      const currentArr = Array.from(permIds).sort();
      const originalArr = Array.from(original).sort();

      if (JSON.stringify(currentArr) !== JSON.stringify(originalArr)) {
        setSavingRole(roleId);
        try {
          await setRolePermissions.mutateAsync({
            appId: selectedAppId,
            roleId,
            permissionIds: Array.from(permIds),
          });
        } catch {
          // Error handled by React Query
        }
      }
    }
    setSavingRole(null);
    setOriginalMatrix(new Map(matrix));
    setIsDirty(false);
  }, [matrix, originalMatrix, selectedAppId, setRolePermissions]);

  // Reset to original
  const handleReset = useCallback(() => {
    setMatrix(new Map(originalMatrix));
    setIsDirty(false);
  }, [originalMatrix]);

  const loading = matrixLoading || loadingRolePerms;

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <Text size={600} weight="semibold">
          Permission Matrix
        </Text>
        <div className={styles.actions}>
          {/* Application selector */}
          <Dropdown
            placeholder="Select Application"
            value={
              selectedAppId
                ? appNameMap.get(selectedAppId) ?? 'Select Application'
                : 'Select Application'
            }
            onOptionSelect={(_ev, data) => {
              setSelectedAppId(data.optionValue ?? '');
              setIsDirty(false);
            }}
          >
            {applications.map((app) => (
              <Option key={app.id} value={app.id}>
                {app.name}
              </Option>
            ))}
          </Dropdown>

          {isDirty && (
            <>
              <Button
                appearance="primary"
                icon={<SaveRegular />}
                onClick={handleSave}
                disabled={!!savingRole}
              >
                {savingRole ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                appearance="subtle"
                icon={<DismissRegular />}
                onClick={handleReset}
              >
                Reset
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && <Spinner size="medium" label="Loading matrix..." />}

      {/* Empty states */}
      {!loading && selectedAppId && roles.length === 0 && (
        <MessageBar intent="info">
          <MessageBarBody>
            No roles defined for this application. Create roles first.
          </MessageBarBody>
        </MessageBar>
      )}

      {!loading && selectedAppId && permissions.length === 0 && roles.length > 0 && (
        <MessageBar intent="info">
          <MessageBarBody>
            No permissions defined for this application. Create permissions
            first.
          </MessageBarBody>
        </MessageBar>
      )}

      {/* Matrix grid */}
      {!loading &&
        selectedAppId &&
        roles.length > 0 &&
        permissions.length > 0 && (
          <div className={styles.matrixContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>
                    <Text weight="semibold" size={200}>
                      Role / Permission
                    </Text>
                  </th>
                  {permissions.map((perm) => (
                    <th key={perm.id} className={styles.thRotated}>
                      <Text
                        size={200}
                        weight="semibold"
                        title={perm.description ?? perm.name}
                      >
                        {perm.name}
                      </Text>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id}>
                    <td className={styles.td}>
                      <div className={styles.roleCell}>
                        <Text weight="semibold" size={300}>
                          {role.name}
                        </Text>
                        {role.isSystem && (
                          <Badge
                            appearance="outline"
                            color="informative"
                            size="tiny"
                          >
                            System
                          </Badge>
                        )}
                      </div>
                    </td>
                    {permissions.map((perm) => {
                      const checked =
                        matrix.get(role.id)?.has(perm.id) ?? false;
                      return (
                        <td key={perm.id} className={styles.tdCenter}>
                          <Checkbox
                            checked={checked}
                            onChange={(_ev, data) =>
                              handleToggle(
                                role.id,
                                perm.id,
                                data.checked === true,
                              )
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {/* Legend */}
      {!loading &&
        selectedAppId &&
        roles.length > 0 &&
        permissions.length > 0 && (
          <div className={styles.legend}>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {roles.length} role{roles.length !== 1 ? 's' : ''} ×{' '}
              {permissions.length} permission
              {permissions.length !== 1 ? 's' : ''}
            </Text>
          </div>
        )}
    </div>
  );
}
