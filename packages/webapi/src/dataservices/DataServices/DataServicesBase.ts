import { DataServicesBase as CoreDataServicesBase } from "@blendsdk/datakit";
import { SysTenantDataService } from "../SysTenantDataService";
import { SysKeyDataService } from "../SysKeyDataService";
import { SysUserDataService } from "../SysUserDataService";
import { PostgreSQLExecutionContext, PostgreSQLDataSource } from "@blendsdk/postgresql";

export abstract class DataServicesBase extends CoreDataServicesBase<PostgreSQLExecutionContext, PostgreSQLDataSource> {
	/**
	 * Returns a new instance of SysTenantDataService
	 * @return {*}  {SysTenantDataService}
	 * @memberof DataServicesBase
	 */
	public sysTenantDataService(): SysTenantDataService {
		return new SysTenantDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysKeyDataService
	 * @return {*}  {SysKeyDataService}
	 * @memberof DataServicesBase
	 */
	public sysKeyDataService(): SysKeyDataService {
		return new SysKeyDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysUserDataService
	 * @return {*}  {SysUserDataService}
	 * @memberof DataServicesBase
	 */
	public sysUserDataService(): SysUserDataService {
		return new SysUserDataService({ sharedContext: this.sharedContext });
	}
}
