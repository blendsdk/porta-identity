/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { Controller, IRequestContext, Response } from "@blendsdk/webafx-common";
import { ICreateTenantRequest, ICreateTenantResponse, IInitializeRequest, IInitializeResponse } from "@porta/shared";

/**
 * @export
 * @abstract
 * @class InitializeControllerBase
 *  @extends {Controller<RequestContextType>}
 * @template RequestContextType
 */
export abstract class InitializeControllerBase<
	RequestContextType extends IRequestContext = IRequestContext
> extends Controller<RequestContextType> {
	/**
	 * Method for handling [POST] /api/initialize/tenant/create
	 * @abstract
	 * @param {ICreateTenantRequest} params
	 * @returns {Promise<Response<ICreateTenantResponse>>}
	 * @memberof InitializeControllerBase
	 */
	public abstract createTenant(params: ICreateTenantRequest): Promise<Response<ICreateTenantResponse>>;
	/**
	 * Method for handling [POST] /api/initialize
	 * @abstract
	 * @param {IInitializeRequest} params
	 * @returns {Promise<Response<IInitializeResponse>>}
	 * @memberof InitializeControllerBase
	 */
	public abstract initialize(params: IInitializeRequest): Promise<Response<IInitializeResponse>>;
}
