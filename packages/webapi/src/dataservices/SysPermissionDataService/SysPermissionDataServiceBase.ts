import {
	ISysPermissionDataServiceFindSysPermissionByIdParams,
	ISysPermissionDataServiceDeleteSysPermissionByIdFilter,
	ISysPermissionDataServiceUpdateSysPermissionByIdFilter
} from "./types";
import { ISysPermission } from "@porta/shared";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to manipulate the sys_permission table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysPermissionDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * Find a sys_permission record by
	 * @param {ISysPermissionDataServiceFindSysPermissionByIdParams}
	 * @returns {ISysPermission}
	 * @memberof SysPermissionDataServiceBase
	 */
	public async findSysPermissionById(
		params: ISysPermissionDataServiceFindSysPermissionByIdParams
	): Promise<ISysPermission> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysPermission, ISysPermissionDataServiceFindSysPermissionByIdParams>(
			`SELECT * FROM sys_permission WHERE id = :id`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Inserts a new record into sys_permission table
	 * @param {ISysPermission}
	 * @returns {ISysPermission}
	 * @memberof SysPermissionDataServiceBase
	 */
	public async insertIntoSysPermission(params: ISysPermission): Promise<ISysPermission> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysPermission, ISysPermission>(`sys_permission`, params, { single: true });
		return result.data;
	}

	/**
	 * Delete a sys_permission record by
	 * @param {Partial<ISysPermission>}
	 * @returns {void}
	 * @memberof SysPermissionDataServiceBase
	 */
	public async deleteSysPermissionById(
		filter: ISysPermissionDataServiceDeleteSysPermissionByIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysPermissionDataServiceDeleteSysPermissionByIdFilter>(
			`sys_permission`,
			filter,
			{ single: false }
		);
		return result;
	}

	/**
	 * Update a sys_permission record by
	 * @param {Partial<ISysPermission>}
	 * @returns {ISysPermission}
	 * @memberof SysPermissionDataServiceBase
	 */
	public async updateSysPermissionById(
		params: Partial<ISysPermission>,
		filter: ISysPermissionDataServiceUpdateSysPermissionByIdFilter
	): Promise<ISysPermission> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<
			ISysPermission,
			Partial<ISysPermission>,
			ISysPermissionDataServiceUpdateSysPermissionByIdFilter
		>(`sys_permission`, params, filter, { single: true });
		return result.data;
	}
}
