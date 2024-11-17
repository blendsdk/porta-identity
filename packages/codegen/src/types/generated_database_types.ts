/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

import { IAnyIndex, IMfaSettings } from "./generated_types";

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
	 * @type boolean
	 * @memberOf ISysTenant
	 */
	pw_change_first_login?: boolean;
	/**
	 * @type number
	 * @memberOf ISysTenant
	 */
	auth_session_length_hours?: number;
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
	/**
	 * @type boolean
	 * @memberOf ISysApplication
	 */
	ow_consent?: boolean;
	/**
	 * @type string
	 * @memberOf ISysApplication
	 */
	tenant_id: string;
}

/**
 * @export
 * @interface ISysSecret
 */
export interface ISysSecret {
	/**
	 * @type string
	 * @memberOf ISysSecret
	 */
	id?: string;
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
	 * @type string
	 * @memberOf ISysSecret
	 */
	valid_from: string;
	/**
	 * @type string
	 * @memberOf ISysSecret
	 */
	valid_to: string;
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
	 * @type string
	 * @memberOf ISysClient
	 */
	id?: string;
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
	/**
	 * @type number
	 * @memberOf ISysClient
	 */
	mfa_bypass_days?: number;
	/**
	 * @type string
	 * @memberOf ISysClient
	 */
	mfa_id?: string;
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
	 * @type boolean
	 * @memberOf ISysUser
	 */
	require_pw_change?: boolean;
	/**
	 * @type string
	 * @memberOf ISysUser
	 */
	date_created?: string;
	/**
	 * @type string
	 * @memberOf ISysUser
	 */
	date_modified?: string;
	/**
	 * @type string
	 * @memberOf ISysUser
	 */
	service_application_id?: string;
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
	website?: string;
	/**
	 * @type string
	 * @memberOf ISysProfile
	 */
	zoneinfo?: string;
	/**
	 * @type string
	 * @memberOf ISysProfile
	 */
	birthdate?: string;
	/**
	 * @type string
	 * @memberOf ISysProfile
	 */
	gender?: string;
	/**
	 * @type string
	 * @memberOf ISysProfile
	 */
	middle_name?: string;
	/**
	 * @type string
	 * @memberOf ISysProfile
	 */
	locale?: string;
	/**
	 * @type string
	 * @memberOf ISysProfile
	 */
	avatar?: string;
	/**
	 * @type string
	 * @memberOf ISysProfile
	 */
	address?: string;
	/**
	 * @type string
	 * @memberOf ISysProfile
	 */
	postalcode?: string;
	/**
	 * @type string
	 * @memberOf ISysProfile
	 */
	city?: string;
	/**
	 * @type string
	 * @memberOf ISysProfile
	 */
	country?: string;
	/**
	 * @type string
	 * @memberOf ISysProfile
	 */
	state?: string;
	/**
	 * @type string
	 * @memberOf ISysProfile
	 */
	phone_number?: string;
	/**
	 * @type boolean
	 * @memberOf ISysProfile
	 */
	phone_number_verified?: boolean;
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
	user_state?: string;
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
	application_id?: string;
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
	user_id: string;
	/**
	 * @type string
	 * @memberOf ISysSession
	 */
	date_created?: string;
	/**
	 * @type string
	 * @memberOf ISysSession
	 */
	last_token_auth_time?: string;
	/**
	 * @type string
	 * @memberOf ISysSession
	 */
	date_expire: string;
}

/**
 * @export
 * @interface ISysApplicationSession
 */
