/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { ISysUser, ISysUserProfile, ISysTenant } from "./generated_database_types";

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
