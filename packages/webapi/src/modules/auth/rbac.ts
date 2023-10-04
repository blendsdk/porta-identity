import { RoleBasedAccessTable } from "@blendsdk/rbac";
import { IRouter, RBAC_HANDLER } from "@blendsdk/webafx";
import {
    HttpRequest,
    HttpResponse,
    NextFunction,
    UnAuthorizedAccessResponse,
    sendResponse
} from "@blendsdk/webafx-common";
import { eDefaultPermissions } from "@porta/shared";
import { IAccessToken, routeDefinitions } from "../../types";

export const RoleBasedAccessHandler = (): IRouter => {
    const rbacTable = new RoleBasedAccessTable({
        permissions: {
            [routeDefinitions.application.create_tenant.url]: eDefaultPermissions.CAN_CREATE_TENANT.code
        }
    });

    return {
        requestHandlers: {
            [RBAC_HANDLER()]: (req: HttpRequest, res: HttpResponse, next: NextFunction) => {
                const { url } = req.context.getRoute();
                const { permissions = [] } = req.context.getUser<IAccessToken>() || {};

                if (
                    rbacTable.hasAccessByPermission(
                        url,
                        permissions.map((p) => {
                            return p.code;
                        }),
                        {
                            passWhenNoRulePresent: true,
                            allRequired: false
                        }
                    )
                ) {
                    next();
                } else {
                    sendResponse(new UnAuthorizedAccessResponse(new Error("UNAUTHORIZED_ACCESS_TO ENDPOINT")), res);
                }
            }
        }
    };
};
