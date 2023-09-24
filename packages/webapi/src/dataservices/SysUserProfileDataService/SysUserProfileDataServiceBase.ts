import { DataService, ICountRecordsResult, IExecuteQueryReturnValue } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";
import { ISysUserProfile } from "@porta/shared";
import {
    ISysUserProfileDataServiceDeleteSysUserProfileByIdFilter,
    ISysUserProfileDataServiceFindSysUserProfileByIdParams,
    ISysUserProfileDataServiceFindUserProfileByUserIdParams,
    ISysUserProfileDataServiceUpdateSysUserProfileByIdFilter
} from "./types";

/**
 * Provides functionality to manipulate the sys_user_profile table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysUserProfileDataServiceBase extends DataService<PostgreSQLExecutionContext> {
    /**
     * @param {ISysUserProfileDataServiceFindUserProfileByUserIdParams}
     * @returns {ISysUserProfile}
     * @memberof SysUserProfileDataServiceBase
     */
    public async findUserProfileByUserId(
        params: ISysUserProfileDataServiceFindUserProfileByUserIdParams
    ): Promise<ISysUserProfile> {
        const ctx = await this.getContext();
        const result = await ctx.executeQuery<ISysUserProfile, ISysUserProfileDataServiceFindUserProfileByUserIdParams>(
            `SELECT * FROM sys_user_profile WHERE user_id = :user_id::uuid`,
            params,
            { single: true }
        );
        return result.data;
    }

    /**
     * Find a sys_user_profile record by
     * @param {ISysUserProfileDataServiceFindSysUserProfileByIdParams}
     * @returns {ISysUserProfile}
     * @memberof SysUserProfileDataServiceBase
     */
    public async findSysUserProfileById(
        params: ISysUserProfileDataServiceFindSysUserProfileByIdParams
    ): Promise<ISysUserProfile> {
        const ctx = await this.getContext();
        const result = await ctx.executeQuery<ISysUserProfile, ISysUserProfileDataServiceFindSysUserProfileByIdParams>(
            `SELECT * FROM sys_user_profile WHERE id = :id`,
            params,
            { single: true }
        );
        return result.data;
    }

    /**
     * Inserts a new record into sys_user_profile table
     * @param {ISysUserProfile}
     * @returns {ISysUserProfile}
     * @memberof SysUserProfileDataServiceBase
     */
    public async insertIntoSysUserProfile(params: ISysUserProfile): Promise<ISysUserProfile> {
        const ctx = await this.getContext();
        const result = await ctx.insertRecord<ISysUserProfile, ISysUserProfile>(`sys_user_profile`, params, {
            single: true
        });
        return result.data;
    }

    /**
     * Delete a sys_user_profile record by
     * @param {Partial<ISysUserProfile>}
     * @returns {void}
     * @memberof SysUserProfileDataServiceBase
     */
    public async deleteSysUserProfileById(
        filter: ISysUserProfileDataServiceDeleteSysUserProfileByIdFilter
    ): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
        const ctx = await this.getContext();
        const result = await ctx.deleteRecords<ISysUserProfileDataServiceDeleteSysUserProfileByIdFilter>(
            `sys_user_profile`,
            filter,
            { single: false }
        );
        return result;
    }

    /**
     * Update a sys_user_profile record by
     * @param {Partial<ISysUserProfile>}
     * @returns {ISysUserProfile}
     * @memberof SysUserProfileDataServiceBase
     */
    public async updateSysUserProfileById(
        params: Partial<ISysUserProfile>,
        filter: ISysUserProfileDataServiceUpdateSysUserProfileByIdFilter
    ): Promise<ISysUserProfile> {
        const ctx = await this.getContext();
        const result = await ctx.updateRecords<
            ISysUserProfile,
            Partial<ISysUserProfile>,
            ISysUserProfileDataServiceUpdateSysUserProfileByIdFilter
        >(`sys_user_profile`, params, filter, { single: true });
        return result.data;
    }
}
