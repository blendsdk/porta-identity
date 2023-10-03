import { ApiBuilder, refType } from "@blendsdk/codegen";

export function defineCustomApi(builder: ApiBuilder) {
    builder.defineApi({
        id: "initialize",
        url: "/api/initialize",
        group: "application",
        method: "post",
        public: false,
        generate: "backend-only",
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
        url: "/api/tenant",
        group: "application",
        method: "post",
        request_type: refType("sys_tenant"),
        payload_type: refType("ops_response")
    });
}
