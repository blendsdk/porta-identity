/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */

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
 * Enum of the type sys_secret_view
 * @export
 * @enum
 */
export enum eSysSecretView {
	$name = "sys_secret_view",
	ID = "id",
	SECRET = "secret",
	DESCRIPTION = "description",
	VALID_FROM = "valid_from",
	VALID_TO = "valid_to",
	IS_SYSTEM = "is_system",
	CLIENT_ID = "client_id",
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
	LOGO = "logo",
	APPLICATION_NAME = "application_name",
	CLIENT_ID = "client_id",
	CLIENT_TYPE = "client_type",
	REDIRECT_URI = "redirect_uri",
	POST_LOGOUT_REDIRECT_URI = "post_logout_redirect_uri",
	IS_BACK_CHANNEL_POST_LOGOUT = "is_back_channel_post_logout",
	ACCESS_TOKEN_LENGTH = "access_token_length",
	REFRESH_TOKEN_LENGTH = "refresh_token_length",
	CLIENT_CREDENTIALS_USER_ID = "client_credentials_user_id"
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
	IS_ACTIVE = "is_active"
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
	CLIENT_ID = "client_id"
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
	CLIENT_CREDENTIALS_USER_ID = "client_credentials_user_id"
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
	DATE_CHANGED = "date_changed"
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
	AVATAR = "avatar",
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
