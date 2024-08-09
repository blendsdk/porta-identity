import { Response } from "@blendsdk/webafx-common";
import { IAuthorizeRequest, IAuthorizeResponse, ICheckSetFlowRequest, ICheckSetFlowResponse, IDiscoveryKeysRequest, IDiscoveryKeysResponse, IDiscoveryRequest, IDiscoveryResponse, IFinalizeRequest, IFinalizeResponse, ILogoutFlowInfoRequest, ILogoutFlowInfoResponse, ISessionLogoutGetRequest, ISessionLogoutGetResponse, ISessionLogoutPostRequest, ISessionLogoutPostResponse, ITokenInfoRequest, ITokenInfoResponse, ITokenRequest, ITokenResponse, IUserInfoGetRequest, IUserInfoGetResponse } from "@porta/shared";
import { AuthorizationControllerBase } from "./AuthorizationControllerBase";
import { AuthenticateEndpointController } from "./controllers/AuthenticateEndpointController";
import { AuthorizeEndpointController } from "./controllers/AuthorizeEndpointController";
import { DiscoveryEndpointController } from "./controllers/DiscoveryEndpointController";
import { EndSessionController } from "./controllers/EndSessionController";
import { FinalizeEndpointController } from "./controllers/FinalizeEndpointController";
import { JWKSEndpointController } from "./controllers/JWKSEndpointController";
import { TokenEndpointController } from "./controllers/TokenEndpointController";
import { TokenInfoEndpointController } from "./controllers/TokenInfoEndpointController";
import { UserInfoEndpointController } from "./controllers/UserInfoEndpointController";
import { LogoutFlowInfoEndpointController } from "./controllers/LogoutFlowInfoEndpointController";


/**
 * @export
 * @abstract
 * @class AuthorizationController
 * @extends {AuthorizationControllerBase}
 */
export class AuthorizationController extends AuthorizationControllerBase {

    public logoutFlowInfo(params: ILogoutFlowInfoRequest): Promise<Response<ILogoutFlowInfoResponse>> {
        const subController = new LogoutFlowInfoEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }

    /**
     * @param {ISessionLogoutGetRequest} params
     * @return {*}  {Promise<Response<ISessionLogoutGetResponse>>}
     * @memberof AuthorizationController
     */
    public sessionLogoutGet(params: ISessionLogoutGetRequest): Promise<Response<ISessionLogoutGetResponse>> {
        const subController = new EndSessionController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }

    /**
     * @param {ISessionLogoutPostRequest} params
     * @return {*}  {Promise<Response<ISessionLogoutPostResponse>>}
     * @memberof AuthorizationController
     */
    public sessionLogoutPost(params: ISessionLogoutPostRequest): Promise<Response<ISessionLogoutPostResponse>> {
        const subController = new EndSessionController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }

    /**
     * @param {ITokenInfoRequest} params
     * @return {*}  {Promise<Response<ITokenInfoResponse>>}
     * @memberof AuthorizationController
     */
    public tokenInfo(params: ITokenInfoRequest): Promise<Response<ITokenInfoResponse>> {
        const subController = new TokenInfoEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }

    /**
     * @param {IAuthorizeRequest} params
     * @return {*}  {Promise<Response<IAuthorizeRequest>>}
     * @memberof AuthorizationController
     */
    public userInfoPost(params: IAuthorizeRequest): Promise<Response<IAuthorizeRequest>> {
        const subController = new UserInfoEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }

    /**
     * @param {IUserInfoGetRequest} params
     * @return {*}  {Promise<Response<IUserInfoGetResponse>>}
     * @memberof AuthorizationController
     */
    public userInfoGet(params: IUserInfoGetRequest): Promise<Response<IUserInfoGetResponse>> {
        const subController = new UserInfoEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }

    /**
     * @param {ITokenRequest} params
     * @return {*}  {Promise<Response<ITokenResponse>>}
     * @memberof AuthorizationController
     */
    public token(params: ITokenRequest): Promise<Response<ITokenResponse>> {
        const subController = new TokenEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }

    /**
     * @param {IFinalizeRequest} params
     * @return {*}  {Promise<Response<IFinalizeResponse>>}
     * @memberof AuthorizationController
     */
    public finalize(params: IFinalizeRequest): Promise<Response<IFinalizeResponse>> {
        const subController = new FinalizeEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }

    /**
     * @param {ICheckSetFlowRequest} params
     * @return {*}  {Promise<Response<ICheckSetFlowResponse>>}
     * @memberof AuthorizationController
     */
    public checkSetFlow(params: ICheckSetFlowRequest): Promise<Response<ICheckSetFlowResponse>> {
        const subController = new AuthenticateEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
    /**
     * @param {IAuthorizeRequest} params
     * @return {*}  {Promise<Response<IAuthorizeResponse>>}
     * @memberof AuthorizationController
     */
    public authorize(params: IAuthorizeRequest): Promise<Response<IAuthorizeResponse>> {
        const subController = new AuthorizeEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
    /**
     * @param {IDiscoveryKeysRequest} params
     * @return {*}  {Promise<Response<IDiscoveryKeysResponse>>}
     * @memberof AuthorizationController
     */
    public discoveryKeys(params: IDiscoveryKeysRequest): Promise<Response<IDiscoveryKeysResponse>> {
        const subController = new JWKSEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
    /**
     * @param {IDiscoveryRequest} params
     * @return {*}  {Promise<Response<IDiscoveryResponse>>}
     * @memberof AuthorizationController
     */
    public discovery(params: IDiscoveryRequest): Promise<Response<IDiscoveryResponse>> {
        const subController = new DiscoveryEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);

    }
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
}
