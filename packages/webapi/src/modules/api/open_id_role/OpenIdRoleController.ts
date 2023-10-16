import { Response } from "@blendsdk/webafx-common";
import {
    ICreateOpenIdRoleRequest,
    ICreateOpenIdRoleResponse,
    IDeleteOpenIdRoleRequest,
    IDeleteOpenIdRoleResponse,
    IGetOpenIdRoleRequest,
    IGetOpenIdRoleResponse,
    IListOpenIdRoleRequest,
    IListOpenIdRoleResponse,
    IUpdateOpenIdRoleRequest,
    IUpdateOpenIdRoleResponse
} from "@porta/shared";
import { OpenIdRoleControllerBase } from "./OpenIdRoleControllerBase";

/**
 * @export
 * @abstract
 * @class OpenIdRoleController
 * @extends {OpenIdRoleControllerBase}
 */
export class OpenIdRoleController extends OpenIdRoleControllerBase {
    public listOpenIdRole(_params: IListOpenIdRoleRequest): Promise<Response<IListOpenIdRoleResponse>> {
        throw new Error("Method not implemented.");
    }
    public getOpenIdRole(_params: IGetOpenIdRoleRequest): Promise<Response<IGetOpenIdRoleResponse>> {
        throw new Error("Method not implemented.");
    }
    public createOpenIdRole(_params: ICreateOpenIdRoleRequest): Promise<Response<ICreateOpenIdRoleResponse>> {
        throw new Error("Method not implemented.");
    }
    public updateOpenIdRole(_params: IUpdateOpenIdRoleRequest): Promise<Response<IUpdateOpenIdRoleResponse>> {
        throw new Error("Method not implemented.");
    }
    public deleteOpenIdRole(_params: IDeleteOpenIdRoleRequest): Promise<Response<IDeleteOpenIdRoleResponse>> {
        throw new Error("Method not implemented.");
    }
}
