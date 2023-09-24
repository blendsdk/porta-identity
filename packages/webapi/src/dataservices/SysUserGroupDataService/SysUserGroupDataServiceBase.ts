import { DataService, ICountRecordsResult, IExecuteQueryReturnValue } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";
import { ISysGroupsByUserView, ISysUserGroup } from "@porta/shared";
import {
    ISysUserGroupDataServiceDeleteSysUserGroupByIdFilter,
    ISysUserGroupDataServiceFindGroupsByUserIdParams,
    ISysUserGroupDataServiceFindSysUserGroupByIdParams,
    ISysUserGroupDataServiceFindSysUserGroupByUserIdAndGroupIdParams,
    ISysUserGroupDataServiceUpdateSysUserGroupByIdFilter
} from "./types";

/**
 * Provides functionality to manipulate the sys_user_group table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysUserGroupDataServiceBase extends DataService<PostgreSQLExecutionContext> {
    /**
     * @param {ISysUserGroupDataServiceFindGroupsByUserIdParams}
     * @returns {ISysGroupsByUserView[]}
     * @memberof SysUserGroupDataServiceBase
     */
    public async findGroupsByUserId(
        params: ISysUserGroupDataServiceFindGroupsByUserIdParams
    ): Promise<ISysGroupsByUserView[]> {
        const ctx = await this.getContext();
        const result = await ctx.executeQuery<ISysGroupsByUserView[], ISysUserGroupDataServiceFindGroupsByUserIdParams>(
            `select * from sys_groups_by_user_view where user_id = :user_id`,
            params,
            { single: false }
        );
        return result.data;
    }

    /**
     * Find a sys_user_group record by
     * @param {ISysUserGroupDataServiceFindSysUserGroupByIdParams}
     * @returns {ISysUserGroup}
     * @memberof SysUserGroupDataServiceBase
     */
    public async findSysUserGroupById(
        params: ISysUserGroupDataServiceFindSysUserGroupByIdParams
    ): Promise<ISysUserGroup> {
        const ctx = await this.getContext();
        const result = await ctx.executeQuery<ISysUserGroup, ISysUserGroupDataServiceFindSysUserGroupByIdParams>(
            `SELECT * FROM sys_user_group WHERE id = :id`,
            params,
            { single: true }
        );
        return result.data;
    }

    /**
     * Inserts a new record into sys_user_group table
     * @param {ISysUserGroup}
     * @returns {ISysUserGroup}
     * @memberof SysUserGroupDataServiceBase
     */
    public async insertIntoSysUserGroup(params: ISysUserGroup): Promise<ISysUserGroup> {
        const ctx = await this.getContext();
        const result = await ctx.insertRecord<ISysUserGroup, ISysUserGroup>(`sys_user_group`, params, { single: true });
        return result.data;
    }

    /**
     * Delete a sys_user_group record by
     * @param {Partial<ISysUserGroup>}
     * @returns {void}
     * @memberof SysUserGroupDataServiceBase
     */
    public async deleteSysUserGroupById(
        filter: ISysUserGroupDataServiceDeleteSysUserGroupByIdFilter
    ): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
        const ctx = await this.getContext();
        const result = await ctx.deleteRecords<ISysUserGroupDataServiceDeleteSysUserGroupByIdFilter>(
            `sys_user_group`,
            filter,
            { single: false }
        );
        return result;
    }

    /**
     * Update a sys_user_group record by
     * @param {Partial<ISysUserGroup>}
     * @returns {ISysUserGroup}
     * @memberof SysUserGroupDataServiceBase
     */
    public async updateSysUserGroupById(
        params: Partial<ISysUserGroup>,
        filter: ISysUserGroupDataServiceUpdateSysUserGroupByIdFilter
    ): Promise<ISysUserGroup> {
        const ctx = await this.getContext();
        const result = await ctx.updateRecords<
            ISysUserGroup,
            Partial<ISysUserGroup>,
            ISysUserGroupDataServiceUpdateSysUserGroupByIdFilter
        >(`sys_user_group`, params, filter, { single: true });
        return result.data;
    }

    /**
     * Find a sys_user_group record by  and
     * @param {ISysUserGroupDataServiceFindSysUserGroupByUserIdAndGroupIdParams}
     * @returns {ISysUserGroup}
     * @memberof SysUserGroupDataServiceBase
     */
    public async findSysUserGroupByUserIdAndGroupId(
        params: ISysUserGroupDataServiceFindSysUserGroupByUserIdAndGroupIdParams
    ): Promise<ISysUserGroup> {
        const ctx = await this.getContext();
        const result = await ctx.executeQuery<
            ISysUserGroup,
            ISysUserGroupDataServiceFindSysUserGroupByUserIdAndGroupIdParams
        >(`SELECT * FROM sys_user_group WHERE user_id = :user_id AND group_id = :group_id`, params, { single: true });
        return result.data;
    }
}
