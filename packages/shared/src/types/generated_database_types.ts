/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { ISysAccessTokenAuthRequestParams, ISysMfaSettings } from "./generated_types";

/**
 * @export
 * @interface ISysClientView
 */
export interface ISysClientView {
	/**
	 * @type string
	 * @memberOf ISysClientView
	 */
	id: string;
	/**
	 * @type string
	 * @memberOf ISysClientView
	 */
	client_id: string;
	/**
	 * @type string
	 * @memberOf ISysClientView
	 */
	client_type: string;
	/**
	 * @type boolean
	 * @memberOf ISysClientView
	 */
	is_active: boolean;
	/**
	 * @type string
	 * @memberOf ISysClientView
	 */
	description: string;
	/**
	 * @type string
	 * @memberOf ISysClientView
	 */
	secret: string;
	/**
	 * @type number
	 * @memberOf ISysClientView
	 */
	access_token_ttl: number;
	/**
	 * @type number
	 * @memberOf ISysClientView
	 */
	refresh_token_ttl: number;
	/**
	 * @type string
	 * @memberOf ISysClientView
	 */
	valid_from: string;
	/**
	 * @type string
	 * @memberOf ISysClientView
	 */
	valid_until: string;
	/**
	 * @type string
	 * @memberOf ISysClientView
	 */
	redirect_uri: string;
	/**
	 * @type string
	 * @memberOf ISysClientView
	 */
	client_credentials_user_id: string;
	/**
	 * @type string
	 * @memberOf ISysClientView
	 */
	application_id: string;
	/**
	 * @type string
	 * @memberOf ISysClientView
	 */
	post_logout_redirect_uri: string;
	/**
	 * @type boolean
	 * @memberOf ISysClientView
	 */
	is_back_channel_post_logout: boolean;
	/**
	 * @type boolean
	 * @memberOf ISysClientView
	 */
	is_system_client: boolean;
	/**
	 * @type string
	 * @memberOf ISysClientView
	 */
	application_name: string;
	/**
	 * @type string
	 * @memberOf ISysClientView
	 */
	logo: string;
}

/**
 * @export
 * @interface ISysAuthorizationView
 */
