import { RoleBasedAccessTable, eAclRuleType } from "@blendsdk/rbac";
import { ApplicationDataStore } from "../lib";

export const appRbacTable = new RoleBasedAccessTable({
    // rules: [
    //     {
    //         subject: "launcher_tenants",
    //         type: eAclRuleType.permission,
    //         check: (tokens: { permission: string }[]) => {
    //             return (
    //                 tokens.find((t) => {
    //                     return t.permission === eDefaultPermissions.CAN_MANAGE_TENANTS.code;
    //                 }) !== undefined
    //             );
    //         }
    //     },
    //     {
    //         subject: eAppRoutes.tenants.key,
    //         type: eAclRuleType.permission,
    //         check: (tokens: { permission: string }[]) => {
    //             return (
    //                 tokens.find((t) => {
    //                     return t.permission === eDefaultPermissions.CAN_MANAGE_TENANTS.code;
    //                 }) !== undefined
    //             );
    //         }
    //     },
    //     {
    //         subject: eAppRoutes.admin.key,
    //         type: eAclRuleType.role,
    //         check: (tokens: { role: string }[]) => {
    //             return (
    //                 tokens.find((t) => {
    //                     return t.role === eDefaultSystemGroups.ADMINISTRATORS_GROUP.name;
    //                 }) !== undefined
    //             );
    //         }
    //     }
    // ]
});

export function createRbacFilter(refData: ApplicationDataStore) {
    return (item: any) => {
        if (item.id && refData.userData) {
            const hasPermission = appRbacTable.check(
                item.id,
                [],
                // TODO: Fix this
                // refData.userProfile.permissions,
                eAclRuleType.permission,
                { allRequired: true, passWhenNoRulePresent: true }
            );
            const hasRole = appRbacTable.check(
                item.id,
                [],
                // TODO: Fix this too
                // refData.userProfile.roles
                eAclRuleType.role,
                {
                    allRequired: true,
                    passWhenNoRulePresent: true
                }
            );
            // Check for role and permission per route id
            return hasRole && hasPermission;
        } else {
            return true;
        }
    };
}
