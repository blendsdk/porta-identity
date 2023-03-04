import { Response } from "@blendsdk/webafx-common";
import {
    IAuthorizeRequest,
    IAuthorizeResponse,
    ITokenRequest,
    ITokenResponse,
    ISigninRequest,
    ISigninResponse,
    IRedirectRequest,
    IRedirectResponse,
    IFlowInfoRequest,
    IFlowInfoResponse,
    ICheckFlowRequest,
    ICheckFlowResponse,
    IOidcDiscoveryRequest,
    IOidcDiscoveryResponse,
    IOidcDiscoveryKeysRequest,
    IOidcDiscoveryKeysResponse,
    IUserInfoGetRequest,
    IUserInfoGetResponse,
    IUserInfoPostRequest,
    IUserInfoPostResponse
} from "@porta/shared";
import { AuthorizationControllerBase } from "./AuthorizationControllerBase";
import { JWKSEndpointController } from "./controllers/JWKSEndpointController";
import { OIDCDiscoveryEndpointController } from "./controllers/OIDCDiscoveryEndpointController";

/**
 * @export
 * @abstract
 * @class AuthorizationController
 * @extends {AuthorizationControllerBase}
 */
export class AuthorizationController extends AuthorizationControllerBase {
    /**
     * Creates a sub-controller config
     *
     * @protected
     * @returns
     * @memberof AuthorizationController
     */
    protected createSubControllerConfig() {
        return {
            request: this.request,
            response: this.response,
            ...this.request.context.services
        };
    }

    public authorize(_params: IAuthorizeRequest): Promise<Response<IAuthorizeResponse>> {
        throw new Error("Method not implemented.");
    }
    public token(_params: ITokenRequest): Promise<Response<ITokenResponse>> {
        throw new Error("Method not implemented.");
    }
    public signin(_params: ISigninRequest): Promise<Response<ISigninResponse>> {
        throw new Error("Method not implemented.");
    }
    public redirect(_params: IRedirectRequest): Promise<Response<IRedirectResponse>> {
        throw new Error("Method not implemented.");
    }
    public flowInfo(_params: IFlowInfoRequest): Promise<Response<IFlowInfoResponse>> {
        throw new Error("Method not implemented.");
    }
    public checkFlow(_params: ICheckFlowRequest): Promise<Response<ICheckFlowResponse>> {
        throw new Error("Method not implemented.");
    }
    public oidcDiscovery(params: IOidcDiscoveryRequest): Promise<Response<IOidcDiscoveryResponse>> {
        const subController = new OIDCDiscoveryEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
    public oidcDiscoveryKeys(params: IOidcDiscoveryKeysRequest): Promise<Response<IOidcDiscoveryKeysResponse>> {
        const subController = new JWKSEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
    public userInfoGet(_params: IUserInfoGetRequest): Promise<Response<IUserInfoGetResponse>> {
        throw new Error("Method not implemented.");
    }
    public userInfoPost(_params: IUserInfoPostRequest): Promise<Response<IUserInfoPostResponse>> {
        throw new Error("Method not implemented.");
    }
}
