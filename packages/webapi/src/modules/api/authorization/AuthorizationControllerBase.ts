/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { Controller, IRequestContext, Response } from "@blendsdk/webafx-common";
import {
    IAuthorizeRequest,
    IAuthorizeResponse,
    ICheckFlowRequest,
    ICheckFlowResponse,
    ICheckPasswordResetRequestRequest,
    ICheckPasswordResetRequestResponse,
    IFlowInfoRequest,
    IFlowInfoResponse,
    IForgotPasswordFlowInfoRequest,
    IForgotPasswordFlowInfoResponse,
    IForgotPasswordRequestAccountRequest,
    IForgotPasswordRequestAccountResponse,
    ILogoutFlowInfoRequest,
    ILogoutFlowInfoResponse,
    IOidcDiscoveryKeysRequest,
    IOidcDiscoveryKeysResponse,
    IOidcDiscoveryRequest,
    IOidcDiscoveryResponse,
    IRedirectRequest,
    IRedirectResponse,
    IRequestPasswordResetRequest,
    IRequestPasswordResetResponse,
    ISessionLogoutGetRequest,
    ISessionLogoutGetResponse,
    ISessionLogoutPostRequest,
    ISessionLogoutPostResponse,
    ISigninRequest,
    ISigninResponse,
    ITokenInfoRequest,
    ITokenInfoResponse,
    ITokenRequest,
    ITokenResponse,
    IUserInfoGetRequest,
    IUserInfoGetResponse,
    IUserInfoPostRequest,
    IUserInfoPostResponse
} from "@porta/shared";

/**
 * @export
 * @abstract
 * @class AuthorizationControllerBase
 *  @extends {Controller<RequestContextType>}
 * @template RequestContextType
 */
export abstract class AuthorizationControllerBase<
    RequestContextType extends IRequestContext = IRequestContext
