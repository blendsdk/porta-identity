import {
	ISysProfileDataServiceFindSysProfileByIdParams,
	ISysProfileDataServiceDeleteSysProfileByIdFilter,
	ISysProfileDataServiceUpdateSysProfileByIdFilter
} from "./types";
import { ISysProfile } from "@porta/shared";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to manipulate the sys_profile table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysProfileDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * Find a sys_profile record by
	 * @param {ISysProfileDataServiceFindSysProfileByIdParams}
	 * @returns {ISysProfile}
	 * @memberof SysProfileDataServiceBase
	 */
	public async findSysProfileById(params: ISysProfileDataServiceFindSysProfileByIdParams): Promise<ISysProfile> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysProfile, ISysProfileDataServiceFindSysProfileByIdParams>(
			`SELECT * FROM sys_profile WHERE id = :id`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Inserts a new record into sys_profile table
	 * @param {ISysProfile}
	 * @returns {ISysProfile}
	 * @memberof SysProfileDataServiceBase
	 */
	public async insertIntoSysProfile(params: ISysProfile): Promise<ISysProfile> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysProfile, ISysProfile>(`sys_profile`, params, { single: true });
		return result.data;
	}

	/**
	 * Delete a sys_profile record by
	 * @param {Partial<ISysProfile>}
	 * @returns {void}
	 * @memberof SysProfileDataServiceBase
	 */
	public async deleteSysProfileById(
		filter: ISysProfileDataServiceDeleteSysProfileByIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysProfileDataServiceDeleteSysProfileByIdFilter>(`sys_profile`, filter, {
			single: false
		});
		return result;
	}

	/**
	 * Update a sys_profile record by
	 * @param {Partial<ISysProfile>}
	 * @returns {ISysProfile}
	 * @memberof SysProfileDataServiceBase
	 */
	public async updateSysProfileById(
		params: Partial<ISysProfile>,
		filter: ISysProfileDataServiceUpdateSysProfileByIdFilter
	): Promise<ISysProfile> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<
			ISysProfile,
			Partial<ISysProfile>,
			ISysProfileDataServiceUpdateSysProfileByIdFilter
		>(`sys_profile`, params, filter, { single: true });
		return result.data;
	}
}
