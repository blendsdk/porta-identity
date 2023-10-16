import { Response } from "@blendsdk/webafx-common";
import {
    ICreateOpenIdClientRequest,
    ICreateOpenIdClientResponse,
    IDeleteOpenIdClientRequest,
    IDeleteOpenIdClientResponse,
    IGetOpenIdClientRequest,
    IGetOpenIdClientResponse,
    IListOpenIdClientRequest,
    IListOpenIdClientResponse,
    IUpdateOpenIdClientRequest,
    IUpdateOpenIdClientResponse
} from "@porta/shared";
import { OpenIdClientControllerBase } from "./OpenIdClientControllerBase";

/**
 * @export
 * @abstract
 * @class OpenIdClientController
 * @extends {OpenIdClientControllerBase}
 */
export class OpenIdClientController extends OpenIdClientControllerBase {
    public listOpenIdClient(_params: IListOpenIdClientRequest): Promise<Response<IListOpenIdClientResponse>> {
        throw new Error("Method not implemented.");
    }
    public getOpenIdClient(_params: IGetOpenIdClientRequest): Promise<Response<IGetOpenIdClientResponse>> {
        throw new Error("Method not implemented.");
    }
    public createOpenIdClient(_params: ICreateOpenIdClientRequest): Promise<Response<ICreateOpenIdClientResponse>> {
        throw new Error("Method not implemented.");
    }
    public updateOpenIdClient(_params: IUpdateOpenIdClientRequest): Promise<Response<IUpdateOpenIdClientResponse>> {
        throw new Error("Method not implemented.");
    }
    public deleteOpenIdClient(_params: IDeleteOpenIdClientRequest): Promise<Response<IDeleteOpenIdClientResponse>> {
        throw new Error("Method not implemented.");
    }
}
