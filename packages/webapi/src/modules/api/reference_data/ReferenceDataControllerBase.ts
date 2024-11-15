/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { Controller, IRequestContext, Response } from "@blendsdk/webafx-common";
import { IGetReferenceDataRequest, IGetReferenceDataResponse } from "@porta/shared";

/**
 * @export
 * @abstract
 * @class ReferenceDataControllerBase
 *  @extends {Controller<RequestContextType>}
 * @template RequestContextType
 */
export abstract class ReferenceDataControllerBase<
	RequestContextType extends IRequestContext = IRequestContext
> extends Controller<RequestContextType> {
	/**
	 * Method for handling [POST] /api/:tenant/reference_data
	 * @abstract
	 * @param {IGetReferenceDataRequest} params
	 * @returns {Promise<Response<IGetReferenceDataResponse>>}
	 * @memberof ReferenceDataControllerBase
	 */
	public abstract getReferenceData(params: IGetReferenceDataRequest): Promise<Response<IGetReferenceDataResponse>>;
}
