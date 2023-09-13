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
    IUserInfoPostResponse,
    ISessionLogoutGetRequest,
    ISessionLogoutGetResponse,
    ISessionLogoutPostRequest,
    ISessionLogoutPostResponse,
    ILogoutFlowInfoRequest,
    ILogoutFlowInfoResponse,
    IForgotPasswordFlowInfoRequest,
    IForgotPasswordFlowInfoResponse,
    ICheckPasswordResetRequestRequest,
    ICheckPasswordResetRequestResponse,
    IRequestPasswordResetRequest,
    IRequestPasswordResetResponse
} from "@porta/shared";
import { AuthorizationControllerBase } from "./AuthorizationControllerBase";
import { AuthorizeEndpointController } from "./controllers/AuthorizeEndpointController";
import { CheckFlowEndpointController } from "./controllers/CheckFlowEndpointController";
import { EndSessionController } from "./controllers/EndSessionController";
import { FlowInfoEndpointController } from "./controllers/FlowInfoEndpointController";
import { JWKSEndpointController } from "./controllers/JWKSEndpointController";
import { LogoutFlowInfoEndpointController } from "./controllers/LogoutFlowInfoEndpointController";
import { OIDCDiscoveryEndpointController } from "./controllers/OIDCDiscoveryEndpointController";
import { RedirectEndpointController } from "./controllers/RedirectEndpointController";
import { SigninEndpointController } from "./controllers/SigninEndpointController";
import { TokenEndpointController } from "./controllers/TokenEndpointController";
import { UserInfoEndpointController } from "./controllers/UserInfoEndpointController";
import { PasswordResetEndpointController } from "./controllers/PasswordResetEndpointController";
import { IForgotPasswordRequestAccountRequest } from "@porta/shared";
import { IForgotPasswordRequestAccountResponse } from "@porta/shared";

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

    public sessionLogoutGet(params: ISessionLogoutGetRequest): Promise<Response<ISessionLogoutGetResponse>> {
        const subController = new EndSessionController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
    public sessionLogoutPost(params: ISessionLogoutPostRequest): Promise<Response<ISessionLogoutPostResponse>> {
        const subController = new EndSessionController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
    public authorize(params: IAuthorizeRequest): Promise<Response<IAuthorizeResponse>> {
        const subController = new AuthorizeEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
    public token(params: ITokenRequest): Promise<Response<ITokenResponse>> {
        const subController = new TokenEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
    public signin(params: ISigninRequest): Promise<Response<ISigninResponse>> {
        const subController = new SigninEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
    public redirect(params: IRedirectRequest): Promise<Response<IRedirectResponse>> {
        const subController = new RedirectEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
    public logoutFlowInfo(params: ILogoutFlowInfoRequest): Promise<Response<ILogoutFlowInfoResponse>> {
        const subController = new LogoutFlowInfoEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
    public forgotPasswordFlowInfo(
        params: IForgotPasswordFlowInfoRequest
    ): Promise<Response<IForgotPasswordFlowInfoResponse>> {
        const subController = new PasswordResetEndpointController(this.createSubControllerConfig());
        return subController.forgotPasswordFlowInfo(params);
    }
    public checkPasswordResetRequest(
        params: ICheckPasswordResetRequestRequest
    ): Promise<Response<ICheckPasswordResetRequestResponse>> {
        const subController = new PasswordResetEndpointController(this.createSubControllerConfig());
        return subController.checkPasswordResetRequest(params);
    }
    public requestPasswordReset(
        params: IRequestPasswordResetRequest
    ): Promise<Response<IRequestPasswordResetResponse>> {
        const subController = new PasswordResetEndpointController(this.createSubControllerConfig());
        return subController.requestPasswordReset(params);
    }
    public forgotPasswordRequestAccount(
        params: IForgotPasswordRequestAccountRequest
    ): Promise<Response<IForgotPasswordRequestAccountResponse>> {
        const subController = new PasswordResetEndpointController(this.createSubControllerConfig());
        return subController.forgotPasswordRequestAccount(params);
    }

    public flowInfo(params: IFlowInfoRequest): Promise<Response<IFlowInfoResponse>> {
        const subController = new FlowInfoEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
    public checkFlow(params: ICheckFlowRequest): Promise<Response<ICheckFlowResponse>> {
        const subController = new CheckFlowEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
    public oidcDiscovery(params: IOidcDiscoveryRequest): Promise<Response<IOidcDiscoveryResponse>> {
        const subController = new OIDCDiscoveryEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
    public oidcDiscoveryKeys(params: IOidcDiscoveryKeysRequest): Promise<Response<IOidcDiscoveryKeysResponse>> {
        const subController = new JWKSEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
    public userInfoGet(params: IUserInfoGetRequest): Promise<Response<IUserInfoGetResponse>> {
        const subController = new UserInfoEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
    public userInfoPost(params: IUserInfoPostRequest): Promise<Response<IUserInfoPostResponse>> {
        const subController = new UserInfoEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
}
