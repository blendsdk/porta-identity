/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { Controller, IRequestContext, Response } from "@blendsdk/webafx-common";
import { ICreateApplicationRequest, ICreateApplicationResponse } from "@porta/shared";

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
	 * Method for handling [POST] /api/admin/:tenant/application/create
	 * @abstract
	 * @param {ICreateApplicationRequest} params
	 * @returns {Promise<Response<ICreateApplicationResponse>>}
	 * @memberof AdminControllerBase
	 */
	public abstract createApplication(params: ICreateApplicationRequest): Promise<Response<ICreateApplicationResponse>>;
}
