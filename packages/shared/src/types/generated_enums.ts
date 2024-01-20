/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

/**
 * Enum of the type authentication_flow_state
 * @export
 * @enum
 */
export enum eAuthenticationFlowState {
	$name = "authentication_flow_state",
	ACCOUNT = "account",
	ACCOUNT_STATUS = "account_status",
	ACCOUNT_STATE = "account_state",
	PASSWORD_STATE = "password_state",
	SIGNIN_URL = "signin_url",
	MFA_STATE = "mfa_state",
	MFA_LIST = "mfa_list"
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
 * Enum of the type sys_mfa_settings
 * @export
 * @enum
 */
export enum eSysMfaSettings {
	$name = "sys_mfa_settings"
}

/**
 * Enum of the type sys_access_token_auth_request_params
 * @export
 * @enum
 */
export enum eSysAccessTokenAuthRequestParams {
	$name = "sys_access_token_auth_request_params",
	UI_LOCALES = "ui_locales",
	CLAIMS = "claims",
	ACR_VALUES = "acr_values",
	RESOURCE = "resource",
	TOKEN_REFERENCE = "token_reference",
	SCOPE = "scope"
}

/**
 * Enum of the type sys_client_view
 * @export
 * @enum
 */
export enum eSysClientView {
	$name = "sys_client_view",
	ID = "id",
	CLIENT_ID = "client_id",
	CLIENT_TYPE = "client_type",
	IS_ACTIVE = "is_active",
	DESCRIPTION = "description",
	SECRET = "secret",
	ACCESS_TOKEN_TTL = "access_token_ttl",
	REFRESH_TOKEN_TTL = "refresh_token_ttl",
	VALID_FROM = "valid_from",
	VALID_UNTIL = "valid_until",
	REDIRECT_URI = "redirect_uri",
	CLIENT_CREDENTIALS_USER_ID = "client_credentials_user_id",
	APPLICATION_ID = "application_id",
	POST_LOGOUT_REDIRECT_URI = "post_logout_redirect_uri",
	IS_BACK_CHANNEL_POST_LOGOUT = "is_back_channel_post_logout",
	IS_SYSTEM_CLIENT = "is_system_client",
	APPLICATION_NAME = "application_name",
	LOGO = "logo"
}

/**
 * Enum of the type sys_authorization_view
 * @export
 * @enum
 */
export enum eSysAuthorizationView {
	$name = "sys_authorization_view",
	ID = "id",
	CLIENT_ID = "client_id",
	CLIENT_TYPE = "client_type",
	IS_ACTIVE = "is_active",
	DESCRIPTION = "description",
	SECRET = "secret",
	ACCESS_TOKEN_TTL = "access_token_ttl",
	REFRESH_TOKEN_TTL = "refresh_token_ttl",
	VALID_FROM = "valid_from",
	VALID_UNTIL = "valid_until",
	REDIRECT_URI = "redirect_uri",
	CLIENT_CREDENTIALS_USER_ID = "client_credentials_user_id",
	APPLICATION_ID = "application_id",
	POST_LOGOUT_REDIRECT_URI = "post_logout_redirect_uri",
	IS_BACK_CHANNEL_POST_LOGOUT = "is_back_channel_post_logout",
	IS_SYSTEM_CLIENT = "is_system_client",
	APPLICATION_NAME = "application_name",
	LOGO = "logo",
	CLIENT_CREDENTIALS_USER = "client_credentials_user"
}

/**
 * Enum of the type sys_user_mfa_view
 * @export
 * @enum
 */
export enum eSysUserMfaView {
	$name = "sys_user_mfa_view",
	USER_ID = "user_id",
	MFA_ID = "mfa_id",
	MFA_NAME = "mfa_name",
	MFA_SETTINGS = "mfa_settings"
}

/**
 * Enum of the type sys_roles_by_user_view
 * @export
 * @enum
 */
export enum eSysRolesByUserView {
	$name = "sys_roles_by_user_view",
	ID = "id",
	ROLE = "role",
	DESCRIPTION = "description",
	ROLE_TYPE = "role_type",
	IS_ACTIVE = "is_active",
	USER_ID = "user_id"
}

/**
 * Enum of the type sys_user_permission_view
 * @export
 * @enum
 */
export enum eSysUserPermissionView {
	$name = "sys_user_permission_view",
	APPLICATION_ID = "application_id",
	CLIENT_ID = "client_id",
	OIDC_CLIENT_ID = "oidc_client_id",
	USER_ID = "user_id",
	PERMISSION_ID = "permission_id",
	ROLE_ID = "role_id",
	PERMISSION = "permission",
	IS_ACTIVE = "is_active",
	ROLE = "role",
	ROLE_DESCRIPTION = "role_description",
	PERMISSION_DESCRIPTION = "permission_description",
	ROLE_IS_ACTIVE = "role_is_active"
}

/**
 * Enum of the type sys_access_token_view
 * @export
 * @enum
 */
export enum eSysAccessTokenView {
	$name = "sys_access_token_view",
	DEFAULT_TTL = "default_ttl",
	DEFAULT_REFRESH_TTL = "default_refresh_ttl",
	TTL = "ttl",
	REFRESH_TTL = "refresh_ttl",
	ID = "id",
	AUTH_TIME = "auth_time",
	DATE_CREATED = "date_created",
	AUTH_REQUEST_PARAMS = "auth_request_params",
	ACCESS_TOKEN = "access_token",
	SESSION_ID = "session_id",
	USER_ID = "user_id",
	CLIENT_ID = "client_id",
	TENANT_ID = "tenant_id",
	IS_EXPIRED = "is_expired",
	IS_REVOKE = "is_revoke",
	EXPIRE_AT = "expire_at",
	REVOKE_AT = "revoke_at",
	USER = "user",
	PROFILE = "profile",
	CLIENT = "client",
	TENANT = "tenant",
	SESSION = "session"
}

/**
 * Enum of the type sys_refresh_token_view
 * @export
 * @enum
 */
export enum eSysRefreshTokenView {
	$name = "sys_refresh_token_view",
	ID = "id",
	TTL = "ttl",
	REFRESH_TOKEN = "refresh_token",
	ACCESS_TOKEN = "access_token",
	IS_EXPIRED = "is_expired",
	EXPIRE_AT = "expire_at"
}

/**
 * Enum of the type sys_session_view
 * @export
 * @enum
 */
export enum eSysSessionView {
	$name = "sys_session_view",
	ID = "id",
	SESSION_ID = "session_id",
	USER_ID = "user_id",
	CLIENT_ID = "client_id",
	DATE_CREATED = "date_created",
	OIDC_CLIENT_ID = "oidc_client_id",
	POST_LOGOUT_REDIRECT_URI = "post_logout_redirect_uri",
	IS_BACK_CHANNEL_POST_LOGOUT = "is_back_channel_post_logout",
	OIDC_SUB_CLAIM = "oidc_sub_claim",
	CLIENT = "client",
	USER = "user"
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
	ORGANIZATION = "organization"
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
	DATE_CREATED = "date_created",
	DATE_CHANGED = "date_changed"
}

/**
 * Enum of the type sys_user_profile
 * @export
 * @enum
 */
export enum eSysUserProfile {
	$name = "sys_user_profile",
	ID = "id",
	EMAIL = "email",
	FIRSTNAME = "firstname",
	LASTNAME = "lastname",
	AVATAR = "avatar",
	USER_ID = "user_id",
	DATE_CREATED = "date_created",
	DATE_CHANGED = "date_changed"
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
	ROLE_TYPE = "role_type",
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
	IS_ACTIVE = "is_active"
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
 * Enum of the type sys_application
 * @export
 * @enum
 */
export enum eSysApplication {
	$name = "sys_application",
	ID = "id",
	LOGO = "logo",
	APPLICATION_NAME = "application_name",
	DESCRIPTION = "description",
	IS_ACTIVE = "is_active"
}

/**
 * Enum of the type sys_client
 * @export
 * @enum
 */
export enum eSysClient {
	$name = "sys_client",
	ID = "id",
	CLIENT_ID = "client_id",
	CLIENT_TYPE = "client_type",
	IS_ACTIVE = "is_active",
	DESCRIPTION = "description",
	SECRET = "secret",
	ACCESS_TOKEN_TTL = "access_token_ttl",
	REFRESH_TOKEN_TTL = "refresh_token_ttl",
	VALID_FROM = "valid_from",
	VALID_UNTIL = "valid_until",
	REDIRECT_URI = "redirect_uri",
	CLIENT_CREDENTIALS_USER_ID = "client_credentials_user_id",
	APPLICATION_ID = "application_id",
	POST_LOGOUT_REDIRECT_URI = "post_logout_redirect_uri",
	IS_BACK_CHANNEL_POST_LOGOUT = "is_back_channel_post_logout",
	IS_SYSTEM_CLIENT = "is_system_client"
}

/**
 * Enum of the type sys_session
 * @export
 * @enum
 */
export enum eSysSession {
	$name = "sys_session",
	ID = "id",
	SESSION_ID = "session_id",
	USER_ID = "user_id",
	CLIENT_ID = "client_id",
	DATE_CREATED = "date_created"
}

/**
 * Enum of the type sys_access_token
 * @export
 * @enum
 */
export enum eSysAccessToken {
	$name = "sys_access_token",
	ID = "id",
	TTL = "ttl",
	REFRESH_TTL = "refresh_ttl",
	AUTH_TIME = "auth_time",
	DATE_CREATED = "date_created",
	AUTH_REQUEST_PARAMS = "auth_request_params",
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
	TTL = "ttl",
	DATE_CREATED = "date_created",
	REFRESH_TOKEN = "refresh_token",
	ACCESS_TOKEN_ID = "access_token_id"
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
 * Enum of the type sys_user_mfa
 * @export
 * @enum
 */
export enum eSysUserMfa {
	$name = "sys_user_mfa",
	ID = "id",
	USER_ID = "user_id",
	MFA_ID = "mfa_id"
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
 * Enum of the type porta_account
 * @export
 * @enum
 */
export enum ePortaAccount {
	$name = "porta_account",
	USER = "user",
	PROFILE = "profile",
	TENANT = "tenant"
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
