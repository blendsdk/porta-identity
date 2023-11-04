import {
	ISysRoleDataServiceFindSysRoleByIdParams,
	ISysRoleDataServiceDeleteSysRoleByIdFilter,
	ISysRoleDataServiceUpdateSysRoleByIdFilter,
	ISysRoleDataServiceFindSysRoleByRoleParams
} from "./types";
import { ISysRole } from "@porta/shared";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to manipulate the sys_role table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysRoleDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * Find a sys_role record by
	 * @param {ISysRoleDataServiceFindSysRoleByIdParams}
	 * @returns {ISysRole}
	 * @memberof SysRoleDataServiceBase
	 */
	public async findSysRoleById(params: ISysRoleDataServiceFindSysRoleByIdParams): Promise<ISysRole> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysRole, ISysRoleDataServiceFindSysRoleByIdParams>(
			`SELECT * FROM sys_role WHERE id = :id`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Inserts a new record into sys_role table
	 * @param {ISysRole}
	 * @returns {ISysRole}
	 * @memberof SysRoleDataServiceBase
	 */
	public async insertIntoSysRole(params: ISysRole): Promise<ISysRole> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysRole, ISysRole>(`sys_role`, params, { single: true });
		return result.data;
	}

	/**
	 * Delete a sys_role record by
	 * @param {Partial<ISysRole>}
	 * @returns {void}
	 * @memberof SysRoleDataServiceBase
	 */
	public async deleteSysRoleById(
		filter: ISysRoleDataServiceDeleteSysRoleByIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysRoleDataServiceDeleteSysRoleByIdFilter>(`sys_role`, filter, {
			single: false
		});
		return result;
	}

	/**
	 * Update a sys_role record by
	 * @param {Partial<ISysRole>}
	 * @returns {ISysRole}
	 * @memberof SysRoleDataServiceBase
	 */
	public async updateSysRoleById(
		params: Partial<ISysRole>,
		filter: ISysRoleDataServiceUpdateSysRoleByIdFilter
	): Promise<ISysRole> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<ISysRole, Partial<ISysRole>, ISysRoleDataServiceUpdateSysRoleByIdFilter>(
			`sys_role`,
			params,
			filter,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Find a sys_role record by
	 * @param {ISysRoleDataServiceFindSysRoleByRoleParams}
	 * @returns {ISysRole}
	 * @memberof SysRoleDataServiceBase
	 */
	public async findSysRoleByRole(params: ISysRoleDataServiceFindSysRoleByRoleParams): Promise<ISysRole> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysRole, ISysRoleDataServiceFindSysRoleByRoleParams>(
			`SELECT * FROM sys_role WHERE role = :role`,
			params,
			{ single: true }
		);
		return result.data;
	}
}
