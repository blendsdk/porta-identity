/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

/**
 * Enum of the type any_index
 * @export
 * @enum
 */
export enum eAnyIndex {
	$name = "any_index"
}

/**
 * Enum of the type mfa_settings
 * @export
 * @enum
 */
export enum eMfaSettings {
	$name = "mfa_settings"
}

/**
 * Enum of the type ops_response
 * @export
 * @enum
 */
export enum eOpsResponse {
	$name = "ops_response",
	MESSAGE = "message",
	SUCCESS = "success"
}

/**
 * Enum of the type sys_tenant
 * @export
 * @enum
 */
export enum eSysTenant {
	$name = "sys_tenant",
	ID = "id",
	NAME = "name",
	DATABASE = "database",
	IS_ACTIVE = "is_active",
	ALLOW_RESET_PASSWORD = "allow_reset_password",
	ALLOW_REGISTRATION = "allow_registration",
	AUTH_SESSION_LENGTH_HOURS = "auth_session_length_hours",
	ORGANIZATION = "organization"
}

/**
 * Enum of the type sys_key
 * @export
 * @enum
 */
export enum eSysKey {
	$name = "sys_key",
	ID = "id",
	KEY_TYPE = "key_type",
	KEY_ID = "key_id",
	DATA = "data"
}

/**
 * Enum of the type sys_application
 * @export
 * @enum
 */
export enum eSysApplication {
	$name = "sys_application",
	ID = "id",
	LOGO = "logo",
	APPLICATION_NAME = "application_name",
	CLIENT_ID = "client_id",
	DESCRIPTION = "description",
	IS_SYSTEM = "is_system",
	IS_ACTIVE = "is_active",
	OW_CONSENT = "ow_consent",
	TENANT_ID = "tenant_id"
}

/**
 * Enum of the type sys_secret
 * @export
 * @enum
 */
export enum eSysSecret {
	$name = "sys_secret",
	ID = "id",
	SECRET = "secret",
	DESCRIPTION = "description",
	VALID_FROM = "valid_from",
	VALID_TO = "valid_to",
	IS_SYSTEM = "is_system",
	APPLICATION_ID = "application_id"
}

/**
 * Enum of the type sys_client
 * @export
 * @enum
 */
export enum eSysClient {
	$name = "sys_client",
	ID = "id",
	CLIENT_TYPE = "client_type",
	REDIRECT_URI = "redirect_uri",
	POST_LOGOUT_REDIRECT_URI = "post_logout_redirect_uri",
	IS_BACK_CHANNEL_POST_LOGOUT = "is_back_channel_post_logout",
	IS_SYSTEM = "is_system",
	IS_ACTIVE = "is_active",
	ACCESS_TOKEN_LENGTH = "access_token_length",
	REFRESH_TOKEN_LENGTH = "refresh_token_length",
	APPLICATION_ID = "application_id",
	MFA_BYPASS_DAYS = "mfa_bypass_days",
	MFA_ID = "mfa_id"
}

/**
 * Enum of the type sys_extension
 * @export
 * @enum
 */
export enum eSysExtension {
	$name = "sys_extension",
	EXTENSION_ID = "extension_id",
	NAME = "name",
	VERSION = "version",
	DESCRIPTION = "description",
	SOURCE = "source",
	OPTIONS = "options",
	IS_ACTIVE = "is_active",
	DATE_CREATED = "date_created"
}

/**
 * Enum of the type sys_user
 * @export
 * @enum
 */
export enum eSysUser {
	$name = "sys_user",
	ID = "id",
	USERNAME = "username",
	PASSWORD = "password",
	IS_ACTIVE = "is_active",
	IS_SYSTEM = "is_system",
	DATE_CREATED = "date_created",
	DATE_MODIFIED = "date_modified",
	SERVICE_APPLICATION_ID = "service_application_id"
}

/**
 * Enum of the type sys_profile
 * @export
 * @enum
 */