export interface ISysAuthorizationView {
	/**
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	id: string;
	/**
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	client_id: string;
	/**
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	client_type: string;
	/**
	 * @type boolean
	 * @memberOf ISysAuthorizationView
	 */
	is_active: boolean;
	/**
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	description: string;
	/**
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	secret: string;
	/**
	 * @type number
	 * @memberOf ISysAuthorizationView
	 */
	access_token_ttl: number;
	/**
	 * @type number
	 * @memberOf ISysAuthorizationView
	 */
	refresh_token_ttl: number;
	/**
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	valid_from: string;
	/**
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	valid_until: string;
	/**
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	redirect_uri: string;
	/**
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	client_credentials_user_id: string;
	/**
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	application_id: string;
	/**
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	post_logout_redirect_uri: string;
	/**
	 * @type boolean
	 * @memberOf ISysAuthorizationView
	 */
	is_back_channel_post_logout: boolean;
	/**
	 * @type boolean
	 * @memberOf ISysAuthorizationView
	 */
	is_system_client: boolean;
	/**
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	application_name: string;
	/**
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	logo: string;
	/**
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	client_credentials_user: string;
}

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
 * @interface ISysRolesByUserView
 */
export interface ISysRolesByUserView {
	/**
	 * @type string
	 * @memberOf ISysRolesByUserView
	 */
	id: string;
	/**
	 * @type string
	 * @memberOf ISysRolesByUserView
	 */
	role: string;
	/**
	 * @type string
	 * @memberOf ISysRolesByUserView
	 */
	description: string;
	/**
	 * @type string
	 * @memberOf ISysRolesByUserView
	 */
	role_type: string;
	/**
	 * @type boolean
	 * @memberOf ISysRolesByUserView
	 */
	is_active: boolean;
	/**
	 * @type string
	 * @memberOf ISysRolesByUserView
	 */
	user_id: string;
}

/**
 * @export
 * @interface ISysUserPermissionView
 */
export interface ISysUserPermissionView {
	/**
	 * @type string
	 * @memberOf ISysUserPermissionView
	 */
	application_id: string;
	/**
	 * @type string
	 * @memberOf ISysUserPermissionView
	 */
	client_id: string;
	/**
	 * @type string
	 * @memberOf ISysUserPermissionView
	 */
	oidc_client_id: string;
	/**
	 * @type string
	 * @memberOf ISysUserPermissionView
	 */
	user_id: string;
	/**
	 * @type string
	 * @memberOf ISysUserPermissionView
	 */
	permission_id: string;
	/**
	 * @type string
	 * @memberOf ISysUserPermissionView
	 */
	role_id: string;
	/**
	 * @type string
	 * @memberOf ISysUserPermissionView
	 */
	permission: string;
	/**
	 * @type boolean
	 * @memberOf ISysUserPermissionView
	 */
	is_active: boolean;
	/**
	 * @type string
	 * @memberOf ISysUserPermissionView
	 */
	role: string;
	/**
	 * @type string
	 * @memberOf ISysUserPermissionView
	 */
	role_description: string;
	/**
	 * @type string
	 * @memberOf ISysUserPermissionView
	 */
	permission_description: string;
	/**
	 * @type boolean
	 * @memberOf ISysUserPermissionView
	 */
	role_is_active: boolean;
}

/**
 * @export
 * @interface ISysAccessTokenView
 */
export interface ISysAccessTokenView {
	/**
	 * @type number
	 * @memberOf ISysAccessTokenView
	 */
	default_ttl: number;
	/**
	 * @type number
	 * @memberOf ISysAccessTokenView
	 */
	default_refresh_ttl: number;
	/**
	 * @type number
	 * @memberOf ISysAccessTokenView
	 */
	ttl: number;
	/**
	 * @type number
	 * @memberOf ISysAccessTokenView
	 */
	refresh_ttl: number;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenView
	 */
	id: string;
	/**
	 * @type number
	 * @memberOf ISysAccessTokenView
	 */
	auth_time: number;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenView
	 */
	date_created: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenView
	 */
	auth_request_params: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenView
	 */
	access_token: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenView
	 */
	session_id: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenView
	 */
	user_id: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenView
	 */
	client_id: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenView
	 */
	tenant_id: string;
	/**
	 * @type boolean
	 * @memberOf ISysAccessTokenView
	 */
	is_expired: boolean;
	/**
	 * @type boolean
	 * @memberOf ISysAccessTokenView
	 */
	is_revoke: boolean;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenView
	 */
	expire_at: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenView
	 */
	revoke_at: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenView
	 */
	user: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenView
	 */
	profile: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenView
	 */
	client: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenView
	 */
	tenant: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenView
	 */
	session: string;
}

/**
 * @export
 * @interface ISysRefreshTokenView
 */
export interface ISysRefreshTokenView {
	/**
	 * @type string
	 * @memberOf ISysRefreshTokenView
	 */
	id: string;
	/**
	 * @type number
	 * @memberOf ISysRefreshTokenView
	 */
	ttl: number;
	/**
	 * @type string
	 * @memberOf ISysRefreshTokenView
	 */
	refresh_token: string;
	/**
	 * @type string
	 * @memberOf ISysRefreshTokenView
	 */
	access_token: string;
	/**
	 * @type boolean
	 * @memberOf ISysRefreshTokenView
	 */
	is_expired: boolean;
	/**
	 * @type string
	 * @memberOf ISysRefreshTokenView
	 */
	expire_at: string;
}

/**
 * @export
 * @interface ISysSessionView
 */
export interface ISysSessionView {
	/**
	 * @type string
	 * @memberOf ISysSessionView
	 */
	id: string;
	/**
	 * @type string
	 * @memberOf ISysSessionView
	 */
	session_id: string;
	/**
	 * @type string
	 * @memberOf ISysSessionView
	 */
	user_id: string;
	/**
	 * @type string
	 * @memberOf ISysSessionView
	 */
	client_id: string;
	/**
	 * @type string
	 * @memberOf ISysSessionView
	 */
	date_created: string;
	/**
	 * @type string
	 * @memberOf ISysSessionView
	 */
	oidc_client_id: string;
	/**
	 * @type string
	 * @memberOf ISysSessionView
	 */
	post_logout_redirect_uri: string;
	/**
	 * @type boolean
	 * @memberOf ISysSessionView
	 */
	is_back_channel_post_logout: boolean;
	/**
	 * @type string
	 * @memberOf ISysSessionView
	 */
	oidc_sub_claim: string;
	/**
	 * @type string
	 * @memberOf ISysSessionView
	 */
	client: string;
	/**
	 * @type string
	 * @memberOf ISysSessionView
	 */
	user: string;
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
	/**
	 * @type string
	 * @memberOf ISysUser
	 */
	date_changed?: string;
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
	email?: string;
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
	 * @type string
	 * @memberOf ISysRole
	 */
	role_type?: string;
	/**
	 * @type boolean
	 * @memberOf ISysRole
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
	is_active?: boolean;
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
	description?: string;
	/**
	 * @type boolean
	 * @memberOf ISysApplication
	 */
	is_active?: boolean;
}

/**
 * @export
 * @interface ISysClient
 */
export interface ISysClient {
	/**
	 * @type string
	 * @memberOf ISysClient
	 */
	id?: string;
	/**
	 * @type string
	 * @memberOf ISysClient
	 */
	client_id: string;
	/**
	 * @type string
	 * @memberOf ISysClient
	 */
	client_type: string;
	/**
	 * @type boolean
	 * @memberOf ISysClient
	 */
	is_active?: boolean;
	/**
	 * @type string
	 * @memberOf ISysClient
	 */
	description?: string;
	/**
	 * @type string
	 * @memberOf ISysClient
	 */
	secret?: string;
	/**
	 * @type number
	 * @memberOf ISysClient
	 */
	access_token_ttl?: number;
	/**
	 * @type number
	 * @memberOf ISysClient
	 */
	refresh_token_ttl?: number;
	/**
	 * @type string
	 * @memberOf ISysClient
	 */
	valid_from?: string;
	/**
	 * @type string
	 * @memberOf ISysClient
	 */
	valid_until?: string;
	/**
	 * @type string
	 * @memberOf ISysClient
	 */
	redirect_uri?: string;
	/**
	 * @type string
	 * @memberOf ISysClient
	 */
	client_credentials_user_id?: string;
	/**
	 * @type string
	 * @memberOf ISysClient
	 */
	application_id: string;
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
	is_system_client?: boolean;
}

/**
 * @export
 * @interface ISysSession
 */
export interface ISysSession {
	/**
	 * @type string
	 * @memberOf ISysSession
	 */
	id?: string;
	/**
	 * @type string
	 * @memberOf ISysSession
	 */
	session_id: string;
	/**
	 * @type string
	 * @memberOf ISysSession
	 */
	user_id: string;
	/**
	 * @type string
	 * @memberOf ISysSession
	 */
	client_id: string;
	/**
	 * @type string
	 * @memberOf ISysSession
	 */
	date_created?: string;
}

/**
 * @export
 * @interface ISysAccessToken
 */
export interface ISysAccessToken {
	/**
	 * @type string
	 * @memberOf ISysAccessToken
	 */
	id?: string;
	/**
	 * @type number
	 * @memberOf ISysAccessToken
	 */
	ttl: number;
	/**
	 * @type number
	 * @memberOf ISysAccessToken
	 */
	refresh_ttl: number;
	/**
	 * @type number
	 * @memberOf ISysAccessToken
	 */
	auth_time: number;
	/**
	 * @type string
	 * @memberOf ISysAccessToken
	 */
	date_created?: string;
	/**
	 * @type ISysAccessTokenAuthRequestParams
	 * @memberOf ISysAccessToken
	 */
	auth_request_params?: ISysAccessTokenAuthRequestParams;
	/**
	 * @type string
	 * @memberOf ISysAccessToken
	 */
	access_token?: string;
	/**
	 * @type string
	 * @memberOf ISysAccessToken
	 */
	session_id: string;
	/**
	 * @type string
	 * @memberOf ISysAccessToken
	 */
	user_id: string;
	/**
	 * @type string
	 * @memberOf ISysAccessToken
	 */
	client_id: string;
	/**
	 * @type string
	 * @memberOf ISysAccessToken
	 */
	tenant_id: string;
}

/**
 * @export
 * @interface ISysRefreshToken
 */
export interface ISysRefreshToken {
	/**
	 * @type string
	 * @memberOf ISysRefreshToken
	 */
	id?: string;
	/**
	 * @type number
	 * @memberOf ISysRefreshToken
	 */
	ttl: number;
	/**
	 * @type string
	 * @memberOf ISysRefreshToken
	 */
	date_created?: string;
	/**
	 * @type string
	 * @memberOf ISysRefreshToken
	 */
	refresh_token?: string;
	/**
	 * @type string
	 * @memberOf ISysRefreshToken
	 */
	access_token_id: string;
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
