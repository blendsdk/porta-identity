import { DataService, ICountRecordsResult, IExecuteQueryReturnValue } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";
import { ISysSession } from "@porta/shared";
import {
    ISysSessionDataServiceDeleteSysSessionByIdFilter,
    ISysSessionDataServiceDeleteSysSessionByUserIdAndClientIdFilter,
    ISysSessionDataServiceDeleteSysSessionByUserIdFilter,
    ISysSessionDataServiceFindSysSessionByIdParams,
    ISysSessionDataServiceFindSysSessionByUserIdAndClientIdParams,
    ISysSessionDataServiceUpdateSysSessionByIdFilter
} from "./types";

/**
 * Provides functionality to manipulate the sys_session table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysSessionDataServiceBase extends DataService<PostgreSQLExecutionContext> {
    /**
     * Delete a sys_session record by
     * @param {Partial<ISysSession>}
     * @returns {void}
     * @memberof SysSessionDataServiceBase
     */
    public async deleteSysSessionByUserId(
        filter: ISysSessionDataServiceDeleteSysSessionByUserIdFilter
    ): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
        const ctx = await this.getContext();
        const result = await ctx.deleteRecords<ISysSessionDataServiceDeleteSysSessionByUserIdFilter>(
            `sys_session`,
            filter,
            { single: false }
        );
        return result;
    }

    /**
     * Delete a sys_session record by  and
     * @param {Partial<ISysSession>}
     * @returns {void}
     * @memberof SysSessionDataServiceBase
     */
    public async deleteSysSessionByUserIdAndClientId(
        filter: ISysSessionDataServiceDeleteSysSessionByUserIdAndClientIdFilter
    ): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
        const ctx = await this.getContext();
        const result = await ctx.deleteRecords<ISysSessionDataServiceDeleteSysSessionByUserIdAndClientIdFilter>(
            `sys_session`,
            filter,
            { single: false }
        );
        return result;
    }

    /**
     * Find a sys_session record by
     * @param {ISysSessionDataServiceFindSysSessionByIdParams}
     * @returns {ISysSession}
     * @memberof SysSessionDataServiceBase
     */
    public async findSysSessionById(params: ISysSessionDataServiceFindSysSessionByIdParams): Promise<ISysSession> {
        const ctx = await this.getContext();
        const result = await ctx.executeQuery<ISysSession, ISysSessionDataServiceFindSysSessionByIdParams>(
            `SELECT * FROM sys_session WHERE id = :id`,
            params,
            { single: true }
        );
        return result.data;
    }

    /**
     * Inserts a new record into sys_session table
     * @param {ISysSession}
     * @returns {ISysSession}
     * @memberof SysSessionDataServiceBase
     */
    public async insertIntoSysSession(params: ISysSession): Promise<ISysSession> {
        const ctx = await this.getContext();
        const result = await ctx.insertRecord<ISysSession, ISysSession>(`sys_session`, params, { single: true });
        return result.data;
    }

    /**
     * Delete a sys_session record by
     * @param {Partial<ISysSession>}
     * @returns {void}
     * @memberof SysSessionDataServiceBase
     */
    public async deleteSysSessionById(
        filter: ISysSessionDataServiceDeleteSysSessionByIdFilter
    ): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
        const ctx = await this.getContext();
        const result = await ctx.deleteRecords<ISysSessionDataServiceDeleteSysSessionByIdFilter>(
            `sys_session`,
            filter,
            {
                single: false
            }
        );
        return result;
    }

    /**
     * Update a sys_session record by
     * @param {Partial<ISysSession>}
     * @returns {ISysSession}
     * @memberof SysSessionDataServiceBase
     */
    public async updateSysSessionById(
        params: Partial<ISysSession>,
        filter: ISysSessionDataServiceUpdateSysSessionByIdFilter
    ): Promise<ISysSession> {
        const ctx = await this.getContext();
        const result = await ctx.updateRecords<
            ISysSession,
            Partial<ISysSession>,
            ISysSessionDataServiceUpdateSysSessionByIdFilter
        >(`sys_session`, params, filter, { single: true });
        return result.data;
    }

    /**
     * Find a sys_session record by  and
     * @param {ISysSessionDataServiceFindSysSessionByUserIdAndClientIdParams}
     * @returns {ISysSession}
     * @memberof SysSessionDataServiceBase
     */
    public async findSysSessionByUserIdAndClientId(
        params: ISysSessionDataServiceFindSysSessionByUserIdAndClientIdParams
    ): Promise<ISysSession> {
        const ctx = await this.getContext();
        const result = await ctx.executeQuery<
            ISysSession,
            ISysSessionDataServiceFindSysSessionByUserIdAndClientIdParams
        >(`SELECT * FROM sys_session WHERE user_id = :user_id AND client_id = :client_id`, params, { single: true });
        return result.data;
    }
}
