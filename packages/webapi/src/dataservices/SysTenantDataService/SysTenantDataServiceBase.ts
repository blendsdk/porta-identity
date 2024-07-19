import {
	ISysAccessTokenView,
	ISysUserPermissionView,
	ISysAuthorizationView,
	ISysSecretView,
	ISysTenant
} from "@porta/shared";
import { TExpressionRenderer } from "@blendsdk/expression";
import {
	ISysTenantDataServiceFindByNameOrIdParams,
	ISysTenantDataServiceFindSysTenantByIdParams,
	ISysTenantDataServiceDeleteSysTenantByIdFilter,
	ISysTenantDataServiceUpdateSysTenantByIdFilter,
	ISysTenantDataServiceFindSysTenantByNameParams,
	ISysTenantDataServiceFindSysTenantByDatabaseParams
} from "./types";
import { ICountRecordsResult, IExecuteQueryReturnValue, DataService } from "@blendsdk/datakit";
import { IPostgreSQLQueryResult, PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to manipulate the sys_tenant table
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysTenantDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * List a sys_access_token_view by expression syntax
	 * @param {void}
	 * @returns {ISysAccessTokenView[]}
	 * @memberof SysTenantDataServiceBase
	 */
	public async listSysAccessTokenViewByExpression(params: TExpressionRenderer): Promise<ISysAccessTokenView[]> {
		const ctx = await this.getContext();
		const result = await ctx.listByExpression<ISysAccessTokenView[]>(`sys_access_token_view`, params, {
			single: false
		});
		return result.data;
	}

	/**
	 * List a sys_user_permission_view by expression syntax
	 * @param {void}
	 * @returns {ISysUserPermissionView[]}
	 * @memberof SysTenantDataServiceBase
	 */
	public async listSysUserPermissionViewByExpression(params: TExpressionRenderer): Promise<ISysUserPermissionView[]> {
		const ctx = await this.getContext();
		const result = await ctx.listByExpression<ISysUserPermissionView[]>(`sys_user_permission_view`, params, {
			single: false
		});
		return result.data;
	}

	/**
	 * List a sys_authorization_view by expression syntax
	 * @param {void}
	 * @returns {ISysAuthorizationView[]}
	 * @memberof SysTenantDataServiceBase
	 */
	public async listSysAuthorizationViewByExpression(params: TExpressionRenderer): Promise<ISysAuthorizationView[]> {
		const ctx = await this.getContext();
		const result = await ctx.listByExpression<ISysAuthorizationView[]>(`sys_authorization_view`, params, {
			single: false
		});
		return result.data;
	}

	/**
	 * List a sys_secret_view by expression syntax
	 * @param {void}
	 * @returns {ISysSecretView[]}
	 * @memberof SysTenantDataServiceBase
	 */
	public async listSysSecretViewByExpression(params: TExpressionRenderer): Promise<ISysSecretView[]> {
		const ctx = await this.getContext();
		const result = await ctx.listByExpression<ISysSecretView[]>(`sys_secret_view`, params, { single: false });
		return result.data;
	}

	/**
	 * List a sys_tenant by expression syntax
	 * @param {void}
	 * @returns {ISysTenant[]}
	 * @memberof SysTenantDataServiceBase
	 */
	public async listSysTenantByExpression(params: TExpressionRenderer): Promise<ISysTenant[]> {
		const ctx = await this.getContext();
		const result = await ctx.listByExpression<ISysTenant[]>(`sys_tenant`, params, { single: false });
		return result.data;
	}

	/**
	 * @param {ISysTenantDataServiceFindByNameOrIdParams}
	 * @returns {ISysTenant}
	 * @memberof SysTenantDataServiceBase
	 */
	public async findByNameOrId(params: ISysTenantDataServiceFindByNameOrIdParams): Promise<ISysTenant> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysTenant, ISysTenantDataServiceFindByNameOrIdParams>(
			`SELECT * FROM sys_tenant WHERE UPPER(name) = UPPER(:name) OR id::text = :name`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Find a sys_tenant record by
	 * @param {ISysTenantDataServiceFindSysTenantByIdParams}
	 * @returns {ISysTenant}
	 * @memberof SysTenantDataServiceBase
	 */
	public async findSysTenantById(params: ISysTenantDataServiceFindSysTenantByIdParams): Promise<ISysTenant> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysTenant, ISysTenantDataServiceFindSysTenantByIdParams>(
			`SELECT * FROM sys_tenant WHERE id = :id`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Inserts a new record into sys_tenant table
	 * @param {ISysTenant}
	 * @returns {ISysTenant}
	 * @memberof SysTenantDataServiceBase
	 */
	public async insertIntoSysTenant(params: ISysTenant): Promise<ISysTenant> {
		const ctx = await this.getContext();
		const result = await ctx.insertRecord<ISysTenant, ISysTenant>(`sys_tenant`, params, { single: true });
		return result.data;
	}

	/**
	 * Delete a sys_tenant record by
	 * @param {Partial<ISysTenant>}
	 * @returns {void}
	 * @memberof SysTenantDataServiceBase
	 */
	public async deleteSysTenantById(
		filter: ISysTenantDataServiceDeleteSysTenantByIdFilter
	): Promise<IExecuteQueryReturnValue<ICountRecordsResult, IPostgreSQLQueryResult>> {
		const ctx = await this.getContext();
		const result = await ctx.deleteRecords<ISysTenantDataServiceDeleteSysTenantByIdFilter>(`sys_tenant`, filter, {
			single: false
		});
		return result;
	}

	/**
	 * Update a sys_tenant record by
	 * @param {Partial<ISysTenant>}
	 * @returns {ISysTenant}
	 * @memberof SysTenantDataServiceBase
	 */
	public async updateSysTenantById(
		params: Partial<ISysTenant>,
		filter: ISysTenantDataServiceUpdateSysTenantByIdFilter
	): Promise<ISysTenant> {
		const ctx = await this.getContext();
		const result = await ctx.updateRecords<
			ISysTenant,
			Partial<ISysTenant>,
			ISysTenantDataServiceUpdateSysTenantByIdFilter
		>(`sys_tenant`, params, filter, { single: true });
		return result.data;
	}

	/**
	 * Find a sys_tenant record by
	 * @param {ISysTenantDataServiceFindSysTenantByNameParams}
	 * @returns {ISysTenant}
	 * @memberof SysTenantDataServiceBase
	 */
	public async findSysTenantByName(params: ISysTenantDataServiceFindSysTenantByNameParams): Promise<ISysTenant> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysTenant, ISysTenantDataServiceFindSysTenantByNameParams>(
			`SELECT * FROM sys_tenant WHERE name = :name`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * Find a sys_tenant record by
	 * @param {ISysTenantDataServiceFindSysTenantByDatabaseParams}
	 * @returns {ISysTenant}
	 * @memberof SysTenantDataServiceBase
	 */
	public async findSysTenantByDatabase(
		params: ISysTenantDataServiceFindSysTenantByDatabaseParams
	): Promise<ISysTenant> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysTenant, ISysTenantDataServiceFindSysTenantByDatabaseParams>(
			`SELECT * FROM sys_tenant WHERE database = :database`,
			params,
			{ single: true }
		);
		return result.data;
	}
}