export interface ISysApplicationSession {
	/**
	 * @type string
	 * @memberOf ISysApplicationSession
	 */
	id?: string;
	/**
	 * @type string
	 * @memberOf ISysApplicationSession
	 */
	application_id: string;
	/**
	 * @type string
	 * @memberOf ISysApplicationSession
	 */
	session_id: string;
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
	 * @type string
	 * @memberOf ISysAccessToken
	 */
	date_expire: string;
	/**
	 * @type string
	 * @memberOf ISysAccessToken
	 */
	auth_time: string;
	/**
	 * @type string
	 * @memberOf ISysAccessToken
	 */
	ota?: string;
	/**
	 * @type IAnyIndex
	 * @memberOf ISysAccessToken
	 */
	auth_request_params: IAnyIndex;
	/**
	 * @type string
	 * @memberOf ISysAccessToken
	 */
	token_reference?: string;
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
	 * @type string
	 * @memberOf ISysRefreshToken
	 */
	date_expire: string;
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
 * @interface ISysConsent
 */
export interface ISysConsent {
	/**
	 * @type string
	 * @memberOf ISysConsent
	 */
	id?: string;
	/**
	 * @type boolean
	 * @memberOf ISysConsent
	 */
	is_consent: boolean;
	/**
	 * @type string
	 * @memberOf ISysConsent
	 */
	scope: string;
	/**
	 * @type string
	 * @memberOf ISysConsent
	 */
	application_id: string;
	/**
	 * @type string
	 * @memberOf ISysConsent
	 */
	user_id: string;
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
	 * @type IMfaSettings
	 * @memberOf ISysMfa
	 */
	settings?: IMfaSettings;
}

/**
 * @export
 * @interface ISysSecretView
 */
export interface ISysSecretView {
	/**
	 * @type string
	 * @memberOf ISysSecretView
	 */
	id: string;
	/**
	 * @type string
	 * @memberOf ISysSecretView
	 */
	client_secret: string;
	/**
	 * @type string
	 * @memberOf ISysSecretView
	 */
	description: string;
	/**
	 * @type string
	 * @memberOf ISysSecretView
	 */
	valid_from: string;
	/**
	 * @type string
	 * @memberOf ISysSecretView
	 */
	valid_to: string;
	/**
	 * @type boolean
	 * @memberOf ISysSecretView
	 */
	is_system: boolean;
	/**
	 * @type string
	 * @memberOf ISysSecretView
	 */
	client_id: string;
	/**
	 * @type string
	 * @memberOf ISysSecretView
	 */
	application_id: string;
	/**
	 * @type string
	 * @memberOf ISysSecretView
	 */
	client_credential_user_id: string;
	/**
	 * @type boolean
	 * @memberOf ISysSecretView
	 */
	is_expired: boolean;
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
	application_id: string;
	/**
	 * @type boolean
	 * @memberOf ISysAuthorizationView
	 */
	ow_consent: boolean;
	/**
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	logo: string;
	/**
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	application_name: string;
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
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	redirect_uri: string;
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
	 * @type number
	 * @memberOf ISysAuthorizationView
	 */
	access_token_length: number;
	/**
	 * @type number
	 * @memberOf ISysAuthorizationView
	 */
	refresh_token_length: number;
	/**
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	mfa: string;
	/**
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	mfa_settings: string;
	/**
	 * @type number
	 * @memberOf ISysAuthorizationView
	 */
	mfa_bypass_days: number;
	/**
	 * @type number
	 * @memberOf ISysAuthorizationView
	 */
	auth_session_length_hours: number;
	/**
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	tenant_id: string;
	/**
	 * @type string
	 * @memberOf ISysAuthorizationView
	 */
	sys_client_id: string;
}

/**
 * @export
 * @interface ISysAccessTokenView
 */
export interface ISysAccessTokenView {
	/**
	 * @type string
	 * @memberOf ISysAccessTokenView
	 */
	id: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenView
	 */
	access_token: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenView
	 */
	auth_request_params: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenView
	 */
	auth_time: string;
	/**
	 * @type string
	 * @memberOf ISysAccessTokenView
	 */
	token_reference: string;
	/**
	 * @type ISysSession
	 * @memberOf ISysAccessTokenView
	 */
	session: ISysSession;
	/**
	 * @type ISysUser
	 * @memberOf ISysAccessTokenView
	 */
	user: ISysUser;
	/**
	 * @type ISysProfile
	 * @memberOf ISysAccessTokenView
	 */
	profile: ISysProfile;
	/**
	 * @type ISysClient
	 * @memberOf ISysAccessTokenView
	 */
	client: ISysClient;
	/**
	 * @type ISysTenant
	 * @memberOf ISysAccessTokenView
	 */
	tenant: ISysTenant;
	/**
	 * @type boolean
	 * @memberOf ISysAccessTokenView
	 */
	is_expired: boolean;
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
	 * @type string
	 * @memberOf ISysRefreshTokenView
	 */
	refresh_token: string;
	/**
	 * @type string
	 * @memberOf ISysRefreshTokenView
	 */
	date_created: string;
	/**
	 * @type ISysAccessToken
	 * @memberOf ISysRefreshTokenView
	 */
	access_token: ISysAccessToken;
	/**
	 * @type ISysSession
	 * @memberOf ISysRefreshTokenView
	 */
	session: ISysSession;
	/**
	 * @type ISysUser
	 * @memberOf ISysRefreshTokenView
	 */
	user: ISysUser;
	/**
	 * @type ISysProfile
	 * @memberOf ISysRefreshTokenView
	 */
	profile: ISysProfile;
	/**
	 * @type ISysClient
	 * @memberOf ISysRefreshTokenView
	 */
	client: ISysClient;
	/**
	 * @type ISysTenant
	 * @memberOf ISysRefreshTokenView
	 */
	tenant: ISysTenant;
	/**
	 * @type ISysApplication
	 * @memberOf ISysRefreshTokenView
	 */
	application: ISysApplication;
	/**
	 * @type boolean
	 * @memberOf ISysRefreshTokenView
	 */
	is_expired: boolean;
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
	user_id: string;
	/**
	 * @type string
	 * @memberOf ISysUserPermissionView
	 */
	application_id: string;
	/**
	 * @type string
	 * @memberOf ISysUserPermissionView
	 */
	permission: string;
	/**
	 * @type string
	 * @memberOf ISysUserPermissionView
	 */
	permission_id: string;
	/**
	 * @type string
	 * @memberOf ISysUserPermissionView
	 */
	role: string;
	/**
	 * @type string
	 * @memberOf ISysUserPermissionView
	 */
	role_id: string;
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
	session_id: string;
	/**
	 * @type string
	 * @memberOf ISysSessionView
	 */
	client_id: string;
	/**
	 * @type string
	 * @memberOf ISysSessionView
	 */
	user_id: string;
	/**
	 * @type ISysSession
	 * @memberOf ISysSessionView
	 */
	session: ISysSession;
	/**
	 * @type ISysApplication
	 * @memberOf ISysSessionView
	 */
	application: ISysApplication;
	/**
	 * @type ISysClient
	 * @memberOf ISysSessionView
	 */
	client: ISysClient;
}
