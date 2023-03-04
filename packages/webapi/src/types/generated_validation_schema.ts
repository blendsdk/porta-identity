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
			required: ["name", "organization"]
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
				}
			},
			required: ["access_token", "token_type", "expires_in", "id_token"]
		},
		signin_request: {
			type: eJsonSchemaType.object
		},
		redirect_request: {
			type: eJsonSchemaType.object,
			properties: {
				flow: {
					type: eJsonSchemaType.string,
					location: eParameterLocation.query
				}
			},
			required: ["flow"]
		},
		redirect: {
			type: eJsonSchemaType.object
		},
		flow_info_request: {
			type: eJsonSchemaType.object
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
