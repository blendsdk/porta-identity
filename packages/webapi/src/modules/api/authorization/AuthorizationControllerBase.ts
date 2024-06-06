/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { Controller, IRequestContext, Response } from "@blendsdk/webafx-common";
import { IDiscoveryRequest, IDiscoveryResponse } from "@porta/shared";

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
	 * Method for handling [GET] /:tenant/oauth2/.well-known/openid-configuration
	 * @abstract
	 * @param {IDiscoveryRequest} params
	 * @returns {Promise<Response<IDiscoveryResponse>>}
	 * @memberof AuthorizationControllerBase
	 */
	public abstract discovery(params: IDiscoveryRequest): Promise<Response<IDiscoveryResponse>>;
}
