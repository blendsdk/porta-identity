import {
	ISysSecretDataServiceFindSysSecretByIdParams,
	ISysSecretDataServiceDeleteSysSecretByIdFilter,
	ISysSecretDataServiceUpdateSysSecretByIdFilter
} from "./types";
import { ISysSecret } from "@porta/shared";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to manipulate the sys_secret table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysSecretDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * Find a sys_secret record by
	 * @param {ISysSecretDataServiceFindSysSecretByIdParams}
	 * @returns {ISysSecret}
	 * @memberof SysSecretDataServiceBase
	 */
	public async findSysSecretById(params: ISysSecretDataServiceFindSysSecretByIdParams): Promise<ISysSecret> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysSecret, ISysSecretDataServiceFindSysSecretByIdParams>(
			`SELECT * FROM sys_secret WHERE id = :id`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Inserts a new record into sys_secret table
	 * @param {ISysSecret}
	 * @returns {ISysSecret}
	 * @memberof SysSecretDataServiceBase
	 */
	public async insertIntoSysSecret(params: ISysSecret): Promise<ISysSecret> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysSecret, ISysSecret>(`sys_secret`, params, { single: true });
		return result.data;
	}

	/**
	 * Delete a sys_secret record by
	 * @param {Partial<ISysSecret>}
	 * @returns {void}
	 * @memberof SysSecretDataServiceBase
	 */
	public async deleteSysSecretById(
		filter: ISysSecretDataServiceDeleteSysSecretByIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysSecretDataServiceDeleteSysSecretByIdFilter>(`sys_secret`, filter, {
			single: false
		});
		return result;
	}

	/**
	 * Update a sys_secret record by
	 * @param {Partial<ISysSecret>}
	 * @returns {ISysSecret}
	 * @memberof SysSecretDataServiceBase
	 */
	public async updateSysSecretById(
		params: Partial<ISysSecret>,
		filter: ISysSecretDataServiceUpdateSysSecretByIdFilter
	): Promise<ISysSecret> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<
			ISysSecret,
			Partial<ISysSecret>,
			ISysSecretDataServiceUpdateSysSecretByIdFilter
		>(`sys_secret`, params, filter, { single: true });
		return result.data;
	}
}
