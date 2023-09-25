import {
	ISysRefreshTokenViewDataServiceFindRefreshTokenParams,
	ISysRefreshTokenViewDataServiceFindRefreshTokenByAccessTokenParams
} from "./types";
import { ISysRefreshTokenView } from "@porta/shared";
import { DataService } from "@blendsdk/datakit";
import { PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to get data from sys_refresh_token_view view
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysRefreshTokenViewDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * @param {ISysRefreshTokenViewDataServiceFindRefreshTokenParams}
	 * @returns {ISysRefreshTokenView}
	 * @memberof SysRefreshTokenViewDataServiceBase
	 */
	public async findRefreshToken(
		params: ISysRefreshTokenViewDataServiceFindRefreshTokenParams
	): Promise<ISysRefreshTokenView> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysRefreshTokenView, ISysRefreshTokenViewDataServiceFindRefreshTokenParams>(
			`select * from sys_refresh_token_view where refresh_token = :refresh_token`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * @param {ISysRefreshTokenViewDataServiceFindRefreshTokenByAccessTokenParams}
	 * @returns {ISysRefreshTokenView}
	 * @memberof SysRefreshTokenViewDataServiceBase
	 */
	public async findRefreshTokenByAccessToken(
		params: ISysRefreshTokenViewDataServiceFindRefreshTokenByAccessTokenParams
	): Promise<ISysRefreshTokenView> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<
			ISysRefreshTokenView,
			ISysRefreshTokenViewDataServiceFindRefreshTokenByAccessTokenParams
		>(`select * from sys_refresh_token_view where access_token = :access_token`, params, { single: true });
		return result.data;
	}
}
