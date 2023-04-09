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
					type: eJsonSchemaType.boolean
				},
				mfa: {
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
		sys_client_post_logout_redirect_uris: {
			type: eJsonSchemaType.object,
			properties: {
				uri: {
					type: eJsonSchemaType.array,
					items: {
						type: eJsonSchemaType.string
					}
				}
			},
			required: ["uri"]
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
				scope: {
					type: eJsonSchemaType.string
				}
			},
			required: ["ui_locales", "claims", "acr_values", "scope"]
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
				logo: {
					type: eJsonSchemaType.string
				},
				application_name: {
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
					format: "datetime"
				},
				valid_until: {
					type: eJsonSchemaType.string,
					format: "datetime"
				},
				redirect_uri: {
					type: eJsonSchemaType.string
				},
				client_credentials_user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				post_logout_redirect_uris: {
					type: eJsonSchemaType.string,
					format: "json"
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
				"logo",
				"application_name",
				"is_active",
				"description",
				"secret",
				"access_token_ttl",
				"refresh_token_ttl",
				"valid_from",
				"valid_until",
				"redirect_uri",
				"client_credentials_user_id",
				"post_logout_redirect_uris",
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
		sys_groups_by_user_view: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				name: {
					type: eJsonSchemaType.string
				},
				description: {
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
			required: ["id", "name", "description", "is_active", "user_id"]
		},
		sys_user_permission_view: {
			type: eJsonSchemaType.object,
			properties: {
				user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				permission_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				code: {
					type: eJsonSchemaType.string
				},
				is_active: {
					type: eJsonSchemaType.boolean
				}
			},
			required: ["user_id", "permission_id", "code", "is_active"]
		},
		sys_access_token_view: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				ttl: {
					type: eJsonSchemaType.number,
					format: "integer"
				},
				refresh_ttl: {
					type: eJsonSchemaType.number,
					format: "integer"
				},
				auth_time: {
					type: eJsonSchemaType.number,
					format: "integer"
				},
				date_created: {
					type: eJsonSchemaType.string,
					format: "datetime"
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
					format: "datetime"
				},
				revoke_at: {
					type: eJsonSchemaType.string,
					format: "datetime"
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
				"id",
				"ttl",
				"refresh_ttl",
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
					format: "integer"
				},
				refresh_token: {
					type: eJsonSchemaType.string
				},
				access_token: {
					type: eJsonSchemaType.string
				},
				is_expire: {
					type: eJsonSchemaType.boolean
				},
				expire_at: {
					type: eJsonSchemaType.string,
					format: "datetime"
				}
			},
			required: ["id", "ttl", "refresh_token", "access_token", "is_expire", "expire_at"]
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
					format: "datetime"
				},
				oidc_client_id: {
					type: eJsonSchemaType.string
				},
				oidc_sub_claim: {
					type: eJsonSchemaType.string,
					format: "uuid"
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
					type: eJsonSchemaType.boolean
				},
				allow_reset_password: {
					type: eJsonSchemaType.boolean
				},
				allow_registration: {
					type: eJsonSchemaType.boolean
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
					type: eJsonSchemaType.boolean
				},
				date_created: {
					type: eJsonSchemaType.string,
					format: "datetime"
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
					type: eJsonSchemaType.string
				},
				firstname: {
					type: eJsonSchemaType.string
				},
				lastname: {
					type: eJsonSchemaType.string
				},
				avatar: {
					type: eJsonSchemaType.string
				},
				user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				date_created: {
					type: eJsonSchemaType.string,
					format: "date"
				},
				date_changed: {
					type: eJsonSchemaType.string,
					format: "date"
				}
			},
			required: ["firstname", "lastname", "user_id"]
		},
		sys_group: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				name: {
					type: eJsonSchemaType.string
				},
				description: {
					type: eJsonSchemaType.string
				},
				is_active: {
					type: eJsonSchemaType.boolean
				}
			},
			required: ["name", "description"]
		},
		sys_user_group: {
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
				group_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				}
			},
			required: ["user_id", "group_id"]
		},
		sys_permission: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				code: {
					type: eJsonSchemaType.string
				},
				description: {
					type: eJsonSchemaType.string
				},
				is_active: {
					type: eJsonSchemaType.boolean
				}
			},
			required: ["code", "description"]
		},
		sys_group_permission: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				group_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				permission_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				}
			},
			required: ["group_id", "permission_id"]
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
				logo: {
					type: eJsonSchemaType.string
				},
				application_name: {
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
					type: eJsonSchemaType.integer,
					format: "int32"
				},
				refresh_token_ttl: {
					type: eJsonSchemaType.integer,
					format: "int32"
				},
				valid_from: {
					type: eJsonSchemaType.string,
					format: "datetime"
				},
				valid_until: {
					type: eJsonSchemaType.string,
					format: "datetime"
				},
				redirect_uri: {
					type: eJsonSchemaType.string
				},
				client_credentials_user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				post_logout_redirect_uris: {
					type: eJsonSchemaType.object,
					$ref: "#/definitions/sys_client_post_logout_redirect_uris"
				}
			},
			required: ["client_id", "client_type", "application_name"]
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
					format: "datetime"
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
					format: "datetime"
				},
				auth_request_params: {
					type: eJsonSchemaType.object,
					$ref: "#/definitions/sys_access_token_auth_request_params"
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
					format: "datetime"
				},
				refresh_token: {
					type: eJsonSchemaType.string
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
					$ref: "#/definitions/sys_mfa_settings"
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
					location: eParameterLocation.query
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
				}
			},
			required: ["logo", "application_name", "organization"]
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
		}
	}
};
