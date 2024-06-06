import { ApiBuilder } from "@blendsdk/codegen";

export function defineCustomApi(builder: ApiBuilder) {
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

    // builder.defineApi({
    //     id: "get_user_profile",
    //     url: "/:tenant/user_profile",
    //     group: "application",
    //     method: "get",
    //     public: false,
    //     createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
    //         typeSchema
    //             .createAppendType(request_type) //
    //             .addString("tenant", { location: eParameterLocation.params });

    //         typeSchema
    //             .createAppendType(payload_type) //
    //             .addRefType("user", refType("sys_user"))
    //             .addRefType("profile", refType("sys_user_profile"));

    //         typeSchema.createResponseType(response_type, payload_type);
    //     }
    // });

    // createOpenIDTenantAPI(builder);
    // createOpenIDClientAPI(builder);
    // createOpenIDRoleAPI(builder);
    // createOpenIDAccountAPI(builder);
    // createOpenIDPermissionAPI(builder);
}
