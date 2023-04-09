import {
	ISysSessionViewDataServiceFindSessionByOidcClientAndSubjectParams,
	ISysSessionViewDataServiceFindSessionByClientAndUserParams,
	ISysSessionViewDataServiceFindSessionBySessionIdParams
} from "./types";
import { ISysSessionView } from "@porta/shared";
import { DataService } from "@blendsdk/datakit";
import { PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to get data from sys_session_view view
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysSessionViewDataServiceBase extends DataService<PostgreSQLExecutionContext> {
	/**
	 * @param {ISysSessionViewDataServiceFindSessionByOidcClientAndSubjectParams}
	 * @returns {ISysSessionView}
	 * @memberof SysSessionViewDataServiceBase
	 */
	public async findSessionByOidcClientAndSubject(
		params: ISysSessionViewDataServiceFindSessionByOidcClientAndSubjectParams
	): Promise<ISysSessionView> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<
			ISysSessionView,
			ISysSessionViewDataServiceFindSessionByOidcClientAndSubjectParams
		>(`select * from sys_session_view where oidc_sub_claim = :sub_claim and oidc_client_id = :client_id`, params, {
			single: true
		});
		return result.data;
	}

	/**
	 * @param {ISysSessionViewDataServiceFindSessionByClientAndUserParams}
	 * @returns {ISysSessionView}
	 * @memberof SysSessionViewDataServiceBase
	 */
	public async findSessionByClientAndUser(
		params: ISysSessionViewDataServiceFindSessionByClientAndUserParams
	): Promise<ISysSessionView> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysSessionView, ISysSessionViewDataServiceFindSessionByClientAndUserParams>(
			`select * from sys_session_view where user_id = :user_id and client_id = :client_id`,
			params,
			{ single: true }
		);
		return result.data;
	}

	/**
	 * @param {ISysSessionViewDataServiceFindSessionBySessionIdParams}
	 * @returns {ISysSessionView}
	 * @memberof SysSessionViewDataServiceBase
	 */
	public async findSessionBySessionId(
		params: ISysSessionViewDataServiceFindSessionBySessionIdParams
	): Promise<ISysSessionView> {
		const ctx = await this.getContext();
		const result = await ctx.executeQuery<ISysSessionView, ISysSessionViewDataServiceFindSessionBySessionIdParams>(
			`select * from sys_session_view where id = :id`,
			params,
			{ single: true }
		);
		return result.data;
	}
}
