import {
	ISysClientDataServiceFindSysClientByIdParams,
	ISysClientDataServiceDeleteSysClientByIdFilter,
	ISysClientDataServiceUpdateSysClientByIdFilter,
	ISysClientDataServiceFindSysClientByClientIdParams
} from "./types";
import { ISysClient } from "@porta/shared";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to manipulate the sys_client table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysClientDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * Find a sys_client record by
	 * @param {ISysClientDataServiceFindSysClientByIdParams}
	 * @returns {ISysClient}
	 * @memberof SysClientDataServiceBase
	 */
	public async findSysClientById(params: ISysClientDataServiceFindSysClientByIdParams): Promise<ISysClient> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysClient, ISysClientDataServiceFindSysClientByIdParams>(
			`SELECT * FROM sys_client WHERE id = :id`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Inserts a new record into sys_client table
	 * @param {ISysClient}
	 * @returns {ISysClient}
	 * @memberof SysClientDataServiceBase
	 */
	public async insertIntoSysClient(params: ISysClient): Promise<ISysClient> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysClient, ISysClient>(`sys_client`, params, { single: true });
		return result.data;
	}

	/**
	 * Delete a sys_client record by
	 * @param {Partial<ISysClient>}
	 * @returns {void}
	 * @memberof SysClientDataServiceBase
	 */
	public async deleteSysClientById(
		filter: ISysClientDataServiceDeleteSysClientByIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysClientDataServiceDeleteSysClientByIdFilter>(`sys_client`, filter, {
			single: false
		});
		return result;
	}

	/**
	 * Update a sys_client record by
	 * @param {Partial<ISysClient>}
	 * @returns {ISysClient}
	 * @memberof SysClientDataServiceBase
	 */
	public async updateSysClientById(
		params: Partial<ISysClient>,
		filter: ISysClientDataServiceUpdateSysClientByIdFilter
	): Promise<ISysClient> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<
			ISysClient,
			Partial<ISysClient>,
			ISysClientDataServiceUpdateSysClientByIdFilter
		>(`sys_client`, params, filter, { single: true });
		return result.data;
	}

	/**
	 * Find a sys_client record by
	 * @param {ISysClientDataServiceFindSysClientByClientIdParams}
	 * @returns {ISysClient}
	 * @memberof SysClientDataServiceBase
	 */
	public async findSysClientByClientId(
		params: ISysClientDataServiceFindSysClientByClientIdParams
	): Promise<ISysClient> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysClient, ISysClientDataServiceFindSysClientByClientIdParams>(
			`SELECT * FROM sys_client WHERE client_id = :client_id`,
			params,
			{ single: true }
		);
		return result.data;
	}
}
