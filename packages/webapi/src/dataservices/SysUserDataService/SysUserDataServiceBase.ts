import { ISysUser } from "@porta/shared";
import {
	ISysUserDataServiceUpdateSysUserByIdFilter,
	ISysUserDataServiceFindSysUserByIdParams,
	ISysUserDataServiceDeleteSysUserByIdFilter,
	ISysUserDataServiceFindByUsernameNonServiceParams
} from "./types";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to manipulate the sys_user table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysUserDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * Input converter of insertIntoSysUser
	 * @param {ISysUser}
	 * @returns {ISysUser}
	 * @memberof SysUserDataServiceBase
	 */
	protected abstract insertIntoSysUserInConverter(record: ISysUser): ISysUser;

	/**
	 * Output converter of insertIntoSysUser
	 * @param {ISysUser}
	 * @returns {ISysUser}
	 * @memberof SysUserDataServiceBase
	 */
	protected abstract insertIntoSysUserOutConverter(record: ISysUser): ISysUser;

	/**
	 * Input converter of updateSysUserById
	 * @param {Partial<ISysUser>}
	 * @returns {Partial<ISysUser>}
	 * @memberof SysUserDataServiceBase
	 */
	protected abstract updateSysUserByIdInConverter(record: Partial<ISysUser>): Partial<ISysUser>;

	/**
	 * Output converter of updateSysUserById
	 * @param {ISysUser}
	 * @returns {ISysUser}
	 * @memberof SysUserDataServiceBase
	 */
	protected abstract updateSysUserByIdOutConverter(record: ISysUser): ISysUser;

	/**
	 * Output converter of findSysUserById
	 * @param {ISysUser}
	 * @returns {ISysUser}
	 * @memberof SysUserDataServiceBase
	 */
	protected abstract findSysUserByIdOutConverter(record: ISysUser): ISysUser;

	/**
	 * Inserts a new record into sys_user table
	 * @param {ISysUser}
	 * @returns {ISysUser}
	 * @memberof SysUserDataServiceBase
	 */
	public async insertIntoSysUser(params: ISysUser): Promise<ISysUser> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysUser, ISysUser>(`sys_user`, params, {
			single: true,
			inConverter: (record: ISysUser) => {
				return this.insertIntoSysUserInConverter(record);
			},
			outConverter: (record: ISysUser) => {
				return this.insertIntoSysUserOutConverter(record);
			}
		});
		return result.data;
	}

	/**
	 * Update a sys_user record by
	 * @param {Partial<ISysUser>}
	 * @returns {ISysUser}
	 * @memberof SysUserDataServiceBase
	 */
	public async updateSysUserById(
		params: Partial<ISysUser>,
		filter: ISysUserDataServiceUpdateSysUserByIdFilter
	): Promise<ISysUser> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<ISysUser, Partial<ISysUser>, ISysUserDataServiceUpdateSysUserByIdFilter>(
			`sys_user`,
			params,
			filter,
			{
				single: true,
				inConverter: (record: Partial<ISysUser>) => {
					return this.updateSysUserByIdInConverter(record);
				},
				outConverter: (record: ISysUser) => {
					return this.updateSysUserByIdOutConverter(record);
				}
			}
		);
		return result.data;
	}

	/**
	 * Find a sys_user record by
	 * @param {ISysUserDataServiceFindSysUserByIdParams}
	 * @returns {ISysUser}
	 * @memberof SysUserDataServiceBase
	 */
	public async findSysUserById(params: ISysUserDataServiceFindSysUserByIdParams): Promise<ISysUser> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysUser, ISysUserDataServiceFindSysUserByIdParams>(
			`SELECT * FROM sys_user WHERE id = :id`,
			params,
			{
				single: true,
				outConverter: (record: ISysUser) => {
					return this.findSysUserByIdOutConverter(record);
				}
			}
		);
		return result.data;
	}

	/**
	 * Delete a sys_user record by
	 * @param {Partial<ISysUser>}
	 * @returns {void}
	 * @memberof SysUserDataServiceBase
	 */
	public async deleteSysUserById(
		filter: ISysUserDataServiceDeleteSysUserByIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysUserDataServiceDeleteSysUserByIdFilter>(`sys_user`, filter, {
			single: false
		});
		return result;
	}

	/**
	 * @param {ISysUserDataServiceFindByUsernameNonServiceParams}
	 * @returns {ISysUser}
	 * @memberof SysUserDataServiceBase
	 */
	public async findByUsernameNonService(params: ISysUserDataServiceFindByUsernameNonServiceParams): Promise<ISysUser> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysUser, ISysUserDataServiceFindByUsernameNonServiceParams>(
			`select
                            su.*
                        from
                            sys_user su
                            inner join sys_profile up on su.id = up.user_id
                        where
                            su.service_application_id is null and
                            (
                                UPPER(su.username) = UPPER(:username) or
                                UPPER(up.email) = UPPER(:username)
                            )
                `,
			params,
			{ single: true }
		);
		return result.data;
	}
}
