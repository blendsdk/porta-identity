import { ApiBuilder } from "@blendsdk/codegen";
import { eParameterLocation } from "@blendsdk/jsonschema";

export function createAdminAPI(builder: ApiBuilder) {
    builder.defineApi({
        id: "create_account",
        url: "/api/admin/:tenant/account/create",
        group: "admin",
        method: "post",
        public: false,
        createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
            typeSchema //
                .createAppendType(request_type)
                .addString("tenant", { location: eParameterLocation.params })
                .addString("username", { optional: true })
                .addString("password")
                .addBoolean("is_active", { optional: true })
                .addBoolean("require_pw_change", { optional: true })
                .addString("email")
                .addString("firstname")
                .addString("lastname")
                .addString("website", { optional: true })
                .addString("zoneinfo", { optional: true })
                .addString("birthdate", { optional: true })
                .addString("gender", { optional: true })
                .addString("middle_name", { optional: true })
                .addString("locale", { optional: true })
                .addString("avatar", { optional: true })
                .addString("address", { optional: true })
                .addString("postalcode", { optional: true })
                .addString("city", { optional: true })
                .addString("country", { optional: true })
                .addString("state", { optional: true })
                .addString("phone_number", { optional: true })
                .addBoolean("phone_number_verified", { optional: true })
                .addString("applications", { optional: true, array: true, acceptNullValue: true })
                .addString("service_application_id", { optional: true })
                .addString("metadata", { optional: true });

            typeSchema
                .createAppendType(payload_type)
                .addString("user_id")
                .addString("user_name")
                .addString("date_created");

            typeSchema.createResponseType(response_type, payload_type);
        }
    });

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
                .addString("metadata", { optional: true })

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
