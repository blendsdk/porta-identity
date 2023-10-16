import { Response } from "@blendsdk/webafx-common";
import {
    ICreateOpenIdPermissionRequest,
    ICreateOpenIdPermissionResponse,
    IDeleteOpenIdPermissionRequest,
    IDeleteOpenIdPermissionResponse,
    IGetOpenIdPermissionRequest,
    IGetOpenIdPermissionResponse,
    IListOpenIdPermissionRequest,
    IListOpenIdPermissionResponse,
    IUpdateOpenIdPermissionRequest,
    IUpdateOpenIdPermissionResponse
} from "@porta/shared";
import { OpenIdPermissionControllerBase } from "./OpenIdPermissionControllerBase";

/**
 * @export
 * @abstract
 * @class OpenIdPermissionController
 * @extends {OpenIdPermissionControllerBase}
 */
export class OpenIdPermissionController extends OpenIdPermissionControllerBase {
    public listOpenIdPermission(
        _params: IListOpenIdPermissionRequest
    ): Promise<Response<IListOpenIdPermissionResponse>> {
        throw new Error("Method not implemented.");
    }
    public getOpenIdPermission(_params: IGetOpenIdPermissionRequest): Promise<Response<IGetOpenIdPermissionResponse>> {
        throw new Error("Method not implemented.");
    }
    public createOpenIdPermission(
        _params: ICreateOpenIdPermissionRequest
    ): Promise<Response<ICreateOpenIdPermissionResponse>> {
        throw new Error("Method not implemented.");
    }
    public updateOpenIdPermission(
        _params: IUpdateOpenIdPermissionRequest
    ): Promise<Response<IUpdateOpenIdPermissionResponse>> {
        throw new Error("Method not implemented.");
    }
    public deleteOpenIdPermission(
        _params: IDeleteOpenIdPermissionRequest
    ): Promise<Response<IDeleteOpenIdPermissionResponse>> {
        throw new Error("Method not implemented.");
    }
}
