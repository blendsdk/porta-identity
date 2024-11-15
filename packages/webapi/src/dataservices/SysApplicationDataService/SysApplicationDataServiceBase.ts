import {
	ISysApplicationDataServiceFindSysApplicationByIdParams,
	ISysApplicationDataServiceDeleteSysApplicationByIdFilter,
	ISysApplicationDataServiceUpdateSysApplicationByIdFilter,
	ISysApplicationDataServiceFindSysApplicationByClientIdParams
} from "./types";
import { ISysApplication } from "@porta/shared";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to manipulate the sys_application table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysApplicationDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * Find a sys_application record by
	 * @param {ISysApplicationDataServiceFindSysApplicationByIdParams}
	 * @returns {ISysApplication}
	 * @memberof SysApplicationDataServiceBase
	 */
	public async findSysApplicationById(
		params: ISysApplicationDataServiceFindSysApplicationByIdParams
	): Promise<ISysApplication> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysApplication, ISysApplicationDataServiceFindSysApplicationByIdParams>(
			`SELECT * FROM sys_application WHERE id = :id`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Inserts a new record into sys_application table
	 * @param {ISysApplication}
	 * @returns {ISysApplication}
	 * @memberof SysApplicationDataServiceBase
	 */
	public async insertIntoSysApplication(params: ISysApplication): Promise<ISysApplication> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysApplication, ISysApplication>(`sys_application`, params, {
			single: true
		});
		return result.data;
	}

	/**
	 * Delete a sys_application record by
	 * @param {Partial<ISysApplication>}
	 * @returns {void}
	 * @memberof SysApplicationDataServiceBase
	 */
	public async deleteSysApplicationById(
		filter: ISysApplicationDataServiceDeleteSysApplicationByIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysApplicationDataServiceDeleteSysApplicationByIdFilter>(
			`sys_application`,
			filter,
			{ single: false }
		);
		return result;
	}

	/**
	 * Update a sys_application record by
	 * @param {Partial<ISysApplication>}
	 * @returns {ISysApplication}
	 * @memberof SysApplicationDataServiceBase
	 */
	public async updateSysApplicationById(
		params: Partial<ISysApplication>,
		filter: ISysApplicationDataServiceUpdateSysApplicationByIdFilter
	): Promise<ISysApplication> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<
			ISysApplication,
			Partial<ISysApplication>,
			ISysApplicationDataServiceUpdateSysApplicationByIdFilter
		>(`sys_application`, params, filter, { single: true });
		return result.data;
	}

	/**
	 * Find a sys_application record by
	 * @param {ISysApplicationDataServiceFindSysApplicationByClientIdParams}
	 * @returns {ISysApplication}
	 * @memberof SysApplicationDataServiceBase
	 */
	public async findSysApplicationByClientId(
		params: ISysApplicationDataServiceFindSysApplicationByClientIdParams
	): Promise<ISysApplication> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<
			ISysApplication,
			ISysApplicationDataServiceFindSysApplicationByClientIdParams
		>(`SELECT * FROM sys_application WHERE client_id = :client_id`, params, { single: true });
		return result.data;
	}
}
