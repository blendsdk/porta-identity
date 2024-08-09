/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { Controller, IRequestContext, Response } from "@blendsdk/webafx-common";
import {
	ILogoutFlowInfoRequest,
	ILogoutFlowInfoResponse,
	ISessionLogoutGetRequest,
	ISessionLogoutGetResponse,
	ISessionLogoutPostRequest,
	ISessionLogoutPostResponse,
	ITokenInfoRequest,
	ITokenInfoResponse,
	IUserInfoPostRequest,
	IUserInfoPostResponse,
	IUserInfoGetRequest,
	IUserInfoGetResponse,
	ITokenRequest,
	ITokenResponse,
	IFinalizeRequest,
	IFinalizeResponse,
	ICheckSetFlowRequest,
	ICheckSetFlowResponse,
	IDiscoveryKeysRequest,
	IDiscoveryKeysResponse,
	IDiscoveryRequest,
	IDiscoveryResponse,
	IAuthorizeRequest,
	IAuthorizeResponse
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
	 * Method for handling [POST] /lf/flow_info
	 * @abstract
	 * @param {ILogoutFlowInfoRequest} params
	 * @returns {Promise<Response<ILogoutFlowInfoResponse>>}
	 * @memberof AuthorizationControllerBase
	 */
	public abstract logoutFlowInfo(params: ILogoutFlowInfoRequest): Promise<Response<ILogoutFlowInfoResponse>>;
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
	 * Method for handling [POST] /:tenant/oauth2/token_info
	 * @abstract
	 * @param {ITokenInfoRequest} params
	 * @returns {Promise<Response<ITokenInfoResponse>>}
	 * @memberof AuthorizationControllerBase
	 */
	public abstract tokenInfo(params: ITokenInfoRequest): Promise<Response<ITokenInfoResponse>>;
	/**
	 * Method for handling [POST] /:tenant/oauth2/me
	 * @abstract
	 * @param {IUserInfoPostRequest} params
	 * @returns {Promise<Response<IUserInfoPostResponse>>}
	 * @memberof AuthorizationControllerBase
	 */
	public abstract userInfoPost(params: IUserInfoPostRequest): Promise<Response<IUserInfoPostResponse>>;
	/**
	 * Method for handling [GET] /:tenant/oauth2/me
	 * @abstract
	 * @param {IUserInfoGetRequest} params
	 * @returns {Promise<Response<IUserInfoGetResponse>>}
	 * @memberof AuthorizationControllerBase
	 */
	public abstract userInfoGet(params: IUserInfoGetRequest): Promise<Response<IUserInfoGetResponse>>;
	/**
	 * Method for handling [POST] /:tenant/oauth2/token
	 * @abstract
	 * @param {ITokenRequest} params
	 * @returns {Promise<Response<ITokenResponse>>}
	 * @memberof AuthorizationControllerBase
	 */
	public abstract token(params: ITokenRequest): Promise<Response<ITokenResponse>>;
	/**
	 * Method for handling [GET] /af/finalize
	 * @abstract
	 * @param {IFinalizeRequest} params
	 * @returns {Promise<Response<IFinalizeResponse>>}
	 * @memberof AuthorizationControllerBase
	 */
	public abstract finalize(params: IFinalizeRequest): Promise<Response<IFinalizeResponse>>;
	/**
	 * Method for handling [POST] /af/flow
	 * @abstract
	 * @param {ICheckSetFlowRequest} params
	 * @returns {Promise<Response<ICheckSetFlowResponse>>}
	 * @memberof AuthorizationControllerBase
	 */
	public abstract checkSetFlow(params: ICheckSetFlowRequest): Promise<Response<ICheckSetFlowResponse>>;
	/**
	 * Method for handling [GET] /:tenant/oauth2/discovery/keys
	 * @abstract
	 * @param {IDiscoveryKeysRequest} params
	 * @returns {Promise<Response<IDiscoveryKeysResponse>>}
	 * @memberof AuthorizationControllerBase
	 */
	public abstract discoveryKeys(params: IDiscoveryKeysRequest): Promise<Response<IDiscoveryKeysResponse>>;
	/**
	 * Method for handling [GET] /:tenant/oauth2/.well-known/openid-configuration
	 * @abstract
	 * @param {IDiscoveryRequest} params
	 * @returns {Promise<Response<IDiscoveryResponse>>}
	 * @memberof AuthorizationControllerBase
	 */
	public abstract discovery(params: IDiscoveryRequest): Promise<Response<IDiscoveryResponse>>;
	/**
	 * Method for handling [GET] /:tenant/oauth2/authorize
	 * @abstract
	 * @param {IAuthorizeRequest} params
	 * @returns {Promise<Response<IAuthorizeResponse>>}
	 * @memberof AuthorizationControllerBase
	 */
	public abstract authorize(params: IAuthorizeRequest): Promise<Response<IAuthorizeResponse>>;
}
