import { ApiBuilder } from "@blendsdk/codegen";

export function createInitializeAPI(builder: ApiBuilder) {
    builder.defineApi({
        id: "delete_tenant",
        url: "/api/initialize/tenant/delete",
        group: "initialize",
        method: "post",
        public: false,
        createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
            typeSchema //
                .createAppendType(request_type)
                .addString("tenant") // this is the tenant that the user has loged in to
                .addString("name");

            typeSchema
                .createAppendType(payload_type) //
                .addString("error", { optional: true })
                .addBoolean("status");
            typeSchema.createResponseType(response_type, payload_type);
        }
    });

    builder.defineApi({
        id: "create_tenant",
        url: "/api/initialize/tenant/create",
        group: "initialize",
        method: "post",
        public: false,
        createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
            typeSchema //
                .createAppendType(request_type)
                .addString("tenant") // this is the tenant that the user has loged in to
                .addString("name")
                .addString("organization")
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
        id: "initialize",
        url: "/api/initialize",
        group: "initialize",
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
}
