import { Response } from "@blendsdk/webafx-common";
import {
    ICreateOpenIdTenantRequest,
    ICreateOpenIdTenantResponse,
    IDeleteOpenIdTenantRequest,
    IDeleteOpenIdTenantResponse,
    IGetOpenIdTenantRequest,
    IGetOpenIdTenantResponse,
    IListOpenIdTenantRequest,
    IListOpenIdTenantResponse,
    IUpdateOpenIdTenantRequest,
    IUpdateOpenIdTenantResponse
} from "@porta/shared";
import { OpenIdTenantControllerBase } from "./OpenIdTenantControllerBase";

/**
 * @export
 * @abstract
 * @class OpenIdTenantController
 * @extends {OpenIdTenantControllerBase}
 */
export class OpenIdTenantController extends OpenIdTenantControllerBase {
    public listOpenIdTenant(_params: IListOpenIdTenantRequest): Promise<Response<IListOpenIdTenantResponse>> {
        throw new Error("Method not implemented.");
    }
    public getOpenIdTenant(_params: IGetOpenIdTenantRequest): Promise<Response<IGetOpenIdTenantResponse>> {
        throw new Error("Method not implemented.");
    }
    public createOpenIdTenant(_params: ICreateOpenIdTenantRequest): Promise<Response<ICreateOpenIdTenantResponse>> {
        throw new Error("Method not implemented.");
    }
    public updateOpenIdTenant(_params: IUpdateOpenIdTenantRequest): Promise<Response<IUpdateOpenIdTenantResponse>> {
        throw new Error("Method not implemented.");
    }
    public deleteOpenIdTenant(_params: IDeleteOpenIdTenantRequest): Promise<Response<IDeleteOpenIdTenantResponse>> {
        throw new Error("Method not implemented.");
    }
}
