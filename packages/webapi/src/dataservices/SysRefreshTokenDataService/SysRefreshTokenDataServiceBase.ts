import { DataService, ICountRecordsResult, IExecuteQueryReturnValue } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";
import { ISysRefreshToken } from "@porta/shared";
import {
    ISysRefreshTokenDataServiceDeleteSysRefreshTokenByIdFilter,
    ISysRefreshTokenDataServiceDeleteSysRefreshTokenByRefreshTokenFilter,
    ISysRefreshTokenDataServiceFindSysRefreshTokenByIdParams,
    ISysRefreshTokenDataServiceFindSysRefreshTokenByRefreshTokenParams,
    ISysRefreshTokenDataServiceUpdateSysRefreshTokenByIdFilter
} from "./types";

/**
 * Provides functionality to manipulate the sys_refresh_token table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysRefreshTokenDataServiceBase extends DataService<PostgreSQLExecutionContext> {
    /**
     * Delete a sys_refresh_token record by
     * @param {Partial<ISysRefreshToken>}
     * @returns {void}
     * @memberof SysRefreshTokenDataServiceBase
     */
    public async deleteSysRefreshTokenByRefreshToken(
        filter: ISysRefreshTokenDataServiceDeleteSysRefreshTokenByRefreshTokenFilter
    ): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
        const ctx = await this.getContext();
        const result = await ctx.deleteRecords<ISysRefreshTokenDataServiceDeleteSysRefreshTokenByRefreshTokenFilter>(
            `sys_refresh_token`,
            filter,
            { single: false }
        );
        return result;
    }

    /**
     * Find a sys_refresh_token record by
     * @param {ISysRefreshTokenDataServiceFindSysRefreshTokenByIdParams}
     * @returns {ISysRefreshToken}
     * @memberof SysRefreshTokenDataServiceBase
     */
    public async findSysRefreshTokenById(
        params: ISysRefreshTokenDataServiceFindSysRefreshTokenByIdParams
    ): Promise<ISysRefreshToken> {
        const ctx = await this.getContext();
        const result = await ctx.executeQuery<
            ISysRefreshToken,
            ISysRefreshTokenDataServiceFindSysRefreshTokenByIdParams
        >(`SELECT * FROM sys_refresh_token WHERE id = :id`, params, { single: true });
        return result.data;
    }

    /**
     * Inserts a new record into sys_refresh_token table
     * @param {ISysRefreshToken}
     * @returns {ISysRefreshToken}
     * @memberof SysRefreshTokenDataServiceBase
     */
    public async insertIntoSysRefreshToken(params: ISysRefreshToken): Promise<ISysRefreshToken> {
        const ctx = await this.getContext();
        const result = await ctx.insertRecord<ISysRefreshToken, ISysRefreshToken>(`sys_refresh_token`, params, {
            single: true
        });
        return result.data;
    }

    /**
     * Delete a sys_refresh_token record by
     * @param {Partial<ISysRefreshToken>}
     * @returns {void}
     * @memberof SysRefreshTokenDataServiceBase
     */
    public async deleteSysRefreshTokenById(
        filter: ISysRefreshTokenDataServiceDeleteSysRefreshTokenByIdFilter
    ): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
        const ctx = await this.getContext();
        const result = await ctx.deleteRecords<ISysRefreshTokenDataServiceDeleteSysRefreshTokenByIdFilter>(
            `sys_refresh_token`,
            filter,
            { single: false }
        );
        return result;
    }

    /**
     * Update a sys_refresh_token record by
     * @param {Partial<ISysRefreshToken>}
     * @returns {ISysRefreshToken}
     * @memberof SysRefreshTokenDataServiceBase
     */
    public async updateSysRefreshTokenById(
        params: Partial<ISysRefreshToken>,
        filter: ISysRefreshTokenDataServiceUpdateSysRefreshTokenByIdFilter
    ): Promise<ISysRefreshToken> {
        const ctx = await this.getContext();
        const result = await ctx.updateRecords<
            ISysRefreshToken,
            Partial<ISysRefreshToken>,
            ISysRefreshTokenDataServiceUpdateSysRefreshTokenByIdFilter
        >(`sys_refresh_token`, params, filter, { single: true });
        return result.data;
    }

    /**
     * Find a sys_refresh_token record by
     * @param {ISysRefreshTokenDataServiceFindSysRefreshTokenByRefreshTokenParams}
     * @returns {ISysRefreshToken}
     * @memberof SysRefreshTokenDataServiceBase
     */
    public async findSysRefreshTokenByRefreshToken(
        params: ISysRefreshTokenDataServiceFindSysRefreshTokenByRefreshTokenParams
    ): Promise<ISysRefreshToken> {
        const ctx = await this.getContext();
        const result = await ctx.executeQuery<
            ISysRefreshToken,
            ISysRefreshTokenDataServiceFindSysRefreshTokenByRefreshTokenParams
        >(`SELECT * FROM sys_refresh_token WHERE refresh_token = :refresh_token`, params, { single: true });
        return result.data;
    }
}
