/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { Controller, IRequestContext, Response } from "@blendsdk/webafx-common";
import { IListExtensionRequest, IListExtensionResponse } from "@porta/shared";

/**
 * @export
 * @abstract
 * @class ExtensionControllerBase
 *  @extends {Controller<RequestContextType>}
 * @template RequestContextType
 */
export abstract class ExtensionControllerBase<
	RequestContextType extends IRequestContext = IRequestContext
> extends Controller<RequestContextType> {
	/**
	 * Method for handling [GET] /api/:tenant/extensions/list
	 * @abstract
	 * @param {IListExtensionRequest} params
	 * @returns {Promise<Response<IListExtensionResponse>>}
	 * @memberof ExtensionControllerBase
	 */
	public abstract listExtension(params: IListExtensionRequest): Promise<Response<IListExtensionResponse>>;
}
