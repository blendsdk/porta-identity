/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

/**
 * Enum of the type authentication_flow_state
 * @export
 * @enum
 */
export const eAuthenticationFlowState = {
	$name: "authentication_flow_state",
	ACCOUNT: "account",
	ACCOUNT_STATUS: "account_status",
	ACCOUNT_STATE: "account_state",
	PASSWORD_STATE: "password_state",
	SIGNIN_URL: "signin_url",
	MFA_STATE: "mfa_state",
	MFA: "mfa",
	MFA_LIST: "mfa_list"
} as const;
export type eAuthenticationFlowState = (typeof eAuthenticationFlowState)[keyof typeof eAuthenticationFlowState];

/**
 * Enum of the type sys_mfa_settings
 * @export
 * @enum
 */
export const eSysMfaSettings = {
	$name: "sys_mfa_settings"
} as const;
export type eSysMfaSettings = (typeof eSysMfaSettings)[keyof typeof eSysMfaSettings];

/**
 * Enum of the type sys_authorization_view
 * @export
 * @enum
 */
export const eSysAuthorizationView = {
	$name: "sys_authorization_view",
	CONFIDENTIAL_USER_ID: "confidential_user_id",
	CLIENT_ID: "client_id",
	APPLICATION_NAME: "application_name",
	CLIENT_SECRET: "client_secret",
	SESSION_LENGTH: "session_length",
	CLIENT_TYPE: "client_type",
	REDIRECT_URI: "redirect_uri",
	LOGOUT_URI: "logout_uri",
	IOS_BUNDLE_ID: "ios_bundle_id",
	ANDROID_PACKAGE_NAME: "android_package_name",
	ANDROID_SIGNATURE_HASH: "android_signature_hash",
	LOGO: "logo",
	FALLBACK_URI: "fallback_uri"
} as const;
export type eSysAuthorizationView = (typeof eSysAuthorizationView)[keyof typeof eSysAuthorizationView];

/**
 * Enum of the type sys_user_mfa_view
 * @export
 * @enum
 */
export const eSysUserMfaView = {
	$name: "sys_user_mfa_view",
	USER_ID: "user_id",
	MFA_ID: "mfa_id",
	MFA_NAME: "mfa_name",
	MFA_SETTINGS: "mfa_settings"
} as const;
export type eSysUserMfaView = (typeof eSysUserMfaView)[keyof typeof eSysUserMfaView];

/**
 * Enum of the type sys_groups_by_user_view
 * @export
 * @enum
 */
export const eSysGroupsByUserView = {
	$name: "sys_groups_by_user_view",
	ID: "id",
	NAME: "name",
	DESCRIPTION: "description",
	IS_ACTIVE: "is_active",
	USER_ID: "user_id"
} as const;
export type eSysGroupsByUserView = (typeof eSysGroupsByUserView)[keyof typeof eSysGroupsByUserView];

/**
 * Enum of the type sys_user_permission_view
 * @export
 * @enum
 */
export const eSysUserPermissionView = {
	$name: "sys_user_permission_view",
	USER_ID: "user_id",
	PERMISSION_ID: "permission_id",
	CODE: "code",
	IS_ACTIVE: "is_active"
} as const;
export type eSysUserPermissionView = (typeof eSysUserPermissionView)[keyof typeof eSysUserPermissionView];

/**
 * Enum of the type sys_tenant
 * @export
 * @enum
 */
export const eSysTenant = {
	$name: "sys_tenant",
	ID: "id",
	NAME: "name",
	DATABASE: "database",
	IS_ACTIVE: "is_active",
	ALLOW_RESET_PASSWORD: "allow_reset_password",
	ALLOW_REGISTRATION: "allow_registration",
	ORGANIZATION: "organization"
} as const;
export type eSysTenant = (typeof eSysTenant)[keyof typeof eSysTenant];

/**
 * Enum of the type sys_user
 * @export
 * @enum
 */
export const eSysUser = {
	$name: "sys_user",
	ID: "id",
	USERNAME: "username",
	PASSWORD: "password",
	IS_ACTIVE: "is_active",
	DATE_CREATED: "date_created"
} as const;
export type eSysUser = (typeof eSysUser)[keyof typeof eSysUser];

/**
 * Enum of the type sys_user_profile
 * @export
 * @enum
 */
export const eSysUserProfile = {
	$name: "sys_user_profile",
	ID: "id",
	FIRSTNAME: "firstname",
	LASTNAME: "lastname",
	AVATAR: "avatar",
	USER_ID: "user_id",
	DATE_CREATED: "date_created",
	DATE_CHANGED: "date_changed"
} as const;
export type eSysUserProfile = (typeof eSysUserProfile)[keyof typeof eSysUserProfile];

/**
 * Enum of the type sys_group
 * @export
 * @enum
 */
