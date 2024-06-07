import {
	ISysRolePermissionDataServiceFindSysRolePermissionByIdParams,
	ISysRolePermissionDataServiceDeleteSysRolePermissionByIdFilter,
	ISysRolePermissionDataServiceUpdateSysRolePermissionByIdFilter,
	ISysRolePermissionDataServiceFindSysRolePermissionByRoleIdAndPermissionIdParams
} from "./types";
import { ISysRolePermission } from "@porta/shared";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to manipulate the sys_role_permission table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysRolePermissionDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * Find a sys_role_permission record by
	 * @param {ISysRolePermissionDataServiceFindSysRolePermissionByIdParams}
	 * @returns {ISysRolePermission}
	 * @memberof SysRolePermissionDataServiceBase
	 */
	public async findSysRolePermissionById(
		params: ISysRolePermissionDataServiceFindSysRolePermissionByIdParams
	): Promise<ISysRolePermission> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<
			ISysRolePermission,
			ISysRolePermissionDataServiceFindSysRolePermissionByIdParams
		>(`SELECT * FROM sys_role_permission WHERE id = :id`, params, { single: true });
		return result.data;
	}

	/**
	 * Inserts a new record into sys_role_permission table
	 * @param {ISysRolePermission}
	 * @returns {ISysRolePermission}
	 * @memberof SysRolePermissionDataServiceBase
	 */
	public async insertIntoSysRolePermission(params: ISysRolePermission): Promise<ISysRolePermission> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysRolePermission, ISysRolePermission>(`sys_role_permission`, params, {
			single: true
		});
		return result.data;
	}

	/**
	 * Delete a sys_role_permission record by
	 * @param {Partial<ISysRolePermission>}
	 * @returns {void}
	 * @memberof SysRolePermissionDataServiceBase
	 */
	public async deleteSysRolePermissionById(
		filter: ISysRolePermissionDataServiceDeleteSysRolePermissionByIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysRolePermissionDataServiceDeleteSysRolePermissionByIdFilter>(
			`sys_role_permission`,
			filter,
			{ single: false }
		);
		return result;
	}

	/**
	 * Update a sys_role_permission record by
	 * @param {Partial<ISysRolePermission>}
	 * @returns {ISysRolePermission}
	 * @memberof SysRolePermissionDataServiceBase
	 */
	public async updateSysRolePermissionById(
		params: Partial<ISysRolePermission>,
		filter: ISysRolePermissionDataServiceUpdateSysRolePermissionByIdFilter
	): Promise<ISysRolePermission> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<
			ISysRolePermission,
			Partial<ISysRolePermission>,
			ISysRolePermissionDataServiceUpdateSysRolePermissionByIdFilter
		>(`sys_role_permission`, params, filter, { single: true });
		return result.data;
	}

	/**
	 * Find a sys_role_permission record by  and
	 * @param {ISysRolePermissionDataServiceFindSysRolePermissionByRoleIdAndPermissionIdParams}
	 * @returns {ISysRolePermission}
	 * @memberof SysRolePermissionDataServiceBase
	 */
	public async findSysRolePermissionByRoleIdAndPermissionId(
		params: ISysRolePermissionDataServiceFindSysRolePermissionByRoleIdAndPermissionIdParams
	): Promise<ISysRolePermission> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<
			ISysRolePermission,
			ISysRolePermissionDataServiceFindSysRolePermissionByRoleIdAndPermissionIdParams
		>(`SELECT * FROM sys_role_permission WHERE role_id = :role_id AND permission_id = :permission_id`, params, {
			single: true
		});
		return result.data;
	}
}
