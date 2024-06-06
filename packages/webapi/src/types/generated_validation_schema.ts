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
