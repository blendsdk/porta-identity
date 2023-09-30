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
	 * @type string
	 * @memberOf IAuthenticationFlowState
	 */
	mfa_state?: string;
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
 * @interface ISysAccessTokenAuthRequestParams
 */
export interface ISysAccessTokenAuthRequestParams {
	/**
	 * @type string
	 * @memberOf ISysAccessTokenAuthRequestParams
	 */
	ui_locales: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenAuthRequestParams
	 */
	claims: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenAuthRequestParams
	 */
	acr_values: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenAuthRequestParams
	 */
	resource: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenAuthRequestParams
	 */
	token_reference: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenAuthRequestParams
	 */
	scope: string;
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
