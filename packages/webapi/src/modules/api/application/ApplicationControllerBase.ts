/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { Controller, IRequestContext, Response } from "@blendsdk/webafx-common";
import {
	IInitializeRequest,
	IInitializeResponse,
	IGetUserProfileRequest,
	IGetUserProfileResponse
} from "@porta/shared";

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
	 * Method for handling [GET] /:tenant/user_profile
	 * @abstract
	 * @param {IGetUserProfileRequest} params
	 * @returns {Promise<Response<IGetUserProfileResponse>>}
	 * @memberof ApplicationControllerBase
	 */
	public abstract getUserProfile(params: IGetUserProfileRequest): Promise<Response<IGetUserProfileResponse>>;
}
