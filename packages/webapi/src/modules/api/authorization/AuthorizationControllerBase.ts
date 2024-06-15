/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { Controller, IRequestContext, Response } from "@blendsdk/webafx-common";
import {
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
