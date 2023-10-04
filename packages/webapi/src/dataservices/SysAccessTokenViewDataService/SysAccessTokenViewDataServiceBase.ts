import {
	ISysAccessTokenViewDataServiceFindAccessTokenParams,
	ISysAccessTokenViewDataServiceFindAccessTokenByReferenceParams
} from "./types";
import { ISysAccessTokenView } from "@porta/shared";
import { DataService } from "@blendsdk/datakit";
import { PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to get data from sys_access_token_view view
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysAccessTokenViewDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * @param {ISysAccessTokenViewDataServiceFindAccessTokenParams}
	 * @returns {ISysAccessTokenView}
	 * @memberof SysAccessTokenViewDataServiceBase
	 */
	public async findAccessToken(
		params: ISysAccessTokenViewDataServiceFindAccessTokenParams
	): Promise<ISysAccessTokenView> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysAccessTokenView, ISysAccessTokenViewDataServiceFindAccessTokenParams>(
			`select * from sys_access_token_view where access_token = :access_token`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * @param {ISysAccessTokenViewDataServiceFindAccessTokenByReferenceParams}
	 * @returns {ISysAccessTokenView}
	 * @memberof SysAccessTokenViewDataServiceBase
	 */
	public async findAccessTokenByReference(
		params: ISysAccessTokenViewDataServiceFindAccessTokenByReferenceParams
	): Promise<ISysAccessTokenView> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<
			ISysAccessTokenView,
			ISysAccessTokenViewDataServiceFindAccessTokenByReferenceParams
		>(
			`select * from sys_access_token_view where auth_request_params ->> 'token_reference' = :token_reference`,
			params,
			{ single: true }
		);
		return result.data;
	}
}
