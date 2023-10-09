import { RoleBasedAccessTable, eAclRuleType } from "@blendsdk/rbac";
import { eDefaultPermissions } from "@porta/shared";
import { eAppRoutes } from "../routing";

export const appRbacTable = new RoleBasedAccessTable({
    rules: [
        {
            subject: "launcher_tenants",
            type: eAclRuleType.permission,
            check: (tokens: { permission: string; }[]) => {
                return tokens.find(t => {
                    return t.permission === eDefaultPermissions.CAN_CREATE_TENANT.code;
                }) !== undefined;
            }
        },
        {
            subject: eAppRoutes.tenants.key,
            type: eAclRuleType.permission,
            check: (tokens: { permission: string; }[]) => {
                return tokens.find(t => {
                    return t.permission === eDefaultPermissions.CAN_CREATE_TENANT.code;
                }) !== undefined;
            }
        }
    ]
});