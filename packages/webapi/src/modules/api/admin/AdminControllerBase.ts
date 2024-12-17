/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { Controller, IRequestContext, Response } from "@blendsdk/webafx-common";
import {
	IChangeAccountStateRequest,
	IChangeAccountStateResponse,
	ICreateAccountRequest,
	ICreateAccountResponse,
	ICreateApplicationRequest,
	ICreateApplicationResponse,
	ICreateClientRequest,
	ICreateClientResponse
} from "@porta/shared";

/**
 * @export
 * @abstract
 * @class AdminControllerBase
 *  @extends {Controller<RequestContextType>}
 * @template RequestContextType
 */
export abstract class AdminControllerBase<
	RequestContextType extends IRequestContext = IRequestContext
> extends Controller<RequestContextType> {
	/**
	 * Method for handling [POST] /api/admin/:tenant/account/state
	 * @abstract
	 * @param {IChangeAccountStateRequest} params
	 * @returns {Promise<Response<IChangeAccountStateResponse>>}
	 * @memberof AdminControllerBase
	 */
	public abstract changeAccountState(
		params: IChangeAccountStateRequest
	): Promise<Response<IChangeAccountStateResponse>>;
	/**
	 * Method for handling [POST] /api/admin/:tenant/account/create
	 * @abstract
	 * @param {ICreateAccountRequest} params
	 * @returns {Promise<Response<ICreateAccountResponse>>}
	 * @memberof AdminControllerBase
	 */
	public abstract createAccount(params: ICreateAccountRequest): Promise<Response<ICreateAccountResponse>>;
	/**
	 * Method for handling [POST] /api/admin/:tenant/application/create
	 * @abstract
	 * @param {ICreateApplicationRequest} params
	 * @returns {Promise<Response<ICreateApplicationResponse>>}
	 * @memberof AdminControllerBase
	 */
	public abstract createApplication(params: ICreateApplicationRequest): Promise<Response<ICreateApplicationResponse>>;
	/**
	 * Method for handling [POST] /api/admin/:tenant/client/create
	 * @abstract
	 * @param {ICreateClientRequest} params
	 * @returns {Promise<Response<ICreateClientResponse>>}
	 * @memberof AdminControllerBase
	 */
	public abstract createClient(params: ICreateClientRequest): Promise<Response<ICreateClientResponse>>;
}
