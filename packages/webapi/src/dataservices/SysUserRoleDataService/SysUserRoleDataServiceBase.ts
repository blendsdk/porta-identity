import {
	ISysUserRoleDataServiceFindSysUserRoleByIdParams,
	ISysUserRoleDataServiceDeleteSysUserRoleByIdFilter,
	ISysUserRoleDataServiceUpdateSysUserRoleByIdFilter,
	ISysUserRoleDataServiceFindSysUserRoleByUserIdAndRoleIdParams
} from "./types";
import { ISysUserRole } from "@porta/shared";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to manipulate the sys_user_role table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysUserRoleDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * Find a sys_user_role record by
	 * @param {ISysUserRoleDataServiceFindSysUserRoleByIdParams}
	 * @returns {ISysUserRole}
	 * @memberof SysUserRoleDataServiceBase
	 */
	public async findSysUserRoleById(params: ISysUserRoleDataServiceFindSysUserRoleByIdParams): Promise<ISysUserRole> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysUserRole, ISysUserRoleDataServiceFindSysUserRoleByIdParams>(
			`SELECT * FROM sys_user_role WHERE id = :id`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Inserts a new record into sys_user_role table
	 * @param {ISysUserRole}
	 * @returns {ISysUserRole}
	 * @memberof SysUserRoleDataServiceBase
	 */
	public async insertIntoSysUserRole(params: ISysUserRole): Promise<ISysUserRole> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysUserRole, ISysUserRole>(`sys_user_role`, params, { single: true });
		return result.data;
	}

	/**
	 * Delete a sys_user_role record by
	 * @param {Partial<ISysUserRole>}
	 * @returns {void}
	 * @memberof SysUserRoleDataServiceBase
	 */
	public async deleteSysUserRoleById(
		filter: ISysUserRoleDataServiceDeleteSysUserRoleByIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysUserRoleDataServiceDeleteSysUserRoleByIdFilter>(
			`sys_user_role`,
			filter,
			{ single: false }
		);
		return result;
	}

	/**
	 * Update a sys_user_role record by
	 * @param {Partial<ISysUserRole>}
	 * @returns {ISysUserRole}
	 * @memberof SysUserRoleDataServiceBase
	 */
	public async updateSysUserRoleById(
		params: Partial<ISysUserRole>,
		filter: ISysUserRoleDataServiceUpdateSysUserRoleByIdFilter
	): Promise<ISysUserRole> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<
			ISysUserRole,
			Partial<ISysUserRole>,
			ISysUserRoleDataServiceUpdateSysUserRoleByIdFilter
		>(`sys_user_role`, params, filter, { single: true });
		return result.data;
	}

	/**
	 * Find a sys_user_role record by  and
	 * @param {ISysUserRoleDataServiceFindSysUserRoleByUserIdAndRoleIdParams}
	 * @returns {ISysUserRole}
	 * @memberof SysUserRoleDataServiceBase
	 */
	public async findSysUserRoleByUserIdAndRoleId(
		params: ISysUserRoleDataServiceFindSysUserRoleByUserIdAndRoleIdParams
	): Promise<ISysUserRole> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysUserRole, ISysUserRoleDataServiceFindSysUserRoleByUserIdAndRoleIdParams>(
			`SELECT * FROM sys_user_role WHERE user_id = :user_id AND role_id = :role_id`,
			params,
			{ single: true }
		);
		return result.data;
	}
}