export enum eSysProfile {
	$name = "sys_profile",
	ID = "id",
	EMAIL = "email",
	FIRSTNAME = "firstname",
	LASTNAME = "lastname",
	WEBSITE = "website",
	ZONEINFO = "zoneinfo",
	BIRTHDATE = "birthdate",
	GENDER = "gender",
	MIDDLE_NAME = "middle_name",
	LOCALE = "locale",
	AVATAR = "avatar",
	ADDRESS = "address",
	POSTALCODE = "postalcode",
	CITY = "city",
	COUNTRY = "country",
	STATE = "state",
	PHONE_NUMBER = "phone_number",
	PHONE_NUMBER_VERIFIED = "phone_number_verified",
	USER_ID = "user_id",
	DATE_CREATED = "date_created",
	USER_STATE = "user_state",
	DATE_MODIFIED = "date_modified"
}

/**
 * Enum of the type sys_role
 * @export
 * @enum
 */
export enum eSysRole {
	$name = "sys_role",
	ID = "id",
	ROLE = "role",
	DESCRIPTION = "description",
	IS_SYSTEM = "is_system",
	IS_ACTIVE = "is_active"
}

/**
 * Enum of the type sys_permission
 * @export
 * @enum
 */
export enum eSysPermission {
	$name = "sys_permission",
	ID = "id",
	PERMISSION = "permission",
	DESCRIPTION = "description",
	APPLICATION_ID = "application_id",
	IS_SYSTEM = "is_system",
	IS_ACTIVE = "is_active"
}

/**
 * Enum of the type sys_user_role
 * @export
 * @enum
 */
export enum eSysUserRole {
	$name = "sys_user_role",
	ID = "id",
	USER_ID = "user_id",
	ROLE_ID = "role_id"
}

/**
 * Enum of the type sys_role_permission
 * @export
 * @enum
 */
export enum eSysRolePermission {
	$name = "sys_role_permission",
	ID = "id",
	ROLE_ID = "role_id",
	PERMISSION_ID = "permission_id"
}

/**
 * Enum of the type sys_session
 * @export
 * @enum
 */
export enum eSysSession {
	$name = "sys_session",
	ID = "id",
	USER_ID = "user_id",
	DATE_CREATED = "date_created",
	LAST_TOKEN_AUTH_TIME = "last_token_auth_time",
	DATE_EXPIRE = "date_expire"
}

/**
 * Enum of the type sys_application_session
 * @export
 * @enum
 */
export enum eSysApplicationSession {
	$name = "sys_application_session",
	ID = "id",
	APPLICATION_ID = "application_id",
	SESSION_ID = "session_id"
}

/**
 * Enum of the type sys_access_token
 * @export
 * @enum
 */
export enum eSysAccessToken {
	$name = "sys_access_token",
	ID = "id",
	DATE_EXPIRE = "date_expire",
	AUTH_TIME = "auth_time",
	OTA = "ota",
	AUTH_REQUEST_PARAMS = "auth_request_params",
	TOKEN_REFERENCE = "token_reference",
	ACCESS_TOKEN = "access_token",
	SESSION_ID = "session_id",
	USER_ID = "user_id",
	CLIENT_ID = "client_id",
	TENANT_ID = "tenant_id"
}

/**
 * Enum of the type sys_refresh_token
 * @export
 * @enum
 */
export enum eSysRefreshToken {
	$name = "sys_refresh_token",
	ID = "id",
	DATE_EXPIRE = "date_expire",
	DATE_CREATED = "date_created",
	REFRESH_TOKEN = "refresh_token",
	ACCESS_TOKEN_ID = "access_token_id"
}

/**
 * Enum of the type sys_consent
 * @export
 * @enum
 */
export enum eSysConsent {
	$name = "sys_consent",
	ID = "id",
	IS_CONSENT = "is_consent",
	SCOPE = "scope",
	APPLICATION_ID = "application_id",
	USER_ID = "user_id"
}

/**
 * Enum of the type sys_mfa
 * @export
 * @enum
 */
export enum eSysMfa {
	$name = "sys_mfa",
	ID = "id",
	NAME = "name",
	SETTINGS = "settings"
}

/**
 * Enum of the type sys_secret_view
 * @export
 * @enum
 */
