import { Response } from "@blendsdk/webafx-common";
import {
    IChangeAccountPasswordRequest,
    IChangeAccountPasswordResponse,
    ICreateOpenIdAccountRequest,
    ICreateOpenIdAccountResponse,
    IDeleteOpenIdAccountRequest,
    IDeleteOpenIdAccountResponse,
    IGetOpenIdAccountRequest,
    IGetOpenIdAccountResponse,
    IListOpenIdAccountRequest,
    IListOpenIdAccountResponse,
    IUpdateOpenIdAccountRequest,
    IUpdateOpenIdAccountResponse
} from "@porta/shared";
import { OpenIdAccountControllerBase } from "./OpenIdAccountControllerBase";

/**
 * @export
 * @abstract
 * @class OpenIdAccountController
 * @extends {OpenIdAccountControllerBase}
 */
export class OpenIdAccountController extends OpenIdAccountControllerBase {
    public changeAccountPassword(
        _params: IChangeAccountPasswordRequest
    ): Promise<Response<IChangeAccountPasswordResponse>> {
        throw new Error("Method not implemented.");
    }
    public listOpenIdAccount(_params: IListOpenIdAccountRequest): Promise<Response<IListOpenIdAccountResponse>> {
        throw new Error("Method not implemented.");
    }
    public getOpenIdAccount(_params: IGetOpenIdAccountRequest): Promise<Response<IGetOpenIdAccountResponse>> {
        throw new Error("Method not implemented.");
    }
    public createOpenIdAccount(_params: ICreateOpenIdAccountRequest): Promise<Response<ICreateOpenIdAccountResponse>> {
        throw new Error("Method not implemented.");
    }
    public updateOpenIdAccount(_params: IUpdateOpenIdAccountRequest): Promise<Response<IUpdateOpenIdAccountResponse>> {
        throw new Error("Method not implemented.");
    }
    public deleteOpenIdAccount(_params: IDeleteOpenIdAccountRequest): Promise<Response<IDeleteOpenIdAccountResponse>> {
        throw new Error("Method not implemented.");
    }
}
