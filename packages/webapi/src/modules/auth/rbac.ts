import { IRouter, RBAC_HANDLER } from "@blendsdk/webafx";
import { HttpRequest, HttpResponse, NextFunction } from "@blendsdk/webafx-common";

export const RoleBasedAccessHandler = (): IRouter => {
    return {
        requestHandlers: {
            [RBAC_HANDLER()]: (_req: HttpRequest, _res: HttpResponse, next: NextFunction) => {
                next();
            }
        }
    };
};
