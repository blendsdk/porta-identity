import { RoleBasedAccessTable, eAclRuleType } from "@blendsdk/rbac";
import { eApiPermissions, eApiRoles } from "@porta/shared";
import { ReferenceDataStore } from "../../lib";

export const appRbacTable = new RoleBasedAccessTable({
    rules: [
        {
            subject: "launcher_tenants",
            type: eAclRuleType.permission,
            check: (tokens: { permission: string }[]) => {
                return (
                    tokens.find((t) => {
                        return t.permission === eApiPermissions.CAN_MANAGE_TENANTS;
                    }) !== undefined
                );
            }
        },
        {
            subject: " eAppRoutes.tenants.key",
            type: eAclRuleType.permission,
            check: (tokens: { permission: string }[]) => {
                return (
                    tokens.find((t) => {
                        return t.permission === eApiPermissions.CAN_MANAGE_TENANTS;
                    }) !== undefined
                );
            }
        },
        {
            subject: " eAppRoutes.admin.key",
            type: eAclRuleType.role,
            check: (tokens: { role: string }[]) => {
                return (
                    tokens.find((t) => {
                        return t.role === eApiRoles.SYSTEM_ADMINS;
                    }) !== undefined
                );
            }
        },
        {
            subject: "[eAppRoutes.applications.key, eAppRoutes.roles.key, eAppRoutes.permissions.key]",
            type: eAclRuleType.permission,
            check: (tokens: { permission: string }[]) => {
                return (
                    tokens.find((t) => {
                        return t.permission === eApiPermissions.CAN_MANAGE_TENANTS;
                    }) === undefined // must not have this one
                );
            }
        }
    ]
});

export function createRbacFilter(refData: ReferenceDataStore) {
    return (item: any) => {
        if (item.id && refData.userProfile) {
            const hasPermission = appRbacTable.check(
                item.id,
                refData.userProfile.permissions,
                eAclRuleType.permission,
                { allRequired: true, passWhenNoRulePresent: true }
            );
            const hasRole = appRbacTable.check(item.id, refData.userProfile.roles, eAclRuleType.role, {
                allRequired: true,
                passWhenNoRulePresent: true
            });
            // Check for role and permission per route id
            return hasRole && hasPermission;
        } else {
            return true;
        }
    };
}
