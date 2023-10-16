/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { Controller, IRequestContext, Response } from "@blendsdk/webafx-common";
import {
	IListOpenIdClientRequest,
	IListOpenIdClientResponse,
	IGetOpenIdClientRequest,
	IGetOpenIdClientResponse,
	ICreateOpenIdClientRequest,
	ICreateOpenIdClientResponse,
	IUpdateOpenIdClientRequest,
	IUpdateOpenIdClientResponse,
	IDeleteOpenIdClientRequest,
	IDeleteOpenIdClientResponse
} from "@porta/shared";

/**
 * @export
 * @abstract
 * @class OpenIdClientControllerBase
 *  @extends {Controller<RequestContextType>}
 * @template RequestContextType
 */
export abstract class OpenIdClientControllerBase<
	RequestContextType extends IRequestContext = IRequestContext
> extends Controller<RequestContextType> {
	/**
	 * Method for handling [GET] /api/:tenant/list/list
	 * @abstract
	 * @param {IListOpenIdClientRequest} params
	 * @returns {Promise<Response<IListOpenIdClientResponse>>}
	 * @memberof OpenIdClientControllerBase
	 */
	public abstract listOpenIdClient(params: IListOpenIdClientRequest): Promise<Response<IListOpenIdClientResponse>>;
	/**
	 * Method for handling [GET] /api/:tenant/get/:id
	 * @abstract
	 * @param {IGetOpenIdClientRequest} params
	 * @returns {Promise<Response<IGetOpenIdClientResponse>>}
	 * @memberof OpenIdClientControllerBase
	 */
	public abstract getOpenIdClient(params: IGetOpenIdClientRequest): Promise<Response<IGetOpenIdClientResponse>>;
	/**
	 * Method for handling [POST] /api/:tenant/create
	 * @abstract
	 * @param {ICreateOpenIdClientRequest} params
	 * @returns {Promise<Response<ICreateOpenIdClientResponse>>}
	 * @memberof OpenIdClientControllerBase
	 */
	public abstract createOpenIdClient(
		params: ICreateOpenIdClientRequest
	): Promise<Response<ICreateOpenIdClientResponse>>;
	/**
	 * Method for handling [PATCH] /api/:tenant/update/:id
	 * @abstract
	 * @param {IUpdateOpenIdClientRequest} params
	 * @returns {Promise<Response<IUpdateOpenIdClientResponse>>}
	 * @memberof OpenIdClientControllerBase
	 */
	public abstract updateOpenIdClient(
		params: IUpdateOpenIdClientRequest
	): Promise<Response<IUpdateOpenIdClientResponse>>;
	/**
	 * Method for handling [DELETE] /api/:tenant/delete/:id
	 * @abstract
	 * @param {IDeleteOpenIdClientRequest} params
	 * @returns {Promise<Response<IDeleteOpenIdClientResponse>>}
	 * @memberof OpenIdClientControllerBase
	 */
	public abstract deleteOpenIdClient(
		params: IDeleteOpenIdClientRequest
	): Promise<Response<IDeleteOpenIdClientResponse>>;
}
