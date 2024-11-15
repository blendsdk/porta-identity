import {
	ISysMfaDataServiceFindSysMfaByIdParams,
	ISysMfaDataServiceDeleteSysMfaByIdFilter,
	ISysMfaDataServiceUpdateSysMfaByIdFilter,
	ISysMfaDataServiceFindSysMfaByNameParams
} from "./types";
import { ISysMfa } from "@porta/shared";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to manipulate the sys_mfa table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysMfaDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * Find a sys_mfa record by
	 * @param {ISysMfaDataServiceFindSysMfaByIdParams}
	 * @returns {ISysMfa}
	 * @memberof SysMfaDataServiceBase
	 */
	public async findSysMfaById(params: ISysMfaDataServiceFindSysMfaByIdParams): Promise<ISysMfa> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysMfa, ISysMfaDataServiceFindSysMfaByIdParams>(
			`SELECT * FROM sys_mfa WHERE id = :id`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Inserts a new record into sys_mfa table
	 * @param {ISysMfa}
	 * @returns {ISysMfa}
	 * @memberof SysMfaDataServiceBase
	 */
	public async insertIntoSysMfa(params: ISysMfa): Promise<ISysMfa> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysMfa, ISysMfa>(`sys_mfa`, params, { single: true });
		return result.data;
	}

	/**
	 * Delete a sys_mfa record by
	 * @param {Partial<ISysMfa>}
	 * @returns {void}
	 * @memberof SysMfaDataServiceBase
	 */
	public async deleteSysMfaById(
		filter: ISysMfaDataServiceDeleteSysMfaByIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysMfaDataServiceDeleteSysMfaByIdFilter>(`sys_mfa`, filter, {
			single: false
		});
		return result;
	}

	/**
	 * Update a sys_mfa record by
	 * @param {Partial<ISysMfa>}
	 * @returns {ISysMfa}
	 * @memberof SysMfaDataServiceBase
	 */
	public async updateSysMfaById(
		params: Partial<ISysMfa>,
		filter: ISysMfaDataServiceUpdateSysMfaByIdFilter
	): Promise<ISysMfa> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<ISysMfa, Partial<ISysMfa>, ISysMfaDataServiceUpdateSysMfaByIdFilter>(
			`sys_mfa`,
			params,
			filter,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Find a sys_mfa record by
	 * @param {ISysMfaDataServiceFindSysMfaByNameParams}
	 * @returns {ISysMfa}
	 * @memberof SysMfaDataServiceBase
	 */
	public async findSysMfaByName(params: ISysMfaDataServiceFindSysMfaByNameParams): Promise<ISysMfa> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysMfa, ISysMfaDataServiceFindSysMfaByNameParams>(
			`SELECT * FROM sys_mfa WHERE name = :name`,
			params,
			{ single: true }
		);
		return result.data;
	}
}
