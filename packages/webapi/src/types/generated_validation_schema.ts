/**
 * DO NOT CHANGE THIS FILE
 * THIS FILE IS AUTO GENERATED
 */
import { eJsonSchemaType, eParameterLocation } from "@blendsdk/jsonschema";

export const validationSchema = {
	type: eJsonSchemaType.object,
	definitions: {
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
				}
			},
			required: ["application_name", "client_id"]
		},
		sys_secret: {
			type: eJsonSchemaType.object,
			properties: {
				id: {
					type: eJsonSchemaType.integer,
					format: "int32"
				},
				secret: {
					type: eJsonSchemaType.string
				},
				description: {
					type: eJsonSchemaType.string,
					acceptNullValue: true
				},
				valid_from: {
					type: eJsonSchemaType.integer,
					format: "int32"
				},
				valid_to: {
					type: eJsonSchemaType.integer,
					format: "int32"
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
					type: eJsonSchemaType.integer,
					format: "int32"
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
				}
			},
			required: ["access_token_length", "refresh_token_length", "application_id"]
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
				date_modified: {
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
					format: "uuid"
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
			required: ["permission", "application_id"]
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
		porta_account: {
			type: eJsonSchemaType.object,
			properties: {
				user: {
					$ref: "#/definitions/sys_user",
					type: eJsonSchemaType.object
				},
				tenant: {
					$ref: "#/definitions/sys_tenant",
					type: eJsonSchemaType.object
				}
			},
			required: ["user", "tenant"]
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
		}
	}
};
