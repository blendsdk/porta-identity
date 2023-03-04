import {
	ISysRedirectDataServiceFindSysRedirectByIdParams,
	ISysRedirectDataServiceDeleteSysRedirectByIdFilter,
	ISysRedirectDataServiceUpdateSysRedirectByIdFilter
} from "./types";
import { ISysRedirect } from "@porta/shared";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to manipulate the sys_redirect table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysRedirectDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * Find a sys_redirect record by
	 * @param {ISysRedirectDataServiceFindSysRedirectByIdParams}
	 * @returns {ISysRedirect}
	 * @memberof SysRedirectDataServiceBase
	 */
	public async findSysRedirectById(params: ISysRedirectDataServiceFindSysRedirectByIdParams): Promise<ISysRedirect> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysRedirect, ISysRedirectDataServiceFindSysRedirectByIdParams>(
			`SELECT * FROM sys_redirect WHERE id = :id`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Inserts a new record into sys_redirect table
	 * @param {ISysRedirect}
	 * @returns {ISysRedirect}
	 * @memberof SysRedirectDataServiceBase
	 */
	public async insertIntoSysRedirect(params: ISysRedirect): Promise<ISysRedirect> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysRedirect, ISysRedirect>(`sys_redirect`, params, { single: true });
		return result.data;
	}

	/**
	 * Delete a sys_redirect record by
	 * @param {Partial<ISysRedirect>}
	 * @returns {void}
	 * @memberof SysRedirectDataServiceBase
	 */
	public async deleteSysRedirectById(
		filter: ISysRedirectDataServiceDeleteSysRedirectByIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysRedirectDataServiceDeleteSysRedirectByIdFilter>(`sys_redirect`, filter, {
			single: false
		});
		return result;
	}

	/**
	 * Update a sys_redirect record by
	 * @param {Partial<ISysRedirect>}
	 * @returns {ISysRedirect}
	 * @memberof SysRedirectDataServiceBase
	 */
	public async updateSysRedirectById(
		params: Partial<ISysRedirect>,
		filter: ISysRedirectDataServiceUpdateSysRedirectByIdFilter
	): Promise<ISysRedirect> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<
			ISysRedirect,
			Partial<ISysRedirect>,
			ISysRedirectDataServiceUpdateSysRedirectByIdFilter
		>(`sys_redirect`, params, filter, { single: true });
		return result.data;
	}
}
