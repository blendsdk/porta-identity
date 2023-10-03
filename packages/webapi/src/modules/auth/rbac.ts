import { IRouter, RBAC_HANDLER } from "@blendsdk/webafx";
import { HttpRequest, HttpResponse, NextFunction } from "@blendsdk/webafx-common";

export const RoleBasedAccessHandler = (): IRouter => {
    // const rbacTable = new RoleBasedAccessTable({
    //     roles: {
    //         [routeDefinitions.application.initialize.url]:eDefaultPermissions.CAN_CREATE_TENANT.code
    //     }
    // });

    return {
        requestHandlers: {
            [RBAC_HANDLER()]: (_req: HttpRequest, _res: HttpResponse, next: NextFunction) => {
                next();
                // const { url } = req.context.getRoute();
                // const { permissions = [], roles = [] } = req.context.getUser<IAccessToken>() || {};

                // if (
                //     rbacTable.hasAccessByPermission(
                //         url,
                //         permissions.map((p) => {
                //             return p.code;
                //         }),
                //         {
                //             passWhenNoRulePresent: true,
                //             allRequired: false
                //         }
                //     )
                // ) {
                //     next();
                // } else {
                //     sendResponse(new UnAuthorizedAccessResponse(new Error("UNAUTHORIZED_ACCESS_TO ENDPOINT")), res);
                // }
            }
        }
    };
};
