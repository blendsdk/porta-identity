import { RoleBasedAccessTable, eAclRuleType } from "@blendsdk/rbac";
import { IRouter, RBAC_HANDLER } from "@blendsdk/webafx";
import {
    HttpRequest,
    HttpResponse,
    NextFunction,
    UnAuthorizedAccessResponse,
    sendResponse
} from "@blendsdk/webafx-common";
import { ISysUserPermissionView, eDefaultPermissions } from "@porta/shared";
import { IAccessToken, routeDefinitions } from "../../types";

export const RoleBasedAccessHandler = (): IRouter => {
    const rbacTable = new RoleBasedAccessTable({
        rules:[
            {
                subject:routeDefinitions.application.create_tenant.url,
                type:eAclRuleType.permission,
                check:(tokens:ISysUserPermissionView[])=>{
                    return tokens.find(t=>{
                        return t.code === eDefaultPermissions.CAN_CREATE_TENANT.code
                    }) !== undefined
                }
            }
        ]
    });

    return {
        requestHandlers: {
            [RBAC_HANDLER()]: (req: HttpRequest, res: HttpResponse, next: NextFunction) => {
                const { url } = req.context.getRoute();
                const { permissions = [] } = req.context.getUser<IAccessToken>() || {};

                if (
                    rbacTable.check(url,permissions,eAclRuleType.permission,{passWhenNoRulePresent:true,allRequired:false})
                ) {
                    next();
                } else {
                    sendResponse(new UnAuthorizedAccessResponse(new Error("UNAUTHORIZED_ACCESS_TO_ENDPOINT")), res);
                }
            }
        }
    };
};
