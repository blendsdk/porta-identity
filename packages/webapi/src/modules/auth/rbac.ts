import { RoleBasedAccessTable, eAclRuleType } from "@blendsdk/rbac";
import { IApiAccess, IDictionaryOf } from "@blendsdk/stdlib";
import { IRouter, RBAC_HANDLER } from "@blendsdk/webafx";
import {
    HttpRequest,
    HttpResponse,
    NextFunction,
    UnAuthorizedAccessResponse,
    sendResponse
} from "@blendsdk/webafx-common";
import { ISysPermission, ISysRole } from "@porta/shared";

export const RoleBasedAccessHandler = (): IRouter => {
    const cache: IDictionaryOf<boolean> = {};

    const rbacTable = new RoleBasedAccessTable({});

    /**
     * Automatically create and initialize permissions based on the route information
     */
    const checkCreateRule = (url: string, access: IApiAccess) => {
        /**
         * When we have `access` and no cached url
         */
        if (!cache[url] && access) {
            const { permissions = [], roles = [] } = access || {};
            cache[url] = true;
            roles.forEach((code) => {
                rbacTable.addRule({
                    subject: url,
                    type: eAclRuleType.role,
                    check: (tokens: ISysRole[]) => {
                        return (
                            tokens.find((t) => {
                                return t.role === code;
                            }) !== undefined
                        );
                    }
                });
            });

            permissions.forEach((code) => {
                rbacTable.addRule({
                    subject: url,
                    type: eAclRuleType.permission,
                    check: (tokens: ISysPermission[]) => {
                        return (
                            tokens.find((t) => {
                                return t.permission === code;
                            }) !== undefined
                        );
                    }
                });
            });
        }
    };

    return {
        requestHandlers: {
            [RBAC_HANDLER()]: (req: HttpRequest, res: HttpResponse, next: NextFunction) => {
                const { url, access } = req.context.getRoute();
                //TODO: find the type insead of any
                const { permissions = [], roles = [] } = req.context.getUser<any>() || {};

                // Check and add the rule if it does not exist
                checkCreateRule(url, access);
                if (
                    rbacTable.check(url, roles, eAclRuleType.role, {
                        passWhenNoRulePresent: true,
                        allRequired: false
                    }) &&
                    rbacTable.check(url, permissions, eAclRuleType.permission, {
                        passWhenNoRulePresent: true,
                        allRequired: false
                    })
                ) {
                    next();
                } else {
                    sendResponse(new UnAuthorizedAccessResponse(new Error("UNAUTHORIZED_ACCESS_TO_ENDPOINT")), res);
                }
            }
        }
    };
};
