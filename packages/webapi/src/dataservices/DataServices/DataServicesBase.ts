import { DataServicesBase as CoreDataServicesBase } from "@blendsdk/datakit";
import { SysTenantDataService } from "../SysTenantDataService";
import { SysKeyDataService } from "../SysKeyDataService";
import { SysApplicationDataService } from "../SysApplicationDataService";
import { SysSecretDataService } from "../SysSecretDataService";
import { SysClientDataService } from "../SysClientDataService";
import { SysExtensionDataService } from "../SysExtensionDataService";
import { SysUserDataService } from "../SysUserDataService";
import { SysProfileDataService } from "../SysProfileDataService";
import { SysRoleDataService } from "../SysRoleDataService";
import { SysPermissionDataService } from "../SysPermissionDataService";
import { SysUserRoleDataService } from "../SysUserRoleDataService";
import { SysRolePermissionDataService } from "../SysRolePermissionDataService";
import { SysSessionDataService } from "../SysSessionDataService";
import { SysMfaDataService } from "../SysMfaDataService";
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
	 * Returns a new instance of SysApplicationDataService
	 * @return {*}  {SysApplicationDataService}
	 * @memberof DataServicesBase
	 */
	public sysApplicationDataService(): SysApplicationDataService {
		return new SysApplicationDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysSecretDataService
	 * @return {*}  {SysSecretDataService}
	 * @memberof DataServicesBase
	 */
	public sysSecretDataService(): SysSecretDataService {
		return new SysSecretDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysClientDataService
	 * @return {*}  {SysClientDataService}
	 * @memberof DataServicesBase
	 */
	public sysClientDataService(): SysClientDataService {
		return new SysClientDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysExtensionDataService
	 * @return {*}  {SysExtensionDataService}
	 * @memberof DataServicesBase
	 */
	public sysExtensionDataService(): SysExtensionDataService {
		return new SysExtensionDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysUserDataService
	 * @return {*}  {SysUserDataService}
	 * @memberof DataServicesBase
	 */
	public sysUserDataService(): SysUserDataService {
		return new SysUserDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysProfileDataService
	 * @return {*}  {SysProfileDataService}
	 * @memberof DataServicesBase
	 */
	public sysProfileDataService(): SysProfileDataService {
		return new SysProfileDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysRoleDataService
	 * @return {*}  {SysRoleDataService}
	 * @memberof DataServicesBase
	 */
	public sysRoleDataService(): SysRoleDataService {
		return new SysRoleDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysPermissionDataService
	 * @return {*}  {SysPermissionDataService}
	 * @memberof DataServicesBase
	 */
	public sysPermissionDataService(): SysPermissionDataService {
		return new SysPermissionDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysUserRoleDataService
	 * @return {*}  {SysUserRoleDataService}
	 * @memberof DataServicesBase
	 */
	public sysUserRoleDataService(): SysUserRoleDataService {
		return new SysUserRoleDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysRolePermissionDataService
	 * @return {*}  {SysRolePermissionDataService}
	 * @memberof DataServicesBase
	 */
	public sysRolePermissionDataService(): SysRolePermissionDataService {
		return new SysRolePermissionDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysSessionDataService
	 * @return {*}  {SysSessionDataService}
	 * @memberof DataServicesBase
	 */
	public sysSessionDataService(): SysSessionDataService {
		return new SysSessionDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysMfaDataService
	 * @return {*}  {SysMfaDataService}
	 * @memberof DataServicesBase
	 */
	public sysMfaDataService(): SysMfaDataService {
		return new SysMfaDataService({ sharedContext: this.sharedContext });
	}
}
