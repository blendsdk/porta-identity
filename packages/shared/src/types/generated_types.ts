/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { ISysUser, ISysUserProfile, ISysTenant } from "./generated_database_types";

/**
 * @export
 * @interface IAuthenticationFlowState
 */
export interface IAuthenticationFlowState {
	/**
	 * @type string
	 * @memberOf IAuthenticationFlowState
	 */
	account?: string;
	/**
	 * @type boolean
	 * @memberOf IAuthenticationFlowState
	 */
	account_status?: boolean;
	/**
	 * @type boolean
	 * @memberOf IAuthenticationFlowState
	 */
	account_state?: boolean;
	/**
	 * @type boolean
	 * @memberOf IAuthenticationFlowState
	 */
	password_state?: boolean;
	/**
	 * @type string
	 * @memberOf IAuthenticationFlowState
	 */
	signin_url?: string;
	/**
	 * @type boolean
	 * @memberOf IAuthenticationFlowState
	 */
	mfa_state?: boolean;
	/**
	 * @type string
	 * @memberOf IAuthenticationFlowState
	 */
	mfa?: string;
	/**
	 * @type string[]
	 * @memberOf IAuthenticationFlowState
	 */
	mfa_list?: string[];
}

/**
 * @export
 * @interface ISysMfaSettings
 */
export interface ISysMfaSettings {}

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
	 * @type ISysUserProfile
	 * @memberOf IPortaAccount
	 */
	profile: ISysUserProfile;
	/**
	 * @type ISysTenant
	 * @memberOf IPortaAccount
	 */
	tenant: ISysTenant;
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
