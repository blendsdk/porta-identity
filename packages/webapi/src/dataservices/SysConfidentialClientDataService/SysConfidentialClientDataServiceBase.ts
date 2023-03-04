import {
	ISysConfidentialClientDataServiceFindSysConfidentialClientByIdParams,
	ISysConfidentialClientDataServiceDeleteSysConfidentialClientByIdFilter,
	ISysConfidentialClientDataServiceUpdateSysConfidentialClientByIdFilter
} from "./types";
import { ISysConfidentialClient } from "@porta/shared";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to manipulate the sys_confidential_client table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysConfidentialClientDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * Find a sys_confidential_client record by
	 * @param {ISysConfidentialClientDataServiceFindSysConfidentialClientByIdParams}
	 * @returns {ISysConfidentialClient}
	 * @memberof SysConfidentialClientDataServiceBase
	 */
	public async findSysConfidentialClientById(
		params: ISysConfidentialClientDataServiceFindSysConfidentialClientByIdParams
	): Promise<ISysConfidentialClient> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<
			ISysConfidentialClient,
			ISysConfidentialClientDataServiceFindSysConfidentialClientByIdParams
		>(`SELECT * FROM sys_confidential_client WHERE id = :id`, params, { single: true });
		return result.data;
	}

	/**
	 * Inserts a new record into sys_confidential_client table
	 * @param {ISysConfidentialClient}
	 * @returns {ISysConfidentialClient}
	 * @memberof SysConfidentialClientDataServiceBase
	 */
	public async insertIntoSysConfidentialClient(params: ISysConfidentialClient): Promise<ISysConfidentialClient> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysConfidentialClient, ISysConfidentialClient>(
			`sys_confidential_client`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Delete a sys_confidential_client record by
	 * @param {Partial<ISysConfidentialClient>}
	 * @returns {void}
	 * @memberof SysConfidentialClientDataServiceBase
	 */
	public async deleteSysConfidentialClientById(
		filter: ISysConfidentialClientDataServiceDeleteSysConfidentialClientByIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysConfidentialClientDataServiceDeleteSysConfidentialClientByIdFilter>(
			`sys_confidential_client`,
			filter,
			{ single: false }
		);
		return result;
	}

	/**
	 * Update a sys_confidential_client record by
	 * @param {Partial<ISysConfidentialClient>}
	 * @returns {ISysConfidentialClient}
	 * @memberof SysConfidentialClientDataServiceBase
	 */
	public async updateSysConfidentialClientById(
		params: Partial<ISysConfidentialClient>,
		filter: ISysConfidentialClientDataServiceUpdateSysConfidentialClientByIdFilter
	): Promise<ISysConfidentialClient> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<
			ISysConfidentialClient,
			Partial<ISysConfidentialClient>,
			ISysConfidentialClientDataServiceUpdateSysConfidentialClientByIdFilter
		>(`sys_confidential_client`, params, filter, { single: true });
		return result.data;
	}
}
