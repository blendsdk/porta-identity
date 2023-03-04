/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { ISysMfaSettings } from "./generated_types";

/**
 * @export
 * @interface ISysUserMfaView
 */
export interface ISysUserMfaView {
	/**
	 * @type string
	 * @memberOf ISysUserMfaView
	 */
	user_id: string;
	/**
	 * @type string
	 * @memberOf ISysUserMfaView
	 */
	mfa_id: string;
	/**
	 * @type string
	 * @memberOf ISysUserMfaView
	 */
	mfa_name: string;
	/**
	 * @type string
	 * @memberOf ISysUserMfaView
	 */
	mfa_settings: string;
}

/**
 * @export
 * @interface ISysTenant
 */
export interface ISysTenant {
	/**
	 * @type string
	 * @memberOf ISysTenant
	 */
	id?: string;
	/**
	 * @type string
	 * @memberOf ISysTenant
	 */
	name: string;
	/**
	 * @type boolean
	 * @memberOf ISysTenant
	 */
	is_active?: boolean;
	/**
	 * @type boolean
	 * @memberOf ISysTenant
	 */
	allow_reset_password?: boolean;
	/**
	 * @type boolean
	 * @memberOf ISysTenant
	 */
	allow_registration?: boolean;
	/**
	 * @type string
	 * @memberOf ISysTenant
	 */
	organization: string;
}

/**
 * @export
 * @interface ISysUser
 */
export interface ISysUser {
	/**
	 * @type string
	 * @memberOf ISysUser
	 */
	id?: string;
	/**
	 * @type string
	 * @memberOf ISysUser
	 */
	username: string;
	/**
	 * @type string
	 * @memberOf ISysUser
	 */
	password: string;
	/**
	 * @type boolean
	 * @memberOf ISysUser
	 */
	is_active?: boolean;
	/**
	 * @type string
	 * @memberOf ISysUser
	 */
	date_created?: string;
}

/**
 * @export
 * @interface ISysUserProfile
 */
export interface ISysUserProfile {
	/**
	 * @type string
	 * @memberOf ISysUserProfile
	 */
	id?: string;
	/**
	 * @type string
	 * @memberOf ISysUserProfile
	 */
	firstname: string;
	/**
	 * @type string
	 * @memberOf ISysUserProfile
	 */
	lastname: string;
	/**
	 * @type string
	 * @memberOf ISysUserProfile
	 */
	avatar?: string;
	/**
	 * @type string
	 * @memberOf ISysUserProfile
	 */
	user_id: string;
	/**
	 * @type string
	 * @memberOf ISysUserProfile
	 */
	date_created?: string;
	/**
	 * @type string
	 * @memberOf ISysUserProfile
	 */
	date_changed?: string;
}

/**
 * @export
 * @interface ISysMfa
 */
export interface ISysMfa {
	/**
	 * @type string
	 * @memberOf ISysMfa
	 */
	id?: string;
	/**
	 * @type string
	 * @memberOf ISysMfa
	 */
	name: string;
	/**
	 * @type ISysMfaSettings
	 * @memberOf ISysMfa
	 */
	settings?: ISysMfaSettings;
}

/**
 * @export
 * @interface ISysUserMfa
 */
export interface ISysUserMfa {
	/**
	 * @type string
	 * @memberOf ISysUserMfa
	 */
	id?: string;
	/**
	 * @type string
	 * @memberOf ISysUserMfa
	 */
	user_id: string;
	/**
	 * @type string
	 * @memberOf ISysUserMfa
	 */
	mfa_id: string;
}

/**
 * @export
 * @interface ISysKey
 */
export interface ISysKey {
	/**
	 * @type string
	 * @memberOf ISysKey
	 */
	id?: string;
	/**
	 * @type string
	 * @memberOf ISysKey
	 */
	key_type: string;
	/**
	 * @type string
	 * @memberOf ISysKey
	 */
	key_id: string;
	/**
	 * @type string
	 * @memberOf ISysKey
	 */
	data: string;
}
