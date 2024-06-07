/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

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
	 * @type string
	 * @memberOf ISysTenant
	 */
	database: string;
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

/**
 * @export
 * @interface ISysApplication
 */
export interface ISysApplication {
	/**
	 * @type string
	 * @memberOf ISysApplication
	 */
	id?: string;
	/**
	 * @type string
	 * @memberOf ISysApplication
	 */
	logo?: string;
	/**
	 * @type string
	 * @memberOf ISysApplication
	 */
	application_name: string;
	/**
	 * @type string
	 * @memberOf ISysApplication
	 */
	client_id: string;
	/**
	 * @type string
	 * @memberOf ISysApplication
	 */
	description?: string;
	/**
	 * @type boolean
	 * @memberOf ISysApplication
	 */
	is_system?: boolean;
	/**
	 * @type boolean
	 * @memberOf ISysApplication
	 */
	is_active?: boolean;
}

/**
 * @export
 * @interface ISysSecret
 */
export interface ISysSecret {
	/**
	 * @type number
	 * @memberOf ISysSecret
	 */
	id?: number;
	/**
	 * @type string
	 * @memberOf ISysSecret
	 */
	secret: string;
	/**
	 * @type string
	 * @memberOf ISysSecret
	 */
	description?: string;
	/**
	 * @type number
	 * @memberOf ISysSecret
	 */
	valid_from: number;
	/**
	 * @type number
	 * @memberOf ISysSecret
	 */
	valid_to: number;
	/**
	 * @type boolean
	 * @memberOf ISysSecret
	 */
	is_system?: boolean;
	/**
	 * @type string
	 * @memberOf ISysSecret
	 */
	application_id: string;
}

/**
 * @export
 * @interface ISysClient
 */
export interface ISysClient {
	/**
	 * @type number
	 * @memberOf ISysClient
	 */
	id?: number;
	/**
	 * @type string
	 * @memberOf ISysClient
	 */
	client_type?: string;
	/**
	 * @type string
	 * @memberOf ISysClient
	 */
	redirect_uri?: string;
	/**
	 * @type string
	 * @memberOf ISysClient
	 */
	post_logout_redirect_uri?: string;
	/**
	 * @type boolean
	 * @memberOf ISysClient
	 */
	is_back_channel_post_logout?: boolean;
	/**
	 * @type boolean
	 * @memberOf ISysClient
	 */
	is_system?: boolean;
	/**
	 * @type boolean
	 * @memberOf ISysClient
	 */
	is_active?: boolean;
	/**
	 * @type number
	 * @memberOf ISysClient
	 */
	access_token_length: number;
	/**
	 * @type number
	 * @memberOf ISysClient
	 */
	refresh_token_length: number;
	/**
	 * @type string
	 * @memberOf ISysClient
	 */
	application_id: string;
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
	 * @type boolean
	 * @memberOf ISysUser
	 */
	is_system?: boolean;
	/**
	 * @type string
	 * @memberOf ISysUser
	 */
	date_created?: string;
	/**
	 * @type string
	 * @memberOf ISysUser
	 */
	date_changed?: string;
}

/**
 * @export
 * @interface ISysProfile
 */
export interface ISysProfile {
	/**
	 * @type string
	 * @memberOf ISysProfile
	 */
	id?: string;
	/**
	 * @type string
	 * @memberOf ISysProfile
	 */
	email?: string;
	/**
	 * @type string
	 * @memberOf ISysProfile
	 */
	firstname: string;
	/**
	 * @type string
	 * @memberOf ISysProfile
	 */
	lastname: string;
	/**
	 * @type string
	 * @memberOf ISysProfile
	 */
	avatar?: string;
	/**
	 * @type string
	 * @memberOf ISysProfile
	 */
	user_id: string;
	/**
	 * @type string
	 * @memberOf ISysProfile
	 */
	date_created?: string;
	/**
	 * @type string
	 * @memberOf ISysProfile
	 */
	date_modified?: string;
}

/**
 * @export
 * @interface ISysRole
 */
export interface ISysRole {
	/**
	 * @type string
	 * @memberOf ISysRole
	 */
	id?: string;
	/**
	 * @type string
	 * @memberOf ISysRole
	 */
	role: string;
	/**
	 * @type string
	 * @memberOf ISysRole
	 */
	description?: string;
	/**
	 * @type boolean
	 * @memberOf ISysRole
	 */
	is_system?: boolean;
	/**
	 * @type boolean
	 * @memberOf ISysRole
	 */
	is_active?: boolean;
}

/**
 * @export
 * @interface ISysPermission
 */
export interface ISysPermission {
	/**
	 * @type string
	 * @memberOf ISysPermission
	 */
	id?: string;
	/**
	 * @type string
	 * @memberOf ISysPermission
	 */
	permission: string;
	/**
	 * @type string
	 * @memberOf ISysPermission
	 */
	description?: string;
	/**
	 * @type string
	 * @memberOf ISysPermission
	 */
	application_id: string;
	/**
	 * @type boolean
	 * @memberOf ISysPermission
	 */
	is_system?: boolean;
	/**
	 * @type boolean
	 * @memberOf ISysPermission
	 */
	is_active?: boolean;
}

/**
 * @export
 * @interface ISysUserRole
 */
export interface ISysUserRole {
	/**
	 * @type string
	 * @memberOf ISysUserRole
	 */
	id?: string;
	/**
	 * @type string
	 * @memberOf ISysUserRole
	 */
	user_id: string;
	/**
	 * @type string
	 * @memberOf ISysUserRole
	 */
	role_id: string;
}

/**
 * @export
 * @interface ISysRolePermission
 */
export interface ISysRolePermission {
	/**
	 * @type string
	 * @memberOf ISysRolePermission
	 */
	id?: string;
	/**
	 * @type string
	 * @memberOf ISysRolePermission
	 */
	role_id: string;
	/**
	 * @type string
	 * @memberOf ISysRolePermission
	 */
	permission_id: string;
}
