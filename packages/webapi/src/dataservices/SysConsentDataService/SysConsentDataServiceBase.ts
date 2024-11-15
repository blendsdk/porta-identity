import {
	ISysConsentDataServiceFindSysConsentByIdParams,
	ISysConsentDataServiceDeleteSysConsentByIdFilter,
	ISysConsentDataServiceUpdateSysConsentByIdFilter,
	ISysConsentDataServiceFindSysConsentByApplicationIdAndUserIdParams
} from "./types";
import { ISysConsent } from "@porta/shared";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to manipulate the sys_consent table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysConsentDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * Find a sys_consent record by
	 * @param {ISysConsentDataServiceFindSysConsentByIdParams}
	 * @returns {ISysConsent}
	 * @memberof SysConsentDataServiceBase
	 */
	public async findSysConsentById(params: ISysConsentDataServiceFindSysConsentByIdParams): Promise<ISysConsent> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysConsent, ISysConsentDataServiceFindSysConsentByIdParams>(
			`SELECT * FROM sys_consent WHERE id = :id`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Inserts a new record into sys_consent table
	 * @param {ISysConsent}
	 * @returns {ISysConsent}
	 * @memberof SysConsentDataServiceBase
	 */
	public async insertIntoSysConsent(params: ISysConsent): Promise<ISysConsent> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysConsent, ISysConsent>(`sys_consent`, params, { single: true });
		return result.data;
	}

	/**
	 * Delete a sys_consent record by
	 * @param {Partial<ISysConsent>}
	 * @returns {void}
	 * @memberof SysConsentDataServiceBase
	 */
	public async deleteSysConsentById(
		filter: ISysConsentDataServiceDeleteSysConsentByIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysConsentDataServiceDeleteSysConsentByIdFilter>(`sys_consent`, filter, {
			single: false
		});
		return result;
	}

	/**
	 * Update a sys_consent record by
	 * @param {Partial<ISysConsent>}
	 * @returns {ISysConsent}
	 * @memberof SysConsentDataServiceBase
	 */
	public async updateSysConsentById(
		params: Partial<ISysConsent>,
		filter: ISysConsentDataServiceUpdateSysConsentByIdFilter
	): Promise<ISysConsent> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<
			ISysConsent,
			Partial<ISysConsent>,
			ISysConsentDataServiceUpdateSysConsentByIdFilter
		>(`sys_consent`, params, filter, { single: true });
		return result.data;
	}

	/**
	 * Find a sys_consent record by  and
	 * @param {ISysConsentDataServiceFindSysConsentByApplicationIdAndUserIdParams}
	 * @returns {ISysConsent}
	 * @memberof SysConsentDataServiceBase
	 */
	public async findSysConsentByApplicationIdAndUserId(
		params: ISysConsentDataServiceFindSysConsentByApplicationIdAndUserIdParams
	): Promise<ISysConsent> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<
			ISysConsent,
			ISysConsentDataServiceFindSysConsentByApplicationIdAndUserIdParams
		>(`SELECT * FROM sys_consent WHERE application_id = :application_id AND user_id = :user_id`, params, {
			single: true
		});
		return result.data;
	}
}
