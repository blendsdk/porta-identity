import {
	ISysSessionDataServiceFindSysSessionByIdParams,
	ISysSessionDataServiceDeleteSysSessionByIdFilter,
	ISysSessionDataServiceUpdateSysSessionByIdFilter
} from "./types";
import { ISysSession } from "@porta/shared";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to manipulate the sys_session table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysSessionDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * Find a sys_session record by
	 * @param {ISysSessionDataServiceFindSysSessionByIdParams}
	 * @returns {ISysSession}
	 * @memberof SysSessionDataServiceBase
	 */
	public async findSysSessionById(params: ISysSessionDataServiceFindSysSessionByIdParams): Promise<ISysSession> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysSession, ISysSessionDataServiceFindSysSessionByIdParams>(
			`SELECT * FROM sys_session WHERE id = :id`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Inserts a new record into sys_session table
	 * @param {ISysSession}
	 * @returns {ISysSession}
	 * @memberof SysSessionDataServiceBase
	 */
	public async insertIntoSysSession(params: ISysSession): Promise<ISysSession> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysSession, ISysSession>(`sys_session`, params, { single: true });
		return result.data;
	}

	/**
	 * Delete a sys_session record by
	 * @param {Partial<ISysSession>}
	 * @returns {void}
	 * @memberof SysSessionDataServiceBase
	 */
	public async deleteSysSessionById(
		filter: ISysSessionDataServiceDeleteSysSessionByIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysSessionDataServiceDeleteSysSessionByIdFilter>(`sys_session`, filter, {
			single: false
		});
		return result;
	}

	/**
	 * Update a sys_session record by
	 * @param {Partial<ISysSession>}
	 * @returns {ISysSession}
	 * @memberof SysSessionDataServiceBase
	 */
	public async updateSysSessionById(
		params: Partial<ISysSession>,
		filter: ISysSessionDataServiceUpdateSysSessionByIdFilter
	): Promise<ISysSession> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<
			ISysSession,
			Partial<ISysSession>,
			ISysSessionDataServiceUpdateSysSessionByIdFilter
		>(`sys_session`, params, filter, { single: true });
		return result.data;
	}
}
