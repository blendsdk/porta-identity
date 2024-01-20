import { DataServicesBase as CoreDataServicesBase } from "@blendsdk/datakit";
import { SysClientViewDataService } from "../SysClientViewDataService";
import { SysAuthorizationViewDataService } from "../SysAuthorizationViewDataService";
import { SysUserMfaViewDataService } from "../SysUserMfaViewDataService";
import { SysUserPermissionViewDataService } from "../SysUserPermissionViewDataService";
import { SysRolesByUserViewDataService } from "../SysRolesByUserViewDataService";
import { SysRefreshTokenViewDataService } from "../SysRefreshTokenViewDataService";
import { SysAccessTokenViewDataService } from "../SysAccessTokenViewDataService";
import { SysSessionViewDataService } from "../SysSessionViewDataService";
import { SysTenantDataService } from "../SysTenantDataService";
import { SysUserDataService } from "../SysUserDataService";
import { SysUserProfileDataService } from "../SysUserProfileDataService";
import { SysRoleDataService } from "../SysRoleDataService";
import { SysUserRoleDataService } from "../SysUserRoleDataService";
import { SysPermissionDataService } from "../SysPermissionDataService";
import { SysRolePermissionDataService } from "../SysRolePermissionDataService";
import { SysApplicationDataService } from "../SysApplicationDataService";
import { SysClientDataService } from "../SysClientDataService";
import { SysSessionDataService } from "../SysSessionDataService";
import { SysAccessTokenDataService } from "../SysAccessTokenDataService";
import { SysRefreshTokenDataService } from "../SysRefreshTokenDataService";
import { SysMfaDataService } from "../SysMfaDataService";
import { SysUserMfaDataService } from "../SysUserMfaDataService";
import { SysKeyDataService } from "../SysKeyDataService";
import { PostgreSQLExecutionContext, PostgreSQLDataSource } from "@blendsdk/postgresql";

export abstract class DataServicesBase extends CoreDataServicesBase<PostgreSQLExecutionContext, PostgreSQLDataSource> {
	/**
	 * Returns a new instance of SysClientViewDataService
	 * @return {*}  {SysClientViewDataService}
	 * @memberof DataServicesBase
	 */
	public sysClientViewDataService(): SysClientViewDataService {
		return new SysClientViewDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysAuthorizationViewDataService
	 * @return {*}  {SysAuthorizationViewDataService}
	 * @memberof DataServicesBase
	 */
	public sysAuthorizationViewDataService(): SysAuthorizationViewDataService {
		return new SysAuthorizationViewDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysUserMfaViewDataService
	 * @return {*}  {SysUserMfaViewDataService}
	 * @memberof DataServicesBase
	 */
	public sysUserMfaViewDataService(): SysUserMfaViewDataService {
		return new SysUserMfaViewDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysUserPermissionViewDataService
	 * @return {*}  {SysUserPermissionViewDataService}
	 * @memberof DataServicesBase
	 */
	public sysUserPermissionViewDataService(): SysUserPermissionViewDataService {
		return new SysUserPermissionViewDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysRolesByUserViewDataService
	 * @return {*}  {SysRolesByUserViewDataService}
	 * @memberof DataServicesBase
	 */
	public sysRolesByUserViewDataService(): SysRolesByUserViewDataService {
		return new SysRolesByUserViewDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysRefreshTokenViewDataService
	 * @return {*}  {SysRefreshTokenViewDataService}
	 * @memberof DataServicesBase
	 */
	public sysRefreshTokenViewDataService(): SysRefreshTokenViewDataService {
		return new SysRefreshTokenViewDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysAccessTokenViewDataService
	 * @return {*}  {SysAccessTokenViewDataService}
	 * @memberof DataServicesBase
	 */
	public sysAccessTokenViewDataService(): SysAccessTokenViewDataService {
		return new SysAccessTokenViewDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysSessionViewDataService
	 * @return {*}  {SysSessionViewDataService}
	 * @memberof DataServicesBase
	 */
	public sysSessionViewDataService(): SysSessionViewDataService {
		return new SysSessionViewDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysTenantDataService
	 * @return {*}  {SysTenantDataService}
	 * @memberof DataServicesBase
	 */
	public sysTenantDataService(): SysTenantDataService {
		return new SysTenantDataService({ sharedContext: this.sharedContext });
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
	 * Returns a new instance of SysUserProfileDataService
	 * @return {*}  {SysUserProfileDataService}
	 * @memberof DataServicesBase
	 */
	public sysUserProfileDataService(): SysUserProfileDataService {
		return new SysUserProfileDataService({ sharedContext: this.sharedContext });
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
	 * Returns a new instance of SysUserRoleDataService
	 * @return {*}  {SysUserRoleDataService}
	 * @memberof DataServicesBase
	 */
	public sysUserRoleDataService(): SysUserRoleDataService {
		return new SysUserRoleDataService({ sharedContext: this.sharedContext });
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
	 * Returns a new instance of SysRolePermissionDataService
	 * @return {*}  {SysRolePermissionDataService}
	 * @memberof DataServicesBase
	 */
	public sysRolePermissionDataService(): SysRolePermissionDataService {
		return new SysRolePermissionDataService({ sharedContext: this.sharedContext });
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
	 * Returns a new instance of SysClientDataService
	 * @return {*}  {SysClientDataService}
	 * @memberof DataServicesBase
	 */
	public sysClientDataService(): SysClientDataService {
		return new SysClientDataService({ sharedContext: this.sharedContext });
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
	 * Returns a new instance of SysAccessTokenDataService
	 * @return {*}  {SysAccessTokenDataService}
	 * @memberof DataServicesBase
	 */
	public sysAccessTokenDataService(): SysAccessTokenDataService {
		return new SysAccessTokenDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysRefreshTokenDataService
	 * @return {*}  {SysRefreshTokenDataService}
	 * @memberof DataServicesBase
	 */
	public sysRefreshTokenDataService(): SysRefreshTokenDataService {
		return new SysRefreshTokenDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysMfaDataService
	 * @return {*}  {SysMfaDataService}
	 * @memberof DataServicesBase
	 */
	public sysMfaDataService(): SysMfaDataService {
		return new SysMfaDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysUserMfaDataService
	 * @return {*}  {SysUserMfaDataService}
	 * @memberof DataServicesBase
	 */
	public sysUserMfaDataService(): SysUserMfaDataService {
		return new SysUserMfaDataService({ sharedContext: this.sharedContext });
	}

	/**
	 * Returns a new instance of SysKeyDataService
	 * @return {*}  {SysKeyDataService}
	 * @memberof DataServicesBase
	 */
	public sysKeyDataService(): SysKeyDataService {
		return new SysKeyDataService({ sharedContext: this.sharedContext });
	}
}