export const eSysGroup = {
	$name: "sys_group",
	ID: "id",
	NAME: "name",
	DESCRIPTION: "description",
	IS_ACTIVE: "is_active"
} as const;
export type eSysGroup = (typeof eSysGroup)[keyof typeof eSysGroup];

/**
 * Enum of the type sys_user_group
 * @export
 * @enum
 */
export const eSysUserGroup = {
	$name: "sys_user_group",
	ID: "id",
	USER_ID: "user_id",
	GROUP_ID: "group_id"
} as const;
export type eSysUserGroup = (typeof eSysUserGroup)[keyof typeof eSysUserGroup];

/**
 * Enum of the type sys_permission
 * @export
 * @enum
 */
export const eSysPermission = {
	$name: "sys_permission",
	ID: "id",
	CODE: "code",
	DESCRIPTION: "description",
	IS_ACTIVE: "is_active"
} as const;
export type eSysPermission = (typeof eSysPermission)[keyof typeof eSysPermission];

/**
 * Enum of the type sys_group_permission
 * @export
 * @enum
 */
export const eSysGroupPermission = {
	$name: "sys_group_permission",
	ID: "id",
	GROUP_ID: "group_id",
	PERMISSION_ID: "permission_id"
} as const;
export type eSysGroupPermission = (typeof eSysGroupPermission)[keyof typeof eSysGroupPermission];

/**
 * Enum of the type sys_client
 * @export
 * @enum
 */
export const eSysClient = {
	$name: "sys_client",
	ID: "id",
	CLIENT_ID: "client_id",
	CLIENT_TYPE_ID: "client_type_id",
	LOGO: "logo",
	APPLICATION_NAME: "application_name",
	FALLBACK_URI: "fallback_uri",
	DESCRIPTION: "description",
	SECRET: "secret",
	SESSION_LENGTH: "session_length",
	VALID_FROM: "valid_from",
	VALID_UNTIL: "valid_until"
} as const;
export type eSysClient = (typeof eSysClient)[keyof typeof eSysClient];

/**
 * Enum of the type sys_client_type
 * @export
 * @enum
 */
export const eSysClientType = {
	$name: "sys_client_type",
	ID: "id",
	CLIENT_TYPE: "client_type",
	DESCRIPTION: "description"
} as const;
export type eSysClientType = (typeof eSysClientType)[keyof typeof eSysClientType];

/**
 * Enum of the type sys_redirect
 * @export
 * @enum
 */
export const eSysRedirect = {
	$name: "sys_redirect",
	ID: "id",
	CLIENT_ID: "client_id",
	REDIRECT_URI: "redirect_uri",
	LOGOUT_URI: "logout_uri",
	IOS_BUNDLE_ID: "ios_bundle_id",
	ANDROID_PACKAGE_NAME: "android_package_name",
	ANDROID_SIGNATURE_HASH: "android_signature_hash"
} as const;
export type eSysRedirect = (typeof eSysRedirect)[keyof typeof eSysRedirect];

/**
 * Enum of the type sys_confidential_client
 * @export
 * @enum
 */
export const eSysConfidentialClient = {
	$name: "sys_confidential_client",
	ID: "id",
	CLIENT_ID: "client_id",
	USER_ID: "user_id"
} as const;
export type eSysConfidentialClient = (typeof eSysConfidentialClient)[keyof typeof eSysConfidentialClient];

/**
 * Enum of the type sys_mfa
 * @export
 * @enum
 */
export const eSysMfa = {
	$name: "sys_mfa",
	ID: "id",
	NAME: "name",
	SETTINGS: "settings"
} as const;
export type eSysMfa = (typeof eSysMfa)[keyof typeof eSysMfa];

/**
 * Enum of the type sys_user_mfa
 * @export
 * @enum
 */
export const eSysUserMfa = {
	$name: "sys_user_mfa",
	ID: "id",
	USER_ID: "user_id",
	MFA_ID: "mfa_id"
} as const;
export type eSysUserMfa = (typeof eSysUserMfa)[keyof typeof eSysUserMfa];

/**
 * Enum of the type sys_key
 * @export
 * @enum
 */
export const eSysKey = {
	$name: "sys_key",
	ID: "id",
	KEY_TYPE: "key_type",
	KEY_ID: "key_id",
	DATA: "data"
} as const;
export type eSysKey = (typeof eSysKey)[keyof typeof eSysKey];

/**
 * Enum of the type porta_account
 * @export
 * @enum
 */
export const ePortaAccount = {
	$name: "porta_account",
	USER: "user",
	PROFILE: "profile",
	TENANT: "tenant"
} as const;
export type ePortaAccount = (typeof ePortaAccount)[keyof typeof ePortaAccount];

/**
 * Enum of the type error_data
 * @export
 * @enum
 */
export const eErrorData = {
	$name: "error_data",
	ERROR: "error",
	TYPE: "type",
	CONTEXT: "context"
} as const;
export type eErrorData = (typeof eErrorData)[keyof typeof eErrorData];
