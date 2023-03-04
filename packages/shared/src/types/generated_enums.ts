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
 * Enum of the type sys_tenant
 * @export
 * @enum
 */
export const eSysTenant = {
	$name: "sys_tenant",
	ID: "id",
	NAME: "name",
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
