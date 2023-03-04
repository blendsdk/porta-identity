import {
	ISysClientTypeDataServiceFindSysClientTypeByIdParams,
	ISysClientTypeDataServiceDeleteSysClientTypeByIdFilter,
	ISysClientTypeDataServiceUpdateSysClientTypeByIdFilter
} from "./types";
import { ISysClientType } from "@porta/shared";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to manipulate the sys_client_type table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysClientTypeDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * Find a sys_client_type record by
	 * @param {ISysClientTypeDataServiceFindSysClientTypeByIdParams}
	 * @returns {ISysClientType}
	 * @memberof SysClientTypeDataServiceBase
	 */
	public async findSysClientTypeById(
		params: ISysClientTypeDataServiceFindSysClientTypeByIdParams
	): Promise<ISysClientType> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysClientType, ISysClientTypeDataServiceFindSysClientTypeByIdParams>(
			`SELECT * FROM sys_client_type WHERE id = :id`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Inserts a new record into sys_client_type table
	 * @param {ISysClientType}
	 * @returns {ISysClientType}
	 * @memberof SysClientTypeDataServiceBase
	 */
	public async insertIntoSysClientType(params: ISysClientType): Promise<ISysClientType> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysClientType, ISysClientType>(`sys_client_type`, params, { single: true });
		return result.data;
	}

	/**
	 * Delete a sys_client_type record by
	 * @param {Partial<ISysClientType>}
	 * @returns {void}
	 * @memberof SysClientTypeDataServiceBase
	 */
	public async deleteSysClientTypeById(
		filter: ISysClientTypeDataServiceDeleteSysClientTypeByIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysClientTypeDataServiceDeleteSysClientTypeByIdFilter>(
			`sys_client_type`,
			filter,
			{ single: false }
		);
		return result;
	}

	/**
	 * Update a sys_client_type record by
	 * @param {Partial<ISysClientType>}
	 * @returns {ISysClientType}
	 * @memberof SysClientTypeDataServiceBase
	 */
	public async updateSysClientTypeById(
		params: Partial<ISysClientType>,
		filter: ISysClientTypeDataServiceUpdateSysClientTypeByIdFilter
	): Promise<ISysClientType> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<
			ISysClientType,
			Partial<ISysClientType>,
			ISysClientTypeDataServiceUpdateSysClientTypeByIdFilter
		>(`sys_client_type`, params, filter, { single: true });
		return result.data;
	}
}
