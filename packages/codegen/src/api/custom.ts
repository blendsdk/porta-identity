import { ApiBuilder, refType } from "@blendsdk/codegen";
import { eParameterLocation } from "@blendsdk/jsonschema";
import { createSecureCrudAPI } from "./crudapi";

export function defineCustomApi(builder: ApiBuilder) {
    builder.defineApi({
        id: "initialize",
        url: "/api/initialize",
        group: "application",
        method: "post",
        public: false,
        createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
            typeSchema //
                .createAppendType(request_type)
                .addString("username", { optional: true })
                .addString("password")
                .addString("email");
            typeSchema
                .createAppendType(payload_type) //
                .addString("error", { optional: true })
                .addBoolean("status");
            typeSchema.createResponseType(response_type, payload_type);
        }
    });

    builder.defineApi({
        id: "create_tenant",
        url: "/api/:tenant/tenant",
        group: "application",
        method: "post",
        response_type: refType("ops_response"),
        createTypes: ({ request_type, typeSchema }) => {
            typeSchema //
                .createAppendType(request_type)
                .addString("tenant", { location: eParameterLocation.query })
                .addString("name")
                .addString("email")
                .addString("password")
                .addBoolean("allow_registration")
                .addBoolean("allow_reset_password")
                .addString("organization");
        }
    });

    builder.defineApi({
        id: "get_user_profile",
        url: "/:tenant/user_profile",
        group: "application",
        method: "get",
        public: false,
        createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
            typeSchema
                .createAppendType(request_type) //
                .addString("tenant", { location: eParameterLocation.params });

            typeSchema
                .createAppendType(payload_type) //
                .addRefType("user", refType("sys_user"))
                .addRefType("profile", refType("sys_user_profile"));

            typeSchema.createResponseType(response_type, payload_type);
        }
    });

    createSecureCrudAPI({
        builder,
        entityName: "tenant",
        openApi: true,
        onCreateTypes: ({ payload_type, request_type, response_type, typeSchema }) => {
            typeSchema.createAppendType(request_type);
            typeSchema.createAppendType(payload_type);
            typeSchema.createResponseType(response_type, payload_type);
        }
    });
}
