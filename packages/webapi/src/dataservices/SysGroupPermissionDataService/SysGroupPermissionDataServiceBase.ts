import {
	ISysGroupPermissionDataServiceFindSysGroupPermissionByIdParams,
	ISysGroupPermissionDataServiceDeleteSysGroupPermissionByIdFilter,
	ISysGroupPermissionDataServiceUpdateSysGroupPermissionByIdFilter
} from "./types";
import { ISysGroupPermission } from "@porta/shared";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to manipulate the sys_group_permission table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysGroupPermissionDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * Find a sys_group_permission record by
	 * @param {ISysGroupPermissionDataServiceFindSysGroupPermissionByIdParams}
	 * @returns {ISysGroupPermission}
	 * @memberof SysGroupPermissionDataServiceBase
	 */
	public async findSysGroupPermissionById(
		params: ISysGroupPermissionDataServiceFindSysGroupPermissionByIdParams
	): Promise<ISysGroupPermission> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<
			ISysGroupPermission,
			ISysGroupPermissionDataServiceFindSysGroupPermissionByIdParams
		>(`SELECT * FROM sys_group_permission WHERE id = :id`, params, { single: true });
		return result.data;
	}

	/**
	 * Inserts a new record into sys_group_permission table
	 * @param {ISysGroupPermission}
	 * @returns {ISysGroupPermission}
	 * @memberof SysGroupPermissionDataServiceBase
	 */
	public async insertIntoSysGroupPermission(params: ISysGroupPermission): Promise<ISysGroupPermission> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysGroupPermission, ISysGroupPermission>(`sys_group_permission`, params, {
			single: true
		});
		return result.data;
	}

	/**
	 * Delete a sys_group_permission record by
	 * @param {Partial<ISysGroupPermission>}
	 * @returns {void}
	 * @memberof SysGroupPermissionDataServiceBase
	 */
	public async deleteSysGroupPermissionById(
		filter: ISysGroupPermissionDataServiceDeleteSysGroupPermissionByIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysGroupPermissionDataServiceDeleteSysGroupPermissionByIdFilter>(
			`sys_group_permission`,
			filter,
			{ single: false }
		);
		return result;
	}

	/**
	 * Update a sys_group_permission record by
	 * @param {Partial<ISysGroupPermission>}
	 * @returns {ISysGroupPermission}
	 * @memberof SysGroupPermissionDataServiceBase
	 */
	public async updateSysGroupPermissionById(
		params: Partial<ISysGroupPermission>,
		filter: ISysGroupPermissionDataServiceUpdateSysGroupPermissionByIdFilter
	): Promise<ISysGroupPermission> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<
			ISysGroupPermission,
			Partial<ISysGroupPermission>,
			ISysGroupPermissionDataServiceUpdateSysGroupPermissionByIdFilter
		>(`sys_group_permission`, params, filter, { single: true });
		return result.data;
	}
}
