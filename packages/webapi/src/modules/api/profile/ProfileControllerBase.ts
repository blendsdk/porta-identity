/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { Controller, IRequestContext, Response } from "@blendsdk/webafx-common";
import {
	IGetUserProfileRequest,
	IGetUserProfileResponse,
	IGetUserStateRequest,
	IGetUserStateResponse,
	ISaveUserStateRequest,
	ISaveUserStateResponse
} from "@porta/shared";

/**
 * @export
 * @abstract
 * @class ProfileControllerBase
 *  @extends {Controller<RequestContextType>}
 * @template RequestContextType
 */
export abstract class ProfileControllerBase<
	RequestContextType extends IRequestContext = IRequestContext
> extends Controller<RequestContextType> {
	/**
	 * Method for handling [POST] /api/profile
	 * @abstract
	 * @param {IGetUserProfileRequest} params
	 * @returns {Promise<Response<IGetUserProfileResponse>>}
	 * @memberof ProfileControllerBase
	 */
	public abstract getUserProfile(params: IGetUserProfileRequest): Promise<Response<IGetUserProfileResponse>>;
	/**
	 * Method for handling [GET] /api/:tenant/user_state
	 * @abstract
	 * @param {IGetUserStateRequest} params
	 * @returns {Promise<Response<IGetUserStateResponse>>}
	 * @memberof ProfileControllerBase
	 */
	public abstract getUserState(params: IGetUserStateRequest): Promise<Response<IGetUserStateResponse>>;
	/**
	 * Method for handling [POST] /api/:tenant/user_state
	 * @abstract
	 * @param {ISaveUserStateRequest} params
	 * @returns {Promise<Response<ISaveUserStateResponse>>}
	 * @memberof ProfileControllerBase
	 */
	public abstract saveUserState(params: ISaveUserStateRequest): Promise<Response<ISaveUserStateResponse>>;
}
