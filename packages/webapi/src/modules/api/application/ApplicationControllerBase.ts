/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { Controller, IRequestContext, Response } from "@blendsdk/webafx-common";
import { IInitializeRequest, IInitializeResponse, ICreateTenantRequest, IOpsResponse } from "@porta/shared";

/**
 * @export
 * @abstract
 * @class ApplicationControllerBase
 *  @extends {Controller<RequestContextType>}
 * @template RequestContextType
 */
export abstract class ApplicationControllerBase<
	RequestContextType extends IRequestContext = IRequestContext
> extends Controller<RequestContextType> {
	/**
	 * Method for handling [POST] /api/initialize
	 * @abstract
	 * @param {IInitializeRequest} params
	 * @returns {Promise<Response<IInitializeResponse>>}
	 * @memberof ApplicationControllerBase
	 */
	public abstract initialize(params: IInitializeRequest): Promise<Response<IInitializeResponse>>;
	/**
	 * Method for handling [POST] /api/:tenant/tenant
	 * @abstract
	 * @param {ICreateTenantRequest} params
	 * @returns {Promise<Response<IOpsResponse>>}
	 * @memberof ApplicationControllerBase
	 */
	public abstract createTenant(params: ICreateTenantRequest): Promise<Response<IOpsResponse>>;
}
