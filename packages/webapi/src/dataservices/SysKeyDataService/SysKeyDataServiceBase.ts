import {
	ISysKeyDataServiceFindSysKeyByIdParams,
	ISysKeyDataServiceDeleteSysKeyByIdFilter,
	ISysKeyDataServiceUpdateSysKeyByIdFilter,
	ISysKeyDataServiceFindSysKeyByKeyIdParams
} from "./types";
import { ISysKey } from "@porta/shared";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to manipulate the sys_key table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysKeyDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * Find a sys_key record by
	 * @param {ISysKeyDataServiceFindSysKeyByIdParams}
	 * @returns {ISysKey}
	 * @memberof SysKeyDataServiceBase
	 */
	public async findSysKeyById(params: ISysKeyDataServiceFindSysKeyByIdParams): Promise<ISysKey> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysKey, ISysKeyDataServiceFindSysKeyByIdParams>(
			`SELECT * FROM sys_key WHERE id = :id`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Inserts a new record into sys_key table
	 * @param {ISysKey}
	 * @returns {ISysKey}
	 * @memberof SysKeyDataServiceBase
	 */
	public async insertIntoSysKey(params: ISysKey): Promise<ISysKey> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysKey, ISysKey>(`sys_key`, params, { single: true });
		return result.data;
	}

	/**
	 * Delete a sys_key record by
	 * @param {Partial<ISysKey>}
	 * @returns {void}
	 * @memberof SysKeyDataServiceBase
	 */
	public async deleteSysKeyById(
		filter: ISysKeyDataServiceDeleteSysKeyByIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysKeyDataServiceDeleteSysKeyByIdFilter>(`sys_key`, filter, {
			single: false
		});
		return result;
	}

	/**
	 * Update a sys_key record by
	 * @param {Partial<ISysKey>}
	 * @returns {ISysKey}
	 * @memberof SysKeyDataServiceBase
	 */
	public async updateSysKeyById(
		params: Partial<ISysKey>,
		filter: ISysKeyDataServiceUpdateSysKeyByIdFilter
	): Promise<ISysKey> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<ISysKey, Partial<ISysKey>, ISysKeyDataServiceUpdateSysKeyByIdFilter>(
			`sys_key`,
			params,
			filter,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Find a sys_key record by
	 * @param {ISysKeyDataServiceFindSysKeyByKeyIdParams}
	 * @returns {ISysKey}
	 * @memberof SysKeyDataServiceBase
	 */
	public async findSysKeyByKeyId(params: ISysKeyDataServiceFindSysKeyByKeyIdParams): Promise<ISysKey> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysKey, ISysKeyDataServiceFindSysKeyByKeyIdParams>(
			`SELECT * FROM sys_key WHERE key_id = :key_id`,
			params,
			{ single: true }
		);
		return result.data;
	}
}
