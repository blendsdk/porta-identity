import {
	ISysAuthorizationViewDataServiceFindByClientIdAndRedirectUriParams,
	ISysAuthorizationViewDataServiceFindByClientIdOnlyParams
} from "./types";
import { ISysAuthorizationView } from "@porta/shared";
import { DataService } from "@blendsdk/datakit";
import { PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to get data from sys_authorization_view view
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysAuthorizationViewDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * @param {ISysAuthorizationViewDataServiceFindByClientIdAndRedirectUriParams}
	 * @returns {ISysAuthorizationView}
	 * @memberof SysAuthorizationViewDataServiceBase
	 */
	public async findByClientIdAndRedirectUri(
		params: ISysAuthorizationViewDataServiceFindByClientIdAndRedirectUriParams
	): Promise<ISysAuthorizationView> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<
			ISysAuthorizationView,
			ISysAuthorizationViewDataServiceFindByClientIdAndRedirectUriParams
		>(`select * from sys_authorization_view where client_id = :client_id and redirect_uri = :redirect_uri`, params, {
			single: true
		});
		return result.data;
	}

	/**
	 * @param {ISysAuthorizationViewDataServiceFindByClientIdOnlyParams}
	 * @returns {ISysAuthorizationView}
	 * @memberof SysAuthorizationViewDataServiceBase
	 */
	public async findByClientIdOnly(
		params: ISysAuthorizationViewDataServiceFindByClientIdOnlyParams
	): Promise<ISysAuthorizationView> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<
			ISysAuthorizationView,
			ISysAuthorizationViewDataServiceFindByClientIdOnlyParams
		>(`select * from sys_authorization_view where client_id = :client_id and redirect_uri is null`, params, {
			single: true
		});
		return result.data;
	}
}