export enum eSysSecretView {
	$name = "sys_secret_view",
	ID = "id",
	CLIENT_SECRET = "client_secret",
	DESCRIPTION = "description",
	VALID_FROM = "valid_from",
	VALID_TO = "valid_to",
	IS_SYSTEM = "is_system",
	CLIENT_ID = "client_id",
	APPLICATION_ID = "application_id",
	CLIENT_CREDENTIAL_USER_ID = "client_credential_user_id",
	IS_EXPIRED = "is_expired"
}

/**
 * Enum of the type sys_authorization_view
 * @export
 * @enum
 */
export enum eSysAuthorizationView {
	$name = "sys_authorization_view",
	APPLICATION_ID = "application_id",
	OW_CONSENT = "ow_consent",
	LOGO = "logo",
	APPLICATION_NAME = "application_name",
	CLIENT_ID = "client_id",
	CLIENT_TYPE = "client_type",
	REDIRECT_URI = "redirect_uri",
	POST_LOGOUT_REDIRECT_URI = "post_logout_redirect_uri",
	IS_BACK_CHANNEL_POST_LOGOUT = "is_back_channel_post_logout",
	ACCESS_TOKEN_LENGTH = "access_token_length",
	REFRESH_TOKEN_LENGTH = "refresh_token_length",
	MFA = "mfa",
	MFA_SETTINGS = "mfa_settings",
	MFA_BYPASS_DAYS = "mfa_bypass_days",
	AUTH_SESSION_LENGTH_HOURS = "auth_session_length_hours",
	TENANT_ID = "tenant_id",
	SYS_CLIENT_ID = "sys_client_id"
}

/**
 * Enum of the type sys_access_token_view
 * @export
 * @enum
 */
export enum eSysAccessTokenView {
	$name = "sys_access_token_view",
	ID = "id",
	ACCESS_TOKEN = "access_token",
	AUTH_REQUEST_PARAMS = "auth_request_params",
	AUTH_TIME = "auth_time",
	TOKEN_REFERENCE = "token_reference",
	SESSION = "session",
	USER = "user",
	PROFILE = "profile",
	CLIENT = "client",
	TENANT = "tenant",
	IS_EXPIRED = "is_expired"
}

/**
 * Enum of the type sys_refresh_token_view
 * @export
 * @enum
 */
export enum eSysRefreshTokenView {
	$name = "sys_refresh_token_view",
	ID = "id",
	REFRESH_TOKEN = "refresh_token",
	DATE_CREATED = "date_created",
	ACCESS_TOKEN = "access_token",
	SESSION = "session",
	USER = "user",
	PROFILE = "profile",
	CLIENT = "client",
	TENANT = "tenant",
	APPLICATION = "application",
	IS_EXPIRED = "is_expired"
}

/**
 * Enum of the type sys_user_permission_view
 * @export
 * @enum
 */
export enum eSysUserPermissionView {
	$name = "sys_user_permission_view",
	USER_ID = "user_id",
	APPLICATION_ID = "application_id",
	PERMISSION = "permission",
	PERMISSION_ID = "permission_id",
	ROLE = "role",
	ROLE_ID = "role_id"
}

/**
 * Enum of the type sys_session_view
 * @export
 * @enum
 */
export enum eSysSessionView {
	$name = "sys_session_view",
	SESSION_ID = "session_id",
	CLIENT_ID = "client_id",
	USER_ID = "user_id",
	SESSION = "session",
	APPLICATION = "application",
	CLIENT = "client"
}

/**
 * Enum of the type porta_account
 * @export
 * @enum
 */
export enum ePortaAccount {
	$name = "porta_account",
	APPLICATION = "application",
	SESSION = "session",
	USER = "user",
	PROFILE = "profile",
	TENANT = "tenant",
	CLIENT = "client",
	ROLES = "roles",
	PERMISSIONS = "permissions"
}

/**
 * Enum of the type error_data
 * @export
 * @enum
 */
export enum eErrorData {
	$name = "error_data",
	ERROR = "error",
	TYPE = "type",
	CONTEXT = "context"
}
