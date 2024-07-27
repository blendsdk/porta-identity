/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { ISysUser, ISysProfile, ISysTenant, ISysClient, ISysRole, ISysPermission } from "./generated_database_types";

/**
 * @export
 * @interface IAnyIndex
 */
export interface IAnyIndex {
	/**
	 * @type any
	 * @memberOf IAnyIndex
	 */
	[key: string]: any;
}

/**
 * @export
 * @interface IMfaSettings
 */
export interface IMfaSettings {
	/**
	 * @type string
	 * @memberOf IMfaSettings
	 */
	[key: string]: string;
}

/**
 * @export
 * @interface IOpsResponse
 */
export interface IOpsResponse {
	/**
	 * @type string
	 * @memberOf IOpsResponse
	 */
	message: string;
	/**
	 * @type boolean
	 * @memberOf IOpsResponse
	 */
	success: boolean;
}

/**
 * @export
 * @interface IPortaAccount
 */
export interface IPortaAccount {
	/**
	 * @type ISysUser
	 * @memberOf IPortaAccount
	 */
	user: ISysUser;
	/**
	 * @type ISysProfile
	 * @memberOf IPortaAccount
	 */
	profile: ISysProfile;
	/**
	 * @type ISysTenant
	 * @memberOf IPortaAccount
	 */
	tenant: ISysTenant;
	/**
	 * @type ISysClient
	 * @memberOf IPortaAccount
	 */
	client: ISysClient;
	/**
	 * @type ISysRole[]
	 * @memberOf IPortaAccount
	 */
	roles: ISysRole[];
	/**
	 * @type ISysPermission[]
	 * @memberOf IPortaAccount
	 */
	permissions: ISysPermission[];
}

/**
 * @export
 * @interface IErrorData
 */
export interface IErrorData {
	/**
	 * @type string
	 * @memberOf IErrorData
	 */
	error: string;
	/**
	 * @type string
	 * @memberOf IErrorData
	 */
	type: string;
	/**
	 * @type any
	 * @memberOf IErrorData
	 */
	context: any;
}
