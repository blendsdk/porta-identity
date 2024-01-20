/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */
import { eJsonSchemaType, eParameterLocation } from "@blendsdk/jsonschema";

export const validationSchema = {
	type: eJsonSchemaType.object,
	definitions: {
		authentication_flow_state: {
			type: eJsonSchemaType.object,
			properties: {
				account: {
					type: eJsonSchemaType.string
				},
				account_status: {
					type: eJsonSchemaType.boolean
				},
				account_state: {
					type: eJsonSchemaType.boolean
				},
				password_state: {
					type: eJsonSchemaType.boolean
				},
				signin_url: {
					type: eJsonSchemaType.string
				},
				mfa_state: {
					type: eJsonSchemaType.string
				},
				mfa_list: {
					type: eJsonSchemaType.array,
					items: {
						type: eJsonSchemaType.string
					}
				}
			}
		},
		sys_mfa_settings: {
			type: eJsonSchemaType.object
		},
		sys_access_token_auth_request_params: {
			type: eJsonSchemaType.object,
			properties: {
				ui_locales: {
					type: eJsonSchemaType.string
				},
				claims: {
					type: eJsonSchemaType.string
				},
				acr_values: {
					type: eJsonSchemaType.string
				},
				resource: {
					type: eJsonSchemaType.string
				},
				token_reference: {
					type: eJsonSchemaType.string
				},
				scope: {
					type: eJsonSchemaType.string
				}
			},
			required: ["ui_locales", "claims", "acr_values", "resource", "token_reference", "scope"]
		},
		sys_client_view: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				client_id: {
					type: eJsonSchemaType.string
				},
				client_type: {
					type: eJsonSchemaType.string
				},
				is_active: {
					type: eJsonSchemaType.boolean
				},
				description: {
					type: eJsonSchemaType.string
				},
				secret: {
					type: eJsonSchemaType.string
				},
				access_token_ttl: {
					type: eJsonSchemaType.number,
					format: "integer"
				},
				refresh_token_ttl: {
					type: eJsonSchemaType.number,
					format: "integer"
				},
				valid_from: {
					type: eJsonSchemaType.string,
					format: "datetime-tz"
				},
				valid_until: {
					type: eJsonSchemaType.string,
					format: "datetime-tz"
				},
				redirect_uri: {
					type: eJsonSchemaType.string
				},
				client_credentials_user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				application_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				post_logout_redirect_uri: {
					type: eJsonSchemaType.string
				},
				is_back_channel_post_logout: {
					type: eJsonSchemaType.boolean
				},
				is_system_client: {
					type: eJsonSchemaType.boolean
				},
				application_name: {
					type: eJsonSchemaType.string
				},
				logo: {
					type: eJsonSchemaType.string
				}
			},
			required: [
				"id",
				"client_id",
				"client_type",
				"is_active",
				"description",
				"secret",
				"access_token_ttl",
				"refresh_token_ttl",
				"valid_from",
				"valid_until",
				"redirect_uri",
				"client_credentials_user_id",
				"application_id",
				"post_logout_redirect_uri",
				"is_back_channel_post_logout",
				"is_system_client",
				"application_name",
				"logo"
			]
		},
		sys_authorization_view: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				client_id: {
					type: eJsonSchemaType.string
				},
				client_type: {
					type: eJsonSchemaType.string
				},
				is_active: {
					type: eJsonSchemaType.boolean
				},
				description: {
					type: eJsonSchemaType.string
				},
				secret: {
					type: eJsonSchemaType.string
				},
				access_token_ttl: {
					type: eJsonSchemaType.number,
					format: "integer"
				},
				refresh_token_ttl: {
					type: eJsonSchemaType.number,
					format: "integer"
				},
				valid_from: {
					type: eJsonSchemaType.string,
					format: "datetime-tz"
				},
				valid_until: {
					type: eJsonSchemaType.string,
					format: "datetime-tz"
				},
				redirect_uri: {
					type: eJsonSchemaType.string
				},
				client_credentials_user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				application_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				post_logout_redirect_uri: {
					type: eJsonSchemaType.string
				},
				is_back_channel_post_logout: {
					type: eJsonSchemaType.boolean
				},
				is_system_client: {
					type: eJsonSchemaType.boolean
				},
				application_name: {
					type: eJsonSchemaType.string
				},
				logo: {
					type: eJsonSchemaType.string
				},
				client_credentials_user: {
					type: eJsonSchemaType.string,
					format: "json"
				}
			},
			required: [
				"id",
				"client_id",
				"client_type",
				"is_active",
				"description",
				"secret",
				"access_token_ttl",
				"refresh_token_ttl",
				"valid_from",
				"valid_until",
				"redirect_uri",
				"client_credentials_user_id",
				"application_id",
				"post_logout_redirect_uri",
				"is_back_channel_post_logout",
				"is_system_client",
				"application_name",
				"logo",
				"client_credentials_user"
			]
		},
		sys_user_mfa_view: {
			type: eJsonSchemaType.object,
			properties: {
				user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				mfa_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				mfa_name: {
					type: eJsonSchemaType.string
				},
				mfa_settings: {
					type: eJsonSchemaType.string,
					format: "json"
				}
			},
			required: ["user_id", "mfa_id", "mfa_name", "mfa_settings"]
		},
		sys_roles_by_user_view: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				role: {
					type: eJsonSchemaType.string
				},
				description: {
					type: eJsonSchemaType.string
				},
				role_type: {
					type: eJsonSchemaType.string
				},
				is_active: {
					type: eJsonSchemaType.boolean
				},
				user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				}
			},
			required: ["id", "role", "description", "role_type", "is_active", "user_id"]
		},
		sys_user_permission_view: {
			type: eJsonSchemaType.object,
			properties: {
				application_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				client_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				oidc_client_id: {
					type: eJsonSchemaType.string
				},
				user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				permission_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				role_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				permission: {
					type: eJsonSchemaType.string
				},
				is_active: {
					type: eJsonSchemaType.boolean
				},
				role: {
					type: eJsonSchemaType.string
				},
				role_description: {
					type: eJsonSchemaType.string
				},
				permission_description: {
					type: eJsonSchemaType.string
				},
				role_is_active: {
					type: eJsonSchemaType.boolean
				}
			},
			required: [
				"application_id",
				"client_id",
				"oidc_client_id",
				"user_id",
				"permission_id",
				"role_id",
				"permission",
				"is_active",
				"role",
				"role_description",
				"permission_description",
				"role_is_active"
			]
		},
		sys_access_token_view: {
			type: eJsonSchemaType.object,
			properties: {
				default_ttl: {
					type: eJsonSchemaType.number,
					format: "integer"
				},
				default_refresh_ttl: {
					type: eJsonSchemaType.number,
					format: "integer"
				},
				ttl: {
					type: eJsonSchemaType.number,
					format: "decimal"
				},
				refresh_ttl: {
					type: eJsonSchemaType.number,
					format: "decimal"
				},
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				auth_time: {
					type: eJsonSchemaType.number,
					format: "integer"
				},
				date_created: {
					type: eJsonSchemaType.string,
					format: "datetime-tz"
				},
				auth_request_params: {
					type: eJsonSchemaType.string,
					format: "json"
				},
				access_token: {
					type: eJsonSchemaType.string
				},
				session_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				client_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				tenant_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				is_expired: {
					type: eJsonSchemaType.boolean
				},
				is_revoke: {
					type: eJsonSchemaType.boolean
				},
				expire_at: {
					type: eJsonSchemaType.string,
					format: "datetime-tz"
				},
				revoke_at: {
					type: eJsonSchemaType.string,
					format: "datetime-tz"
				},
				user: {
					type: eJsonSchemaType.string,
					format: "json"
				},
				profile: {
					type: eJsonSchemaType.string,
					format: "json"
				},
				client: {
					type: eJsonSchemaType.string,
					format: "json"
				},
				tenant: {
					type: eJsonSchemaType.string,
					format: "json"
				},
				session: {
					type: eJsonSchemaType.string,
					format: "json"
				}
			},
			required: [
				"default_ttl",
				"default_refresh_ttl",
				"ttl",
				"refresh_ttl",
				"id",
				"auth_time",
				"date_created",
				"auth_request_params",
				"access_token",
				"session_id",
				"user_id",
				"client_id",
				"tenant_id",
				"is_expired",
				"is_revoke",
				"expire_at",
				"revoke_at",
				"user",
				"profile",
				"client",
				"tenant",
				"session"
			]
		},
		sys_refresh_token_view: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				ttl: {
					type: eJsonSchemaType.number,
					format: "bigint"
				},
				refresh_token: {
					type: eJsonSchemaType.string
				},
				access_token: {
					type: eJsonSchemaType.string
				},
				is_expired: {
					type: eJsonSchemaType.boolean
				},
				expire_at: {
					type: eJsonSchemaType.string,
					format: "datetime-tz"
				}
			},
			required: ["id", "ttl", "refresh_token", "access_token", "is_expired", "expire_at"]
		},
		sys_session_view: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				session_id: {
					type: eJsonSchemaType.string
				},
				user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				client_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				date_created: {
					type: eJsonSchemaType.string,
					format: "datetime-tz"
				},
				oidc_client_id: {
					type: eJsonSchemaType.string
				},
				post_logout_redirect_uri: {
					type: eJsonSchemaType.string
				},
				is_back_channel_post_logout: {
					type: eJsonSchemaType.boolean
				},
				oidc_sub_claim: {
					type: eJsonSchemaType.string
				},
				client: {
					type: eJsonSchemaType.string,
					format: "json"
				},
				user: {
					type: eJsonSchemaType.string,
					format: "json"
				}
			},
			required: [
				"id",
				"session_id",
				"user_id",
				"client_id",
				"date_created",
				"oidc_client_id",
				"post_logout_redirect_uri",
				"is_back_channel_post_logout",
				"oidc_sub_claim",
				"client",
				"user"
			]
		},
		sys_tenant: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				name: {
					type: eJsonSchemaType.string
				},
				database: {
					type: eJsonSchemaType.string
				},
				is_active: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				allow_reset_password: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				allow_registration: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				organization: {
					type: eJsonSchemaType.string
				}
			},
			required: ["name", "database", "organization"]
		},
		sys_user: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				username: {
					type: eJsonSchemaType.string
				},
				password: {
					type: eJsonSchemaType.string
				},
				is_active: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				date_created: {
					type: eJsonSchemaType.string,
					format: "datetime-tz",
					acceptNullValue: true
				},
				date_changed: {
					type: eJsonSchemaType.string,
					format: "date",
					acceptNullValue: true
				}
			},
			required: ["username", "password"]
		},
		sys_user_profile: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				email: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				firstname: {
					type: eJsonSchemaType.string
				},
				lastname: {
					type: eJsonSchemaType.string
				},
				avatar: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				date_created: {
					type: eJsonSchemaType.string,
					format: "date",
					acceptNullValue: true
				},
				date_changed: {
					type: eJsonSchemaType.string,
					format: "date",
					acceptNullValue: true
				}
			},
			required: ["firstname", "lastname", "user_id"]
		},
		sys_role: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				role: {
					type: eJsonSchemaType.string
				},
				description: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				role_type: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				is_active: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				}
			},
			required: ["role"]
		},
		sys_user_role: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				role_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				}
			},
			required: ["user_id", "role_id"]
		},
		sys_permission: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				permission: {
					type: eJsonSchemaType.string
				},
				description: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				application_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				is_active: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				}
			},
			required: ["permission", "application_id"]
		},
		sys_role_permission: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				role_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				permission_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				}
			},
			required: ["role_id", "permission_id"]
		},
		sys_application: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				logo: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				application_name: {
					type: eJsonSchemaType.string
				},
				description: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				is_active: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				}
			},
			required: ["application_name"]
		},
		sys_client: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				client_id: {
					type: eJsonSchemaType.string
				},
				client_type: {
					type: eJsonSchemaType.string
				},
				is_active: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				description: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				secret: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				access_token_ttl: {
					type: eJsonSchemaType.integer,
					format: "int32",
					acceptNullValue: true
				},
				refresh_token_ttl: {
					type: eJsonSchemaType.integer,
					format: "int32",
					acceptNullValue: true
				},
				valid_from: {
					type: eJsonSchemaType.string,
					format: "datetime-tz",
					acceptNullValue: true
				},
				valid_until: {
					type: eJsonSchemaType.string,
					format: "datetime-tz",
					acceptNullValue: true
				},
				redirect_uri: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				client_credentials_user_id: {
					type: eJsonSchemaType.string,
					format: "uuid",
					acceptNullValue: true
				},
				application_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				post_logout_redirect_uri: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				is_back_channel_post_logout: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				is_system_client: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				}
			},
			required: ["client_id", "client_type", "application_id"]
		},
		sys_session: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				session_id: {
					type: eJsonSchemaType.string
				},
				user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				client_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				date_created: {
					type: eJsonSchemaType.string,
					format: "datetime-tz",
					acceptNullValue: true
				}
			},
			required: ["session_id", "user_id", "client_id"]
		},
		sys_access_token: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				ttl: {
					type: eJsonSchemaType.integer,
					format: "int32"
				},
				refresh_ttl: {
					type: eJsonSchemaType.integer,
					format: "int32"
				},
				auth_time: {
					type: eJsonSchemaType.integer,
					format: "int32"
				},
				date_created: {
					type: eJsonSchemaType.string,
					format: "datetime-tz",
					acceptNullValue: true
				},
				auth_request_params: {
					type: eJsonSchemaType.object,
					$ref: "#/definitions/sys_access_token_auth_request_params",
					acceptNullValue: true
				},
				access_token: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				session_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				client_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				tenant_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				}
			},
			required: ["ttl", "refresh_ttl", "auth_time", "session_id", "user_id", "client_id", "tenant_id"]
		},
		sys_refresh_token: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				ttl: {
					type: eJsonSchemaType.integer,
					format: "int32"
				},
				date_created: {
					type: eJsonSchemaType.string,
					format: "datetime-tz",
					acceptNullValue: true
				},
				refresh_token: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				access_token_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				}
			},
			required: ["ttl", "access_token_id"]
		},
		sys_mfa: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				name: {
					type: eJsonSchemaType.string
				},
				settings: {
					type: eJsonSchemaType.object,
					$ref: "#/definitions/sys_mfa_settings",
					acceptNullValue: true
				}
			},
			required: ["name"]
		},
		sys_user_mfa: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				mfa_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				}
			},
			required: ["user_id", "mfa_id"]
		},
		sys_key: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				key_type: {
					type: eJsonSchemaType.string
				},
				key_id: {
					type: eJsonSchemaType.string
				},
				data: {
					type: eJsonSchemaType.string
				}
			},
			required: ["key_type", "key_id", "data"]
		},
		porta_account: {
			type: eJsonSchemaType.object,
			properties: {
				user: {
					$ref: "#/definitions/sys_user",
					type: eJsonSchemaType.object
				},
				profile: {
					$ref: "#/definitions/sys_user_profile",
					type: eJsonSchemaType.object
				},
				tenant: {
					$ref: "#/definitions/sys_tenant",
					type: eJsonSchemaType.object
				}
			},
			required: ["user", "profile", "tenant"]
		},
		error_data: {
			type: eJsonSchemaType.object,
			properties: {
				error: {
					type: eJsonSchemaType.string
				},
				type: {
					type: eJsonSchemaType.string
				},
				context: {
					type: eJsonSchemaType.anything
				}
			},
			required: ["error", "type", "context"]
		},
		get_translations_request: {
			type: eJsonSchemaType.object,
			properties: {
				locale: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				},
				options: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				save: {
					type: eJsonSchemaType.boolean,
					location: eParameterLocation.query
				}
			}
		},
		get_app_version_request: {
			type: eJsonSchemaType.object
		},
		get_app_version: {
			type: eJsonSchemaType.object,
			properties: {
				webclient: {
					type: eJsonSchemaType.string
				},
				webapi: {
					type: eJsonSchemaType.string
				},
				mobileclient: {
					type: eJsonSchemaType.string
				}
			},
			required: ["webclient", "webapi", "mobileclient"]
		},
		token_info_request: {
			type: eJsonSchemaType.object,
			properties: {
				tenant: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				},
				token: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.body
				},
				client_id: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.body
				},
				client_secret: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.body
				}
			},
			required: ["tenant", "token"]
		},
		token_info: {
			type: eJsonSchemaType.object,
			properties: {
				active: {
					type: eJsonSchemaType.boolean
				},
				scope: {
					type: eJsonSchemaType.string
				},
				client_id: {
					type: eJsonSchemaType.string
				},
				username: {
					type: eJsonSchemaType.string
				},
				token_type: {
					type: eJsonSchemaType.string
				},
				exp: {
					type: eJsonSchemaType.number
				},
				iat: {
					type: eJsonSchemaType.number
				},
				nbf: {
					type: eJsonSchemaType.number
				},
				sub: {
					type: eJsonSchemaType.string
				},
				aud: {
					type: eJsonSchemaType.string
				},
				iss: {
					type: eJsonSchemaType.string
				},
				jti: {
					type: eJsonSchemaType.string
				}
			},
			required: ["active"]
		},
		authorize_request: {
			type: eJsonSchemaType.object,
			properties: {
				tenant: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				},
				response_type: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				client_id: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				redirect_uri: {
					type: eJsonSchemaType.string,
					acceptNullValue: true,
					location: eParameterLocation.query
				},
				scope: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				nonce: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				response_mode: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				state: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				code_challenge: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				code_challenge_method: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				ui_locales: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				request: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				acr_values: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				claims: {
					type: eJsonSchemaType.string,
					validate: false,
					location: eParameterLocation.query
				},
				prompt: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				max_age: {
					type: eJsonSchemaType.number,
					location: eParameterLocation.query
				},
				display: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				resource: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				}
			},
			required: ["tenant", "client_id", "redirect_uri", "scope"]
		},
		authorize: {
			type: eJsonSchemaType.object
		},
		token_request: {
			type: eJsonSchemaType.object,
			properties: {
				tenant: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				},
				client_id: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.body
				},
				redirect_uri: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.body
				},
				grant_type: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.body
				},
				code: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.body
				},
				code_verifier: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.body
				},
				client_secret: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.body
				},
				state: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.body
				},
				nonce: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.body
				},
				scope: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				claims: {
					type: eJsonSchemaType.string,
					validate: false,
					location: eParameterLocation.query
				},
				refresh_token: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.body
				},
				resource: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				}
			},
			required: ["tenant", "grant_type"]
		},
		token: {
			type: eJsonSchemaType.object,
			properties: {
				access_token: {
					type: eJsonSchemaType.string
				},
				token_type: {
					type: eJsonSchemaType.string
				},
				expires_in: {
					type: eJsonSchemaType.number
				},
				id_token: {
					type: eJsonSchemaType.string
				},
				refresh_token: {
					type: eJsonSchemaType.string
				},
				refresh_token_expires_in: {
					type: eJsonSchemaType.number
				},
				refresh_token_expires_at: {
					type: eJsonSchemaType.number
				}
			},
			required: ["access_token", "token_type", "expires_in", "id_token"]
		},
		signin_request: {
			type: eJsonSchemaType.object,
			properties: {
				af: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				}
			}
		},
		signin: {
			type: eJsonSchemaType.object
		},
		redirect_request: {
			type: eJsonSchemaType.object,
			properties: {
				af: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				}
			},
			required: ["af"]
		},
		redirect: {
			type: eJsonSchemaType.object
		},
		flow_info_request: {
			type: eJsonSchemaType.object,
			properties: {
				af: {
					type: eJsonSchemaType.string
				}
			}
		},
		flow_info: {
			type: eJsonSchemaType.object,
			properties: {
				logo: {
					type: eJsonSchemaType.string
				},
				client_id: {
					type: eJsonSchemaType.string
				},
				application_name: {
					type: eJsonSchemaType.string
				},
				organization: {
					type: eJsonSchemaType.string
				},
				allow_reset_password: {
					type: eJsonSchemaType.boolean
				},
				allow_registration: {
					type: eJsonSchemaType.boolean
				}
			},
			required: ["logo", "client_id", "application_name", "organization", "allow_reset_password", "allow_registration"]
		},
		check_flow_request: {
			type: eJsonSchemaType.object,
			properties: {
				state: {
					type: eJsonSchemaType.string
				},
				af: {
					type: eJsonSchemaType.string
				},
				options: {
					type: eJsonSchemaType.string
				}
			},
			required: ["state"]
		},
		oidc_discovery_request: {
			type: eJsonSchemaType.object,
			properties: {
				tenant: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				}
			},
			required: ["tenant"]
		},
		oidc_discovery: {
			type: eJsonSchemaType.object
		},
		oidc_discovery_keys_request: {
			type: eJsonSchemaType.object,
			properties: {
				tenant: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				}
			},
			required: ["tenant"]
		},
		oidc_discovery_keys: {
			type: eJsonSchemaType.object
		},
		user_info_get_request: {
			type: eJsonSchemaType.object,
			properties: {
				tenant: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				}
			},
			required: ["tenant"]
		},
		user_info_get: {
			type: eJsonSchemaType.object
		},
		user_info_post_request: {
			type: eJsonSchemaType.object,
			properties: {
				access_token: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.body
				},
				tenant: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				}
			},
			required: ["tenant"]
		},
		user_info_post: {
			type: eJsonSchemaType.object
		},
		session_logout_get_request: {
			type: eJsonSchemaType.object,
			properties: {
				tenant: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				},
				id_token_hint: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				logout_hint: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				client_id: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				post_logout_redirect_uri: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				state: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				ui_locales: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				lf: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				}
			}
		},
		session_logout_get: {
			type: eJsonSchemaType.object
		},
		session_logout_post_request: {
			type: eJsonSchemaType.object,
			properties: {
				tenant: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				},
				id_token_hint: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.body
				},
				logout_hint: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.body
				},
				client_id: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.body
				},
				post_logout_redirect_uri: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.body
				},
				state: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.body
				},
				ui_locales: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.body
				},
				lf: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.body
				}
			},
			required: ["tenant"]
		},
		session_logout_post: {
			type: eJsonSchemaType.object
		},
		logout_flow_info_request: {
			type: eJsonSchemaType.object,
			properties: {
				lf: {
					type: eJsonSchemaType.string
				}
			}
		},
		logout_flow_info: {
			type: eJsonSchemaType.object,
			properties: {
				logo: {
					type: eJsonSchemaType.string
				},
				application_name: {
					type: eJsonSchemaType.string
				},
				organization: {
					type: eJsonSchemaType.string
				},
				finalize_url: {
					type: eJsonSchemaType.string
				},
				flowId: {
					type: eJsonSchemaType.string
				},
				has_post_redirect: {
					type: eJsonSchemaType.boolean
				}
			},
			required: ["logo", "application_name", "organization", "finalize_url", "flowId", "has_post_redirect"]
		},
		forgot_password_flow_info_request: {
			type: eJsonSchemaType.object
		},
		forgot_password_flow_info: {
			type: eJsonSchemaType.object,
			properties: {
				logo: {
					type: eJsonSchemaType.string
				},
				organization: {
					type: eJsonSchemaType.string
				}
			},
			required: ["logo", "organization"]
		},
		forgot_password_request_account_request: {
			type: eJsonSchemaType.object,
			properties: {
				account: {
					type: eJsonSchemaType.string
				}
			},
			required: ["account"]
		},
		forgot_password_request_account: {
			type: eJsonSchemaType.object
		},
		check_password_reset_request_request: {
			type: eJsonSchemaType.object,
			properties: {
				flow: {
					type: eJsonSchemaType.string
				}
			},
			required: ["flow"]
		},
		check_password_reset_request: {
			type: eJsonSchemaType.object,
			properties: {
				logo: {
					type: eJsonSchemaType.string
				},
				organization: {
					type: eJsonSchemaType.string
				}
			},
			required: ["logo", "organization"]
		},
		request_password_reset_request: {
			type: eJsonSchemaType.object,
			properties: {
				flow: {
					type: eJsonSchemaType.string
				},
				password: {
					type: eJsonSchemaType.string
				},
				confirmPassword: {
					type: eJsonSchemaType.string
				}
			},
			required: ["flow", "password", "confirmPassword"]
		},
		request_password_reset: {
			type: eJsonSchemaType.object,
			properties: {
				status: {
					type: eJsonSchemaType.boolean
				}
			},
			required: ["status"]
		},
		authentication_keep_alive_request: {
			type: eJsonSchemaType.object
		},
		authentication_logout_request: {
			type: eJsonSchemaType.object
		},
		authentication_login_request: {
			type: eJsonSchemaType.object,
			properties: {
				username: {
					type: eJsonSchemaType.string
				},
				password: {
					type: eJsonSchemaType.string
				},
				language: {
					type: eJsonSchemaType.string
				}
			},
			required: ["username", "password"]
		},
		initialize_request: {
			type: eJsonSchemaType.object,
			properties: {
				username: {
					type: eJsonSchemaType.string
				},
				password: {
					type: eJsonSchemaType.string
				},
				email: {
					type: eJsonSchemaType.string
				}
			},
			required: ["password", "email"]
		},
		initialize: {
			type: eJsonSchemaType.object,
			properties: {
				error: {
					type: eJsonSchemaType.string
				},
				status: {
					type: eJsonSchemaType.boolean
				}
			},
			required: ["status"]
		},
		get_user_profile_request: {
			type: eJsonSchemaType.object,
			properties: {
				tenant: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				}
			},
			required: ["tenant"]
		},
		get_user_profile: {
			type: eJsonSchemaType.object,
			properties: {
				user: {
					$ref: "#/definitions/sys_user",
					type: eJsonSchemaType.object
				},
				profile: {
					$ref: "#/definitions/sys_user_profile",
					type: eJsonSchemaType.object
				}
			},
			required: ["user", "profile"]
		},
		list_open_id_tenant_request: {
			type: eJsonSchemaType.object,
			properties: {
				tenant: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				}
			},
			required: ["tenant"]
		},
		get_open_id_tenant_request: {
			type: eJsonSchemaType.object,
			properties: {
				tenant: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				},
				id: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				}
			},
			required: ["tenant", "id"]
		},
		create_open_id_tenant_request: {
			type: eJsonSchemaType.object,
			properties: {
				tenant: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				},
				name: {
					type: eJsonSchemaType.string
				},
				email: {
					type: eJsonSchemaType.string
				},
				password: {
					type: eJsonSchemaType.string
				},
				allow_registration: {
					type: eJsonSchemaType.boolean
				},
				allow_reset_password: {
					type: eJsonSchemaType.boolean
				},
				organization: {
					type: eJsonSchemaType.string
				}
			},
			required: ["tenant", "name", "email", "password", "allow_registration", "allow_reset_password", "organization"]
		},
		update_open_id_tenant_request: {
			type: eJsonSchemaType.object
		},
		update_open_id_tenant: {
			type: eJsonSchemaType.object
		},
		delete_open_id_tenant_request: {
			type: eJsonSchemaType.object,
			properties: {
				tenant: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				},
				id: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				}
			},
			required: ["tenant", "id"]
		},
		list_open_id_client_request: {
			type: eJsonSchemaType.object
		},
		list_open_id_client: {
			type: eJsonSchemaType.object
		},
		get_open_id_client_request: {
			type: eJsonSchemaType.object
		},
		get_open_id_client: {
			type: eJsonSchemaType.object
		},
		create_open_id_client_request: {
			type: eJsonSchemaType.object
		},
		create_open_id_client: {
			type: eJsonSchemaType.object
		},
		update_open_id_client_request: {
			type: eJsonSchemaType.object
		},
		update_open_id_client: {
			type: eJsonSchemaType.object
		},
		delete_open_id_client_request: {
			type: eJsonSchemaType.object
		},
		delete_open_id_client: {
			type: eJsonSchemaType.object
		},
		list_open_id_role_request: {
			type: eJsonSchemaType.object
		},
		list_open_id_role: {
			type: eJsonSchemaType.object
		},
		get_open_id_role_request: {
			type: eJsonSchemaType.object
		},
		get_open_id_role: {
			type: eJsonSchemaType.object
		},
		create_open_id_role_request: {
			type: eJsonSchemaType.object
		},
		create_open_id_role: {
			type: eJsonSchemaType.object
		},
		update_open_id_role_request: {
			type: eJsonSchemaType.object
		},
		update_open_id_role: {
			type: eJsonSchemaType.object
		},
		delete_open_id_role_request: {
			type: eJsonSchemaType.object
		},
		delete_open_id_role: {
			type: eJsonSchemaType.object
		},
		list_open_id_account_request: {
			type: eJsonSchemaType.object
		},
		list_open_id_account: {
			type: eJsonSchemaType.object
		},
		get_open_id_account_request: {
			type: eJsonSchemaType.object
		},
		get_open_id_account: {
			type: eJsonSchemaType.object
		},
		create_open_id_account_request: {
			type: eJsonSchemaType.object
		},
		create_open_id_account: {
			type: eJsonSchemaType.object
		},
		update_open_id_account_request: {
			type: eJsonSchemaType.object
		},
		update_open_id_account: {
			type: eJsonSchemaType.object
		},
		delete_open_id_account_request: {
			type: eJsonSchemaType.object
		},
		delete_open_id_account: {
			type: eJsonSchemaType.object
		},
		change_account_password_request: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				tenant: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				},
				password: {
					type: eJsonSchemaType.string
				}
			},
			required: ["id", "tenant", "password"]
		},
		list_open_id_permission_request: {
			type: eJsonSchemaType.object
		},
		list_open_id_permission: {
			type: eJsonSchemaType.object
		},
		get_open_id_permission_request: {
			type: eJsonSchemaType.object
		},
		get_open_id_permission: {
			type: eJsonSchemaType.object
		},
		create_open_id_permission_request: {
			type: eJsonSchemaType.object
		},
		create_open_id_permission: {
			type: eJsonSchemaType.object
		},
		update_open_id_permission_request: {
			type: eJsonSchemaType.object
		},
		update_open_id_permission: {
			type: eJsonSchemaType.object
		},
		delete_open_id_permission_request: {
			type: eJsonSchemaType.object
		},
		delete_open_id_permission: {
			type: eJsonSchemaType.object
		}
	}
};
