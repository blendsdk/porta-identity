import {
	ISysApplicationSessionDataServiceFindSysApplicationSessionBySessionIdParams,
	ISysApplicationSessionDataServiceFindSysApplicationSessionByIdParams,
	ISysApplicationSessionDataServiceDeleteSysApplicationSessionByIdFilter,
	ISysApplicationSessionDataServiceUpdateSysApplicationSessionByIdFilter
} from "./types";
import { ISysApplicationSession } from "@porta/shared";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to manipulate the sys_application_session table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysApplicationSessionDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * Find a sys_application_session record by
	 * @param {ISysApplicationSessionDataServiceFindSysApplicationSessionBySessionIdParams}
	 * @returns {ISysApplicationSession}
	 * @memberof SysApplicationSessionDataServiceBase
	 */
	public async findSysApplicationSessionBySessionId(
		params: ISysApplicationSessionDataServiceFindSysApplicationSessionBySessionIdParams
	): Promise<ISysApplicationSession> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<
			ISysApplicationSession,
			ISysApplicationSessionDataServiceFindSysApplicationSessionBySessionIdParams
		>(`SELECT * FROM sys_application_session WHERE session_id = :session_id`, params, { single: true });
		return result.data;
	}

	/**
	 * Find a sys_application_session record by
	 * @param {ISysApplicationSessionDataServiceFindSysApplicationSessionByIdParams}
	 * @returns {ISysApplicationSession}
	 * @memberof SysApplicationSessionDataServiceBase
	 */
	public async findSysApplicationSessionById(
		params: ISysApplicationSessionDataServiceFindSysApplicationSessionByIdParams
	): Promise<ISysApplicationSession> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<
			ISysApplicationSession,
			ISysApplicationSessionDataServiceFindSysApplicationSessionByIdParams
		>(`SELECT * FROM sys_application_session WHERE id = :id`, params, { single: true });
		return result.data;
	}

	/**
	 * Inserts a new record into sys_application_session table
	 * @param {ISysApplicationSession}
	 * @returns {ISysApplicationSession}
	 * @memberof SysApplicationSessionDataServiceBase
	 */
	public async insertIntoSysApplicationSession(params: ISysApplicationSession): Promise<ISysApplicationSession> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysApplicationSession, ISysApplicationSession>(
			`sys_application_session`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Delete a sys_application_session record by
	 * @param {Partial<ISysApplicationSession>}
	 * @returns {void}
	 * @memberof SysApplicationSessionDataServiceBase
	 */
	public async deleteSysApplicationSessionById(
		filter: ISysApplicationSessionDataServiceDeleteSysApplicationSessionByIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysApplicationSessionDataServiceDeleteSysApplicationSessionByIdFilter>(
			`sys_application_session`,
			filter,
			{ single: false }
		);
		return result;
	}

	/**
	 * Update a sys_application_session record by
	 * @param {Partial<ISysApplicationSession>}
	 * @returns {ISysApplicationSession}
	 * @memberof SysApplicationSessionDataServiceBase
	 */
	public async updateSysApplicationSessionById(
		params: Partial<ISysApplicationSession>,
		filter: ISysApplicationSessionDataServiceUpdateSysApplicationSessionByIdFilter
	): Promise<ISysApplicationSession> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<
			ISysApplicationSession,
			Partial<ISysApplicationSession>,
			ISysApplicationSessionDataServiceUpdateSysApplicationSessionByIdFilter
		>(`sys_application_session`, params, filter, { single: true });
		return result.data;
	}
}
