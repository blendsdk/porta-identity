import { DataService, ICountRecordsResult, IExecuteQueryReturnValue } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";
import { ISysUserMfa } from "@porta/shared";
import {
    ISysUserMfaDataServiceDeleteSysUserMfaByIdFilter,
    ISysUserMfaDataServiceFindSysUserMfaByIdParams,
    ISysUserMfaDataServiceUpdateSysUserMfaByIdFilter
} from "./types";

/**
 * Provides functionality to manipulate the sys_user_mfa table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysUserMfaDataServiceBase extends DataService<PostgreSQLExecutionContext> {
    /**
     * Find a sys_user_mfa record by
     * @param {ISysUserMfaDataServiceFindSysUserMfaByIdParams}
     * @returns {ISysUserMfa}
     * @memberof SysUserMfaDataServiceBase
     */
    public async findSysUserMfaById(params: ISysUserMfaDataServiceFindSysUserMfaByIdParams): Promise<ISysUserMfa> {
        const ctx = await this.getContext();
        const result = await ctx.executeQuery<ISysUserMfa, ISysUserMfaDataServiceFindSysUserMfaByIdParams>(
            `SELECT * FROM sys_user_mfa WHERE id = :id`,
            params,
            { single: true }
        );
        return result.data;
    }

    /**
     * Inserts a new record into sys_user_mfa table
     * @param {ISysUserMfa}
     * @returns {ISysUserMfa}
     * @memberof SysUserMfaDataServiceBase
     */
    public async insertIntoSysUserMfa(params: ISysUserMfa): Promise<ISysUserMfa> {
        const ctx = await this.getContext();
        const result = await ctx.insertRecord<ISysUserMfa, ISysUserMfa>(`sys_user_mfa`, params, { single: true });
        return result.data;
    }

    /**
     * Delete a sys_user_mfa record by
     * @param {Partial<ISysUserMfa>}
     * @returns {void}
     * @memberof SysUserMfaDataServiceBase
     */
    public async deleteSysUserMfaById(
        filter: ISysUserMfaDataServiceDeleteSysUserMfaByIdFilter
    ): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
        const ctx = await this.getContext();
        const result = await ctx.deleteRecords<ISysUserMfaDataServiceDeleteSysUserMfaByIdFilter>(
            `sys_user_mfa`,
            filter,
            {
                single: false
            }
        );
        return result;
    }

    /**
     * Update a sys_user_mfa record by
     * @param {Partial<ISysUserMfa>}
     * @returns {ISysUserMfa}
     * @memberof SysUserMfaDataServiceBase
     */
    public async updateSysUserMfaById(
        params: Partial<ISysUserMfa>,
        filter: ISysUserMfaDataServiceUpdateSysUserMfaByIdFilter
    ): Promise<ISysUserMfa> {
        const ctx = await this.getContext();
        const result = await ctx.updateRecords<
            ISysUserMfa,
            Partial<ISysUserMfa>,
            ISysUserMfaDataServiceUpdateSysUserMfaByIdFilter
        >(`sys_user_mfa`, params, filter, { single: true });
        return result.data;
    }
}
