import { DataService, ICountRecordsResult, IExecuteQueryReturnValue } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";
import { ISysAccessToken } from "@porta/shared";
import {
    ISysAccessTokenDataServiceDeleteSysAccessTokenByAccessTokenFilter,
    ISysAccessTokenDataServiceDeleteSysAccessTokenByIdFilter,
    ISysAccessTokenDataServiceDeleteSysAccessTokenByUserIdAndClientIdFilter,
    ISysAccessTokenDataServiceDeleteSysAccessTokenByUserIdFilter,
    ISysAccessTokenDataServiceFindSysAccessTokenByAccessTokenParams,
    ISysAccessTokenDataServiceFindSysAccessTokenByIdParams,
    ISysAccessTokenDataServiceUpdateSysAccessTokenByIdFilter
} from "./types";

/**
 * Provides functionality to manipulate the sys_access_token table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysAccessTokenDataServiceBase extends DataService<PostgreSQLExecutionContext> {
    /**
     * Delete a sys_access_token record by
     * @param {Partial<ISysAccessToken>}
     * @returns {void}
     * @memberof SysAccessTokenDataServiceBase
     */
    public async deleteSysAccessTokenByAccessToken(
        filter: ISysAccessTokenDataServiceDeleteSysAccessTokenByAccessTokenFilter
    ): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
        const ctx = await this.getContext();
        const result = await ctx.deleteRecords<ISysAccessTokenDataServiceDeleteSysAccessTokenByAccessTokenFilter>(
            `sys_access_token`,
            filter,
            { single: false }
        );
        return result;
    }

    /**
     * Delete a sys_access_token record by
     * @param {Partial<ISysAccessToken>}
     * @returns {void}
     * @memberof SysAccessTokenDataServiceBase
     */
    public async deleteSysAccessTokenByUserId(
        filter: ISysAccessTokenDataServiceDeleteSysAccessTokenByUserIdFilter
    ): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
        const ctx = await this.getContext();
        const result = await ctx.deleteRecords<ISysAccessTokenDataServiceDeleteSysAccessTokenByUserIdFilter>(
            `sys_access_token`,
            filter,
            { single: false }
        );
        return result;
    }

    /**
     * Delete a sys_access_token record by  and
     * @param {Partial<ISysAccessToken>}
     * @returns {void}
     * @memberof SysAccessTokenDataServiceBase
     */
    public async deleteSysAccessTokenByUserIdAndClientId(
        filter: ISysAccessTokenDataServiceDeleteSysAccessTokenByUserIdAndClientIdFilter
    ): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
        const ctx = await this.getContext();
        const result = await ctx.deleteRecords<ISysAccessTokenDataServiceDeleteSysAccessTokenByUserIdAndClientIdFilter>(
            `sys_access_token`,
            filter,
            { single: false }
        );
        return result;
    }

    /**
     * Find a sys_access_token record by
     * @param {ISysAccessTokenDataServiceFindSysAccessTokenByIdParams}
     * @returns {ISysAccessToken}
     * @memberof SysAccessTokenDataServiceBase
     */
    public async findSysAccessTokenById(
        params: ISysAccessTokenDataServiceFindSysAccessTokenByIdParams
    ): Promise<ISysAccessToken> {
        const ctx = await this.getContext();
        const result = await ctx.executeQuery<ISysAccessToken, ISysAccessTokenDataServiceFindSysAccessTokenByIdParams>(
            `SELECT * FROM sys_access_token WHERE id = :id`,
            params,
            { single: true }
        );
        return result.data;
    }

    /**
     * Inserts a new record into sys_access_token table
     * @param {ISysAccessToken}
     * @returns {ISysAccessToken}
     * @memberof SysAccessTokenDataServiceBase
     */
    public async insertIntoSysAccessToken(params: ISysAccessToken): Promise<ISysAccessToken> {
        const ctx = await this.getContext();
        const result = await ctx.insertRecord<ISysAccessToken, ISysAccessToken>(`sys_access_token`, params, {
            single: true
        });
        return result.data;
    }

    /**
     * Delete a sys_access_token record by
     * @param {Partial<ISysAccessToken>}
     * @returns {void}
     * @memberof SysAccessTokenDataServiceBase
     */
    public async deleteSysAccessTokenById(
        filter: ISysAccessTokenDataServiceDeleteSysAccessTokenByIdFilter
    ): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
        const ctx = await this.getContext();
        const result = await ctx.deleteRecords<ISysAccessTokenDataServiceDeleteSysAccessTokenByIdFilter>(
            `sys_access_token`,
            filter,
            { single: false }
        );
        return result;
    }

    /**
     * Update a sys_access_token record by
     * @param {Partial<ISysAccessToken>}
     * @returns {ISysAccessToken}
     * @memberof SysAccessTokenDataServiceBase
     */
    public async updateSysAccessTokenById(
        params: Partial<ISysAccessToken>,
        filter: ISysAccessTokenDataServiceUpdateSysAccessTokenByIdFilter
    ): Promise<ISysAccessToken> {
        const ctx = await this.getContext();
        const result = await ctx.updateRecords<
            ISysAccessToken,
            Partial<ISysAccessToken>,
            ISysAccessTokenDataServiceUpdateSysAccessTokenByIdFilter
        >(`sys_access_token`, params, filter, { single: true });
        return result.data;
    }

    /**
     * Find a sys_access_token record by
     * @param {ISysAccessTokenDataServiceFindSysAccessTokenByAccessTokenParams}
     * @returns {ISysAccessToken}
     * @memberof SysAccessTokenDataServiceBase
     */
    public async findSysAccessTokenByAccessToken(
        params: ISysAccessTokenDataServiceFindSysAccessTokenByAccessTokenParams
    ): Promise<ISysAccessToken> {
        const ctx = await this.getContext();
        const result = await ctx.executeQuery<
            ISysAccessToken,
            ISysAccessTokenDataServiceFindSysAccessTokenByAccessTokenParams
        >(`SELECT * FROM sys_access_token WHERE access_token = :access_token`, params, { single: true });
        return result.data;
    }
}
