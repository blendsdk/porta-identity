import {
	ISysGroupDataServiceFindSysGroupByIdParams,
	ISysGroupDataServiceDeleteSysGroupByIdFilter,
	ISysGroupDataServiceUpdateSysGroupByIdFilter,
	ISysGroupDataServiceFindSysGroupByNameParams
} from "./types";
import { ISysGroup } from "@porta/shared";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to manipulate the sys_group table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysGroupDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * Find a sys_group record by
	 * @param {ISysGroupDataServiceFindSysGroupByIdParams}
	 * @returns {ISysGroup}
	 * @memberof SysGroupDataServiceBase
	 */
	public async findSysGroupById(params: ISysGroupDataServiceFindSysGroupByIdParams): Promise<ISysGroup> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysGroup, ISysGroupDataServiceFindSysGroupByIdParams>(
			`SELECT * FROM sys_group WHERE id = :id`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Inserts a new record into sys_group table
	 * @param {ISysGroup}
	 * @returns {ISysGroup}
	 * @memberof SysGroupDataServiceBase
	 */
	public async insertIntoSysGroup(params: ISysGroup): Promise<ISysGroup> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysGroup, ISysGroup>(`sys_group`, params, { single: true });
		return result.data;
	}

	/**
	 * Delete a sys_group record by
	 * @param {Partial<ISysGroup>}
	 * @returns {void}
	 * @memberof SysGroupDataServiceBase
	 */
	public async deleteSysGroupById(
		filter: ISysGroupDataServiceDeleteSysGroupByIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysGroupDataServiceDeleteSysGroupByIdFilter>(`sys_group`, filter, {
			single: false
		});
		return result;
	}

	/**
	 * Update a sys_group record by
	 * @param {Partial<ISysGroup>}
	 * @returns {ISysGroup}
	 * @memberof SysGroupDataServiceBase
	 */
	public async updateSysGroupById(
		params: Partial<ISysGroup>,
		filter: ISysGroupDataServiceUpdateSysGroupByIdFilter
	): Promise<ISysGroup> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<ISysGroup, Partial<ISysGroup>, ISysGroupDataServiceUpdateSysGroupByIdFilter>(
			`sys_group`,
			params,
			filter,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Find a sys_group record by
	 * @param {ISysGroupDataServiceFindSysGroupByNameParams}
	 * @returns {ISysGroup}
	 * @memberof SysGroupDataServiceBase
	 */
	public async findSysGroupByName(params: ISysGroupDataServiceFindSysGroupByNameParams): Promise<ISysGroup> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysGroup, ISysGroupDataServiceFindSysGroupByNameParams>(
			`SELECT * FROM sys_group WHERE name = :name`,
			params,
			{ single: true }
		);
		return result.data;
	}
}
