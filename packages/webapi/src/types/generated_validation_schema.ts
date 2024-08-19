/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */
import { eJsonSchemaType, eParameterLocation } from "@blendsdk/jsonschema";

export const validationSchema = {
	type: eJsonSchemaType.object,
	definitions: {
		any_index: {
			type: eJsonSchemaType.object,
			properties: {
				"[key:string]": {
					type: eJsonSchemaType.anything
				}
			},
			required: ["[key:string]"]
		},
		mfa_settings: {
			type: eJsonSchemaType.object,
			properties: {
				"[key:string]": {
					type: eJsonSchemaType.string
				}
			},
			required: ["[key:string]"]
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
				pw_change_first_login: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				auth_session_length_hours: {
					type: eJsonSchemaType.integer,
					format: "int32",
					acceptNullValue: true
				},
				organization: {
					type: eJsonSchemaType.string
				}
			},
			required: ["name", "database", "organization"]
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
				client_id: {
					type: eJsonSchemaType.string
				},
				description: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				is_system: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				is_active: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				ow_consent: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				tenant_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				}
			},
			required: ["application_name", "client_id", "tenant_id"]
		},
		sys_secret: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				secret: {
					type: eJsonSchemaType.string
				},
				description: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				valid_from: {
					type: eJsonSchemaType.string,
					format: "datetime-tz"
				},
				valid_to: {
					type: eJsonSchemaType.string,
					format: "datetime-tz"
				},
				is_system: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				application_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				}
			},
			required: ["secret", "valid_from", "valid_to", "application_id"]
		},
		sys_client: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				client_type: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				redirect_uri: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				post_logout_redirect_uri: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				is_back_channel_post_logout: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				is_system: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				is_active: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				access_token_length: {
					type: eJsonSchemaType.integer,
					format: "int32"
				},
				refresh_token_length: {
					type: eJsonSchemaType.integer,
					format: "int32"
				},
				application_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				mfa_bypass_days: {
					type: eJsonSchemaType.integer,
					format: "int32",
					acceptNullValue: true
				},
				mfa_id: {
					type: eJsonSchemaType.string,
					format: "uuid",
					acceptNullValue: true
				}
			},
			required: ["access_token_length", "refresh_token_length", "application_id"]
		},
		sys_extension: {
			type: eJsonSchemaType.object,
			properties: {
				extension_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				name: {
					type: eJsonSchemaType.string
				},
				version: {
					type: eJsonSchemaType.string
				},
				description: {
					type: eJsonSchemaType.string
				},
				source: {
					type: eJsonSchemaType.string
				},
				options: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				is_active: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				date_created: {
					type: eJsonSchemaType.string,
					format: "datetime-tz",
					acceptNullValue: true
				}
			},
			required: ["name", "version", "description", "source"]
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
				is_system: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				require_pw_change: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				date_created: {
					type: eJsonSchemaType.string,
					format: "datetime-tz",
					acceptNullValue: true
				},
				date_modified: {
					type: eJsonSchemaType.string,
					format: "datetime-tz",
					acceptNullValue: true
				},
				service_application_id: {
					type: eJsonSchemaType.string,
					format: "uuid",
					acceptNullValue: true
				}
			},
			required: ["username", "password"]
		},
		sys_profile: {
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
				website: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				zoneinfo: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				birthdate: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				gender: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				middle_name: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				locale: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				avatar: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				address: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				postalcode: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				city: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				country: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				state: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				phone_number: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				phone_number_verified: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				date_created: {
					type: eJsonSchemaType.string,
					format: "datetime-tz",
					acceptNullValue: true
				},
				user_state: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				date_modified: {
					type: eJsonSchemaType.string,
					format: "datetime-tz",
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
				is_system: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				is_active: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				}
			},
			required: ["role"]
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
					format: "uuid",
					acceptNullValue: true
				},
				is_system: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				is_active: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				}
			},
			required: ["permission"]
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
		sys_session: {
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
				date_created: {
					type: eJsonSchemaType.string,
					format: "datetime-tz",
					acceptNullValue: true
				},
				last_token_auth_time: {
					type: eJsonSchemaType.string,
					format: "datetime-tz",
					acceptNullValue: true
				},
				date_expire: {
					type: eJsonSchemaType.string,
					format: "datetime-tz"
				}
			},
			required: ["user_id", "date_expire"]
		},
		sys_application_session: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				application_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				session_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				}
			},
			required: ["application_id", "session_id"]
		},
		sys_access_token: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				date_expire: {
					type: eJsonSchemaType.string,
					format: "datetime-tz"
				},
				auth_time: {
					type: eJsonSchemaType.string,
					format: "datetime-tz"
				},
				ota: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				auth_request_params: {
					type: eJsonSchemaType.object,
					$ref: "#/definitions/any_index"
				},
				token_reference: {
					type: eJsonSchemaType.string,
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
			required: ["date_expire", "auth_time", "auth_request_params", "session_id", "user_id", "client_id", "tenant_id"]
		},
		sys_refresh_token: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				date_expire: {
					type: eJsonSchemaType.string,
					format: "datetime-tz"
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
			required: ["date_expire", "access_token_id"]
		},
		sys_consent: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				is_consent: {
					type: eJsonSchemaType.boolean
				},
				scope: {
					type: eJsonSchemaType.string
				},
				application_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				}
			},
			required: ["is_consent", "scope", "application_id", "user_id"]
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
					$ref: "#/definitions/mfa_settings",
					acceptNullValue: true
				}
			},
			required: ["name"]
		},
		sys_secret_view: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				client_secret: {
					type: eJsonSchemaType.string
				},
				description: {
					type: eJsonSchemaType.string
				},
				valid_from: {
					type: eJsonSchemaType.string,
					format: "datetime-tz"
				},
				valid_to: {
					type: eJsonSchemaType.string,
					format: "datetime-tz"
				},
				is_system: {
					type: eJsonSchemaType.boolean
				},
				client_id: {
					type: eJsonSchemaType.string
				},
				application_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				client_credential_user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				is_expired: {
					type: eJsonSchemaType.boolean
				}
			},
			required: [
				"id",
				"client_secret",
				"description",
				"valid_from",
				"valid_to",
				"is_system",
				"client_id",
				"application_id",
				"client_credential_user_id",
				"is_expired"
			]
		},
		sys_authorization_view: {
			type: eJsonSchemaType.object,
			properties: {
				application_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				ow_consent: {
					type: eJsonSchemaType.boolean
				},
				logo: {
					type: eJsonSchemaType.string
				},
				application_name: {
					type: eJsonSchemaType.string
				},
				client_id: {
					type: eJsonSchemaType.string
				},
				client_type: {
					type: eJsonSchemaType.string
				},
				redirect_uri: {
					type: eJsonSchemaType.string
				},
				post_logout_redirect_uri: {
					type: eJsonSchemaType.string
				},
				is_back_channel_post_logout: {
					type: eJsonSchemaType.boolean
				},
				access_token_length: {
					type: eJsonSchemaType.number,
					format: "integer"
				},
				refresh_token_length: {
					type: eJsonSchemaType.number,
					format: "integer"
				},
				mfa: {
					type: eJsonSchemaType.string
				},
				mfa_settings: {
					type: eJsonSchemaType.string,
					format: "json"
				},
				mfa_bypass_days: {
					type: eJsonSchemaType.number,
					format: "integer"
				},
				auth_session_length_hours: {
					type: eJsonSchemaType.number,
					format: "integer"
				},
				tenant_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				sys_client_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				}
			},
			required: [
				"application_id",
				"ow_consent",
				"logo",
				"application_name",
				"client_id",
				"client_type",
				"redirect_uri",
				"post_logout_redirect_uri",
				"is_back_channel_post_logout",
				"access_token_length",
				"refresh_token_length",
				"mfa",
				"mfa_settings",
				"mfa_bypass_days",
				"auth_session_length_hours",
				"tenant_id",
				"sys_client_id"
			]
		},
		sys_access_token_view: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				access_token: {
					type: eJsonSchemaType.string
				},
				auth_request_params: {
					type: eJsonSchemaType.string,
					format: "json"
				},
				auth_time: {
					type: eJsonSchemaType.string,
					format: "datetime-tz"
				},
				token_reference: {
					type: eJsonSchemaType.string
				},
				session: {
					$ref: "#/definitions/sys_session",
					type: eJsonSchemaType.object,
					format: "json"
				},
				user: {
					$ref: "#/definitions/sys_user",
					type: eJsonSchemaType.object,
					format: "json"
				},
				profile: {
					$ref: "#/definitions/sys_profile",
					type: eJsonSchemaType.object,
					format: "json"
				},
				client: {
					$ref: "#/definitions/sys_client",
					type: eJsonSchemaType.object,
					format: "json"
				},
				tenant: {
					$ref: "#/definitions/sys_tenant",
					type: eJsonSchemaType.object,
					format: "json"
				},
				is_expired: {
					type: eJsonSchemaType.boolean
				}
			},
			required: [
				"id",
				"access_token",
				"auth_request_params",
				"auth_time",
				"token_reference",
				"session",
				"user",
				"profile",
				"client",
				"tenant",
				"is_expired"
			]
		},
		sys_refresh_token_view: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				refresh_token: {
					type: eJsonSchemaType.string
				},
				date_created: {
					type: eJsonSchemaType.string,
					format: "datetime-tz"
				},
				access_token: {
					$ref: "#/definitions/sys_access_token",
					type: eJsonSchemaType.object,
					format: "json"
				},
				session: {
					$ref: "#/definitions/sys_session",
					type: eJsonSchemaType.object,
					format: "json"
				},
				user: {
					$ref: "#/definitions/sys_user",
					type: eJsonSchemaType.object,
					format: "json"
				},
				profile: {
					$ref: "#/definitions/sys_profile",
					type: eJsonSchemaType.object,
					format: "json"
				},
				client: {
					$ref: "#/definitions/sys_client",
					type: eJsonSchemaType.object,
					format: "json"
				},
				tenant: {
					$ref: "#/definitions/sys_tenant",
					type: eJsonSchemaType.object,
					format: "json"
				},
				application: {
					$ref: "#/definitions/sys_application",
					type: eJsonSchemaType.object,
					format: "json"
				},
				is_expired: {
					type: eJsonSchemaType.boolean
				}
			},
			required: [
				"id",
				"refresh_token",
				"date_created",
				"access_token",
				"session",
				"user",
				"profile",
				"client",
				"tenant",
				"application",
				"is_expired"
			]
		},
		sys_user_permission_view: {
			type: eJsonSchemaType.object,
			properties: {
				user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				application_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				permission: {
					type: eJsonSchemaType.string
				},
				permission_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				role: {
					type: eJsonSchemaType.string
				},
				role_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				}
			},
			required: ["user_id", "application_id", "permission", "permission_id", "role", "role_id"]
		},
		sys_session_view: {
			type: eJsonSchemaType.object,
			properties: {
				session_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				client_id: {
					type: eJsonSchemaType.string
				},
				user_id: {
					type: eJsonSchemaType.string,
					format: "uuid"
				},
				session: {
					$ref: "#/definitions/sys_session",
					type: eJsonSchemaType.object,
					format: "json"
				},
				application: {
					$ref: "#/definitions/sys_application",
					type: eJsonSchemaType.object,
					format: "json"
				},
				client: {
					$ref: "#/definitions/sys_client",
					type: eJsonSchemaType.object,
					format: "json"
				}
			},
			required: ["session_id", "client_id", "user_id", "session", "application", "client"]
		},
		porta_account: {
			type: eJsonSchemaType.object,
			properties: {
				application: {
					$ref: "#/definitions/sys_application",
					type: eJsonSchemaType.object
				},
				session: {
					$ref: "#/definitions/sys_session",
					type: eJsonSchemaType.object
				},
				user: {
					$ref: "#/definitions/sys_user",
					type: eJsonSchemaType.object
				},
				profile: {
					$ref: "#/definitions/sys_profile",
					type: eJsonSchemaType.object
				},
				tenant: {
					$ref: "#/definitions/sys_tenant",
					type: eJsonSchemaType.object
				},
				client: {
					$ref: "#/definitions/sys_client",
					type: eJsonSchemaType.object
				},
				roles: {
					type: eJsonSchemaType.array,
					items: {
						$ref: "#/definitions/sys_role"
					}
				},
				permissions: {
					type: eJsonSchemaType.array,
					items: {
						$ref: "#/definitions/sys_permission"
					}
				}
			},
			required: ["application", "session", "user", "profile", "tenant", "client", "roles", "permissions"]
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
		get_reference_data: {
			type: eJsonSchemaType.object
		},
		get_reference_data_request: {
			type: eJsonSchemaType.object,
			properties: {
				tenant: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				}
			},
			required: ["tenant"]
		},
		get_user_profile_request: {
			type: eJsonSchemaType.object
		},
		get_user_state_request: {
			type: eJsonSchemaType.object,
			properties: {
				tenant: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				}
			},
			required: ["tenant"]
		},
		get_user_state: {
			type: eJsonSchemaType.object,
			properties: {
				user_state: {
					type: eJsonSchemaType.string
				}
			},
			required: ["user_state"]
		},
		save_user_state_request: {
			type: eJsonSchemaType.object,
			properties: {
				tenant: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				},
				user_state: {
					type: eJsonSchemaType.string,
					acceptNullValue: true,
					validate: false
				}
			},
			required: ["tenant", "user_state"]
		},
		logout_flow_info_request: {
			type: eJsonSchemaType.object
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
				expires_in: {
					type: eJsonSchemaType.number
				},
				error: {
					type: eJsonSchemaType.string
				},
				has_post_redirect: {
					type: eJsonSchemaType.boolean
				}
			},
			required: ["logo", "application_name", "organization", "finalize_url", "expires_in", "has_post_redirect"]
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
				},
				refresh_token_expires_at: {
					type: eJsonSchemaType.number
				}
			},
			required: ["access_token", "token_type", "expires_in"]
		},
		finalize_request: {
			type: eJsonSchemaType.object
		},
		finalize: {
			type: eJsonSchemaType.object
		},
		check_set_flow_request: {
			type: eJsonSchemaType.object,
			properties: {
				update: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				username: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				password: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				new_password: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				confirm_new_password: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				mfa_result: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				consent: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				},
				ow_consent: {
					type: eJsonSchemaType.boolean,
					acceptNullValue: true
				}
			}
		},
		check_set_flow: {
			type: eJsonSchemaType.object,
			properties: {
				error: {
					type: eJsonSchemaType.boolean
				},
				logo: {
					type: eJsonSchemaType.string
				},
				tenant_name: {
					type: eJsonSchemaType.string
				},
				tenant: {
					type: eJsonSchemaType.string
				},
				application_name: {
					type: eJsonSchemaType.string
				},
				consent_display_name: {
					type: eJsonSchemaType.string
				},
				mfa_type: {
					type: eJsonSchemaType.string
				},
				consent_claims: {
					type: eJsonSchemaType.array,
					items: {
						type: eJsonSchemaType.string
					}
				},
				ow_consent: {
					type: eJsonSchemaType.boolean
				},
				allow_reset_password: {
					type: eJsonSchemaType.boolean
				},
				expires_in: {
					type: eJsonSchemaType.number
				},
				resp: {
					type: eJsonSchemaType.string
				}
			},
			required: ["expires_in", "resp"]
		},
		discovery_keys_request: {
			type: eJsonSchemaType.object,
			properties: {
				tenant: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				}
			},
			required: ["tenant"]
		},
		discovery_keys: {
			type: eJsonSchemaType.object
		},
		discovery_request: {
			type: eJsonSchemaType.object,
			properties: {
				tenant: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.params
				}
			},
			required: ["tenant"]
		},
		discovery: {
			type: eJsonSchemaType.object
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
				id_token_hint: {
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
		}
	}
};
