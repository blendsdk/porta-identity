/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { Controller, IRequestContext, Response } from "@blendsdk/webafx-common";
import {
	IListOpenIdPermissionRequest,
	IListOpenIdPermissionResponse,
	IGetOpenIdPermissionRequest,
	IGetOpenIdPermissionResponse,
	ICreateOpenIdPermissionRequest,
	ICreateOpenIdPermissionResponse,
	IUpdateOpenIdPermissionRequest,
	IUpdateOpenIdPermissionResponse,
	IDeleteOpenIdPermissionRequest,
	IDeleteOpenIdPermissionResponse
} from "@porta/shared";

/**
 * @export
 * @abstract
 * @class OpenIdPermissionControllerBase
 *  @extends {Controller<RequestContextType>}
 * @template RequestContextType
 */
export abstract class OpenIdPermissionControllerBase<
	RequestContextType extends IRequestContext = IRequestContext
> extends Controller<RequestContextType> {
	/**
	 * Method for handling [GET] /api/:tenant/list/list
	 * @abstract
	 * @param {IListOpenIdPermissionRequest} params
	 * @returns {Promise<Response<IListOpenIdPermissionResponse>>}
	 * @memberof OpenIdPermissionControllerBase
	 */
	public abstract listOpenIdPermission(
		params: IListOpenIdPermissionRequest
	): Promise<Response<IListOpenIdPermissionResponse>>;
	/**
	 * Method for handling [GET] /api/:tenant/get/:id
	 * @abstract
	 * @param {IGetOpenIdPermissionRequest} params
	 * @returns {Promise<Response<IGetOpenIdPermissionResponse>>}
	 * @memberof OpenIdPermissionControllerBase
	 */
	public abstract getOpenIdPermission(
		params: IGetOpenIdPermissionRequest
	): Promise<Response<IGetOpenIdPermissionResponse>>;
	/**
	 * Method for handling [POST] /api/:tenant/create
	 * @abstract
	 * @param {ICreateOpenIdPermissionRequest} params
	 * @returns {Promise<Response<ICreateOpenIdPermissionResponse>>}
	 * @memberof OpenIdPermissionControllerBase
	 */
	public abstract createOpenIdPermission(
		params: ICreateOpenIdPermissionRequest
	): Promise<Response<ICreateOpenIdPermissionResponse>>;
	/**
	 * Method for handling [PATCH] /api/:tenant/update/:id
	 * @abstract
	 * @param {IUpdateOpenIdPermissionRequest} params
	 * @returns {Promise<Response<IUpdateOpenIdPermissionResponse>>}
	 * @memberof OpenIdPermissionControllerBase
	 */
	public abstract updateOpenIdPermission(
		params: IUpdateOpenIdPermissionRequest
	): Promise<Response<IUpdateOpenIdPermissionResponse>>;
	/**
	 * Method for handling [DELETE] /api/:tenant/delete/:id
	 * @abstract
	 * @param {IDeleteOpenIdPermissionRequest} params
	 * @returns {Promise<Response<IDeleteOpenIdPermissionResponse>>}
	 * @memberof OpenIdPermissionControllerBase
	 */
	public abstract deleteOpenIdPermission(
		params: IDeleteOpenIdPermissionRequest
	): Promise<Response<IDeleteOpenIdPermissionResponse>>;
}