> extends Controller<RequestContextType> {
    /**
     * Method for handling [POST] /:tenant/oauth2/token_info
     * @abstract
     * @param {ITokenInfoRequest} params
     * @returns {Promise<Response<ITokenInfoResponse>>}
     * @memberof AuthorizationControllerBase
     */
    public abstract tokenInfo(params: ITokenInfoRequest): Promise<Response<ITokenInfoResponse>>;
    /**
     * Method for handling [GET] /:tenant/oauth2/authorize
     * @abstract
     * @param {IAuthorizeRequest} params
     * @returns {Promise<Response<IAuthorizeResponse>>}
     * @memberof AuthorizationControllerBase
     */
    public abstract authorize(params: IAuthorizeRequest): Promise<Response<IAuthorizeResponse>>;
    /**
     * Method for handling [POST] /:tenant/oauth2/token
     * @abstract
     * @param {ITokenRequest} params
     * @returns {Promise<Response<ITokenResponse>>}
     * @memberof AuthorizationControllerBase
     */
    public abstract token(params: ITokenRequest): Promise<Response<ITokenResponse>>;
    /**
     * Method for handling [GET] /af/signin
     * @abstract
     * @param {ISigninRequest} params
     * @returns {Promise<Response<ISigninResponse>>}
     * @memberof AuthorizationControllerBase
     */
    public abstract signin(params: ISigninRequest): Promise<Response<ISigninResponse>>;
    /**
     * Method for handling [GET] /af/redirect
     * @abstract
     * @param {IRedirectRequest} params
     * @returns {Promise<Response<IRedirectResponse>>}
     * @memberof AuthorizationControllerBase
     */
    public abstract redirect(params: IRedirectRequest): Promise<Response<IRedirectResponse>>;
    /**
     * Method for handling [POST] /af/flow_info
     * @abstract
     * @param {IFlowInfoRequest} params
     * @returns {Promise<Response<IFlowInfoResponse>>}
     * @memberof AuthorizationControllerBase
     */
    public abstract flowInfo(params: IFlowInfoRequest): Promise<Response<IFlowInfoResponse>>;
    /**
     * Method for handling [POST] /af/check_flow
     * @abstract
     * @param {ICheckFlowRequest} params
     * @returns {Promise<Response<ICheckFlowResponse>>}
     * @memberof AuthorizationControllerBase
     */
    public abstract checkFlow(params: ICheckFlowRequest): Promise<Response<ICheckFlowResponse>>;
    /**
     * Method for handling [GET] /:tenant/oauth2/.well-known/openid-configuration
     * @abstract
     * @param {IOidcDiscoveryRequest} params
     * @returns {Promise<Response<IOidcDiscoveryResponse>>}
     * @memberof AuthorizationControllerBase
     */
    public abstract oidcDiscovery(params: IOidcDiscoveryRequest): Promise<Response<IOidcDiscoveryResponse>>;
    /**
     * Method for handling [GET] /:tenant/oauth2/discovery/keys
     * @abstract
     * @param {IOidcDiscoveryKeysRequest} params
     * @returns {Promise<Response<IOidcDiscoveryKeysResponse>>}
     * @memberof AuthorizationControllerBase
     */
    public abstract oidcDiscoveryKeys(params: IOidcDiscoveryKeysRequest): Promise<Response<IOidcDiscoveryKeysResponse>>;
    /**
     * Method for handling [GET] /:tenant/oauth2/me
     * @abstract
     * @param {IUserInfoGetRequest} params
     * @returns {Promise<Response<IUserInfoGetResponse>>}
     * @memberof AuthorizationControllerBase
     */
    public abstract userInfoGet(params: IUserInfoGetRequest): Promise<Response<IUserInfoGetResponse>>;
    /**
     * Method for handling [POST] /:tenant/oauth2/me
     * @abstract
     * @param {IUserInfoPostRequest} params
     * @returns {Promise<Response<IUserInfoPostResponse>>}
     * @memberof AuthorizationControllerBase
     */
    public abstract userInfoPost(params: IUserInfoPostRequest): Promise<Response<IUserInfoPostResponse>>;
    /**
     * Method for handling [GET] /:tenant/oauth2/logout
     * @abstract
     * @param {ISessionLogoutGetRequest} params
     * @returns {Promise<Response<ISessionLogoutGetResponse>>}
     * @memberof AuthorizationControllerBase
     */
    public abstract sessionLogoutGet(params: ISessionLogoutGetRequest): Promise<Response<ISessionLogoutGetResponse>>;
    /**
     * Method for handling [POST] /:tenant/oauth2/logout
     * @abstract
     * @param {ISessionLogoutPostRequest} params
     * @returns {Promise<Response<ISessionLogoutPostResponse>>}
     * @memberof AuthorizationControllerBase
     */
    public abstract sessionLogoutPost(params: ISessionLogoutPostRequest): Promise<Response<ISessionLogoutPostResponse>>;
    /**
     * Method for handling [GET] /lf/flow_info
     * @abstract
     * @param {ILogoutFlowInfoRequest} params
     * @returns {Promise<Response<ILogoutFlowInfoResponse>>}
     * @memberof AuthorizationControllerBase
     */
    public abstract logoutFlowInfo(params: ILogoutFlowInfoRequest): Promise<Response<ILogoutFlowInfoResponse>>;
    /**
     * Method for handling [POST] /fp/flow_info
     * @abstract
     * @param {IForgotPasswordFlowInfoRequest} params
     * @returns {Promise<Response<IForgotPasswordFlowInfoResponse>>}
     * @memberof AuthorizationControllerBase
     */
    public abstract forgotPasswordFlowInfo(
        params: IForgotPasswordFlowInfoRequest
    ): Promise<Response<IForgotPasswordFlowInfoResponse>>;
    /**
     * Method for handling [POST] /fp/forgot_request_account
     * @abstract
     * @param {IForgotPasswordRequestAccountRequest} params
     * @returns {Promise<Response<IForgotPasswordRequestAccountResponse>>}
     * @memberof AuthorizationControllerBase
     */
    public abstract forgotPasswordRequestAccount(
        params: IForgotPasswordRequestAccountRequest
    ): Promise<Response<IForgotPasswordRequestAccountResponse>>;
    /**
     * Method for handling [POST] /fp/check_password_reset_request
     * @abstract
     * @param {ICheckPasswordResetRequestRequest} params
     * @returns {Promise<Response<ICheckPasswordResetRequestResponse>>}
     * @memberof AuthorizationControllerBase
     */
    public abstract checkPasswordResetRequest(
        params: ICheckPasswordResetRequestRequest
    ): Promise<Response<ICheckPasswordResetRequestResponse>>;
    /**
     * Method for handling [POST] /fp/request_password_reset
     * @abstract
     * @param {IRequestPasswordResetRequest} params
     * @returns {Promise<Response<IRequestPasswordResetResponse>>}
     * @memberof AuthorizationControllerBase
     */
    public abstract requestPasswordReset(
        params: IRequestPasswordResetRequest
    ): Promise<Response<IRequestPasswordResetResponse>>;
}
