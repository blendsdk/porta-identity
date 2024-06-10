import {
	ISysExtensionDataServiceFindSysExtensionByExtensionIdParams,
	ISysExtensionDataServiceDeleteSysExtensionByExtensionIdFilter,
	ISysExtensionDataServiceUpdateSysExtensionByExtensionIdFilter,
	ISysExtensionDataServiceFindSysExtensionByNameAndVersionParams
} from "./types";
import { ISysExtension } from "@porta/shared";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";
import { TExpressionRenderer } from "@blendsdk/expression";

/**
 * Provides functionality to manipulate the sys_extension table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysExtensionDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * Find a sys_extension record by
	 * @param {ISysExtensionDataServiceFindSysExtensionByExtensionIdParams}
	 * @returns {ISysExtension}
	 * @memberof SysExtensionDataServiceBase
	 */
	public async findSysExtensionByExtensionId(
		params: ISysExtensionDataServiceFindSysExtensionByExtensionIdParams
	): Promise<ISysExtension> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysExtension, ISysExtensionDataServiceFindSysExtensionByExtensionIdParams>(
			`SELECT * FROM sys_extension WHERE extension_id = :extension_id`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Inserts a new record into sys_extension table
	 * @param {ISysExtension}
	 * @returns {ISysExtension}
	 * @memberof SysExtensionDataServiceBase
	 */
	public async insertIntoSysExtension(params: ISysExtension): Promise<ISysExtension> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysExtension, ISysExtension>(`sys_extension`, params, { single: true });
		return result.data;
	}

	/**
	 * Delete a sys_extension record by
	 * @param {Partial<ISysExtension>}
	 * @returns {void}
	 * @memberof SysExtensionDataServiceBase
	 */
	public async deleteSysExtensionByExtensionId(
		filter: ISysExtensionDataServiceDeleteSysExtensionByExtensionIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysExtensionDataServiceDeleteSysExtensionByExtensionIdFilter>(
			`sys_extension`,
			filter,
			{ single: false }
		);
		return result;
	}

	/**
	 * Update a sys_extension record by
	 * @param {Partial<ISysExtension>}
	 * @returns {ISysExtension}
	 * @memberof SysExtensionDataServiceBase
	 */
	public async updateSysExtensionByExtensionId(
		params: Partial<ISysExtension>,
		filter: ISysExtensionDataServiceUpdateSysExtensionByExtensionIdFilter
	): Promise<ISysExtension> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<
			ISysExtension,
			Partial<ISysExtension>,
			ISysExtensionDataServiceUpdateSysExtensionByExtensionIdFilter
		>(`sys_extension`, params, filter, { single: true });
		return result.data;
	}

	/**
	 * Find a sys_extension record by  and
	 * @param {ISysExtensionDataServiceFindSysExtensionByNameAndVersionParams}
	 * @returns {ISysExtension}
	 * @memberof SysExtensionDataServiceBase
	 */
	public async findSysExtensionByNameAndVersion(
		params: ISysExtensionDataServiceFindSysExtensionByNameAndVersionParams
	): Promise<ISysExtension> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<
			ISysExtension,
			ISysExtensionDataServiceFindSysExtensionByNameAndVersionParams
		>(`SELECT * FROM sys_extension WHERE name = :name AND version = :version`, params, { single: true });
		return result.data;
	}

	/**
	 * List a sys_extension by expression syntax
	 * @param {void}
	 * @returns {ISysExtension[]}
	 * @memberof SysExtensionDataServiceBase
	 */
	public async listSysExtensionByExpression(params: TExpressionRenderer): Promise<ISysExtension[]> {
		const ctx = await this.getContext();
		const result = await ctx.listByExpression<ISysExtension[]>(`sys_extension`, params, { single: false });
		return result.data;
	}
}
