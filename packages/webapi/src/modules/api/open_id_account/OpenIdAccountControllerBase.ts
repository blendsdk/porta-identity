/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { Controller, IRequestContext, Response } from "@blendsdk/webafx-common";
import {
	IListOpenIdAccountRequest,
	IListOpenIdAccountResponse,
	IGetOpenIdAccountRequest,
	IGetOpenIdAccountResponse,
	ICreateOpenIdAccountRequest,
	ICreateOpenIdAccountResponse,
	IUpdateOpenIdAccountRequest,
	IUpdateOpenIdAccountResponse,
	IDeleteOpenIdAccountRequest,
	IDeleteOpenIdAccountResponse
} from "@porta/shared";

/**
 * @export
 * @abstract
 * @class OpenIdAccountControllerBase
 *  @extends {Controller<RequestContextType>}
 * @template RequestContextType
 */
export abstract class OpenIdAccountControllerBase<
	RequestContextType extends IRequestContext = IRequestContext
> extends Controller<RequestContextType> {
	/**
	 * Method for handling [GET] /api/:tenant/list/list
	 * @abstract
	 * @param {IListOpenIdAccountRequest} params
	 * @returns {Promise<Response<IListOpenIdAccountResponse>>}
	 * @memberof OpenIdAccountControllerBase
	 */
	public abstract listOpenIdAccount(params: IListOpenIdAccountRequest): Promise<Response<IListOpenIdAccountResponse>>;
	/**
	 * Method for handling [GET] /api/:tenant/get/:id
	 * @abstract
	 * @param {IGetOpenIdAccountRequest} params
	 * @returns {Promise<Response<IGetOpenIdAccountResponse>>}
	 * @memberof OpenIdAccountControllerBase
	 */
	public abstract getOpenIdAccount(params: IGetOpenIdAccountRequest): Promise<Response<IGetOpenIdAccountResponse>>;
	/**
	 * Method for handling [POST] /api/:tenant/create
	 * @abstract
	 * @param {ICreateOpenIdAccountRequest} params
	 * @returns {Promise<Response<ICreateOpenIdAccountResponse>>}
	 * @memberof OpenIdAccountControllerBase
	 */
	public abstract createOpenIdAccount(
		params: ICreateOpenIdAccountRequest
	): Promise<Response<ICreateOpenIdAccountResponse>>;
	/**
	 * Method for handling [PATCH] /api/:tenant/update/:id
	 * @abstract
	 * @param {IUpdateOpenIdAccountRequest} params
	 * @returns {Promise<Response<IUpdateOpenIdAccountResponse>>}
	 * @memberof OpenIdAccountControllerBase
	 */
	public abstract updateOpenIdAccount(
		params: IUpdateOpenIdAccountRequest
	): Promise<Response<IUpdateOpenIdAccountResponse>>;
	/**
	 * Method for handling [DELETE] /api/:tenant/delete/:id
	 * @abstract
	 * @param {IDeleteOpenIdAccountRequest} params
	 * @returns {Promise<Response<IDeleteOpenIdAccountResponse>>}
	 * @memberof OpenIdAccountControllerBase
	 */
	public abstract deleteOpenIdAccount(
		params: IDeleteOpenIdAccountRequest
	): Promise<Response<IDeleteOpenIdAccountResponse>>;
}
