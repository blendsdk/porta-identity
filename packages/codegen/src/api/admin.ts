import { ApiBuilder } from "@blendsdk/codegen";
import { eParameterLocation } from "@blendsdk/jsonschema";

export function createAdminAPI(builder: ApiBuilder) {
    builder.defineApi({
        id: "create_application",
        url: "/api/admin/:tenant/application/create",
        group: "admin",
        method: "post",
        public: false,
        createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
            typeSchema //
                .createAppendType(request_type)
                .addString("tenant", { location: eParameterLocation.params })
                .addString("application_name")
                .addString("logo", { optional: true })
                .addString("description")
                .addBoolean("ow_consent", { optional: true }) // organizational wide consent

                .addString("client_type", { optional: true })
                .addString("redirect_uri")
                .addString("post_logout_redirect_uri", { optional: true })
                .addBoolean("is_back_channel_post_logout", { optional: true })
                .addNumber("mfa_bypass_days", { optional: true }) // 0 = no bypass
                .addString("mfa_id", { optional: true });

            typeSchema
                .createAppendType(payload_type)
                .addString("application_id")
                .addString("client_id")
                .addString("client_secret");

            typeSchema.createResponseType(response_type, payload_type);
        }
    });
}
