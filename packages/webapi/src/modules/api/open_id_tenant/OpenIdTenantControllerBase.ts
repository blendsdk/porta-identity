/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { Controller, IRequestContext, Response } from "@blendsdk/webafx-common";
import {
	IListOpenIdTenantRequest,
	IListOpenIdTenantResponse,
	IGetOpenIdTenantRequest,
	IGetOpenIdTenantResponse,
	ICreateOpenIdTenantRequest,
	ICreateOpenIdTenantResponse,
	IUpdateOpenIdTenantRequest,
	IUpdateOpenIdTenantResponse,
	IDeleteOpenIdTenantRequest,
	IDeleteOpenIdTenantResponse
} from "@porta/shared";

/**
 * @export
 * @abstract
 * @class OpenIdTenantControllerBase
 *  @extends {Controller<RequestContextType>}
 * @template RequestContextType
 */
export abstract class OpenIdTenantControllerBase<
	RequestContextType extends IRequestContext = IRequestContext
> extends Controller<RequestContextType> {
	/**
	 * Method for handling [GET] /api/:tenant/tenant/list/list
	 * @abstract
	 * @param {IListOpenIdTenantRequest} params
	 * @returns {Promise<Response<IListOpenIdTenantResponse>>}
	 * @memberof OpenIdTenantControllerBase
	 */
	public abstract listOpenIdTenant(params: IListOpenIdTenantRequest): Promise<Response<IListOpenIdTenantResponse>>;
	/**
	 * Method for handling [GET] /api/:tenant/tenant/get/:id
	 * @abstract
	 * @param {IGetOpenIdTenantRequest} params
	 * @returns {Promise<Response<IGetOpenIdTenantResponse>>}
	 * @memberof OpenIdTenantControllerBase
	 */
	public abstract getOpenIdTenant(params: IGetOpenIdTenantRequest): Promise<Response<IGetOpenIdTenantResponse>>;
	/**
	 * Method for handling [POST] /api/:tenant/tenant/create
	 * @abstract
	 * @param {ICreateOpenIdTenantRequest} params
	 * @returns {Promise<Response<ICreateOpenIdTenantResponse>>}
	 * @memberof OpenIdTenantControllerBase
	 */
	public abstract createOpenIdTenant(
		params: ICreateOpenIdTenantRequest
	): Promise<Response<ICreateOpenIdTenantResponse>>;
	/**
	 * Method for handling [PATCH] /api/:tenant/tenant/update/:id
	 * @abstract
	 * @param {IUpdateOpenIdTenantRequest} params
	 * @returns {Promise<Response<IUpdateOpenIdTenantResponse>>}
	 * @memberof OpenIdTenantControllerBase
	 */
	public abstract updateOpenIdTenant(
		params: IUpdateOpenIdTenantRequest
	): Promise<Response<IUpdateOpenIdTenantResponse>>;
	/**
	 * Method for handling [DELETE] /api/:tenant/tenant/delete/:id
	 * @abstract
	 * @param {IDeleteOpenIdTenantRequest} params
	 * @returns {Promise<Response<IDeleteOpenIdTenantResponse>>}
	 * @memberof OpenIdTenantControllerBase
	 */
	public abstract deleteOpenIdTenant(
		params: IDeleteOpenIdTenantRequest
	): Promise<Response<IDeleteOpenIdTenantResponse>>;
}
