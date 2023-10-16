/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { Controller, IRequestContext, Response } from "@blendsdk/webafx-common";
import {
	IListOpenIdRoleRequest,
	IListOpenIdRoleResponse,
	IGetOpenIdRoleRequest,
	IGetOpenIdRoleResponse,
	ICreateOpenIdRoleRequest,
	ICreateOpenIdRoleResponse,
	IUpdateOpenIdRoleRequest,
	IUpdateOpenIdRoleResponse,
	IDeleteOpenIdRoleRequest,
	IDeleteOpenIdRoleResponse
} from "@porta/shared";

/**
 * @export
 * @abstract
 * @class OpenIdRoleControllerBase
 *  @extends {Controller<RequestContextType>}
 * @template RequestContextType
 */
export abstract class OpenIdRoleControllerBase<
	RequestContextType extends IRequestContext = IRequestContext
> extends Controller<RequestContextType> {
	/**
	 * Method for handling [GET] /api/:tenant/list/list
	 * @abstract
	 * @param {IListOpenIdRoleRequest} params
	 * @returns {Promise<Response<IListOpenIdRoleResponse>>}
	 * @memberof OpenIdRoleControllerBase
	 */
	public abstract listOpenIdRole(params: IListOpenIdRoleRequest): Promise<Response<IListOpenIdRoleResponse>>;
	/**
	 * Method for handling [GET] /api/:tenant/get/:id
	 * @abstract
	 * @param {IGetOpenIdRoleRequest} params
	 * @returns {Promise<Response<IGetOpenIdRoleResponse>>}
	 * @memberof OpenIdRoleControllerBase
	 */
	public abstract getOpenIdRole(params: IGetOpenIdRoleRequest): Promise<Response<IGetOpenIdRoleResponse>>;
	/**
	 * Method for handling [POST] /api/:tenant/create
	 * @abstract
	 * @param {ICreateOpenIdRoleRequest} params
	 * @returns {Promise<Response<ICreateOpenIdRoleResponse>>}
	 * @memberof OpenIdRoleControllerBase
	 */
	public abstract createOpenIdRole(params: ICreateOpenIdRoleRequest): Promise<Response<ICreateOpenIdRoleResponse>>;
	/**
	 * Method for handling [PATCH] /api/:tenant/update/:id
	 * @abstract
	 * @param {IUpdateOpenIdRoleRequest} params
	 * @returns {Promise<Response<IUpdateOpenIdRoleResponse>>}
	 * @memberof OpenIdRoleControllerBase
	 */
	public abstract updateOpenIdRole(params: IUpdateOpenIdRoleRequest): Promise<Response<IUpdateOpenIdRoleResponse>>;
	/**
	 * Method for handling [DELETE] /api/:tenant/delete/:id
	 * @abstract
	 * @param {IDeleteOpenIdRoleRequest} params
	 * @returns {Promise<Response<IDeleteOpenIdRoleResponse>>}
	 * @memberof OpenIdRoleControllerBase
	 */
	public abstract deleteOpenIdRole(params: IDeleteOpenIdRoleRequest): Promise<Response<IDeleteOpenIdRoleResponse>>;
}
