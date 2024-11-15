import { ApiBuilder } from "@blendsdk/codegen";
import { eParameterLocation } from "@blendsdk/jsonschema";
import { refOpsResponse } from "../customtypes";

export function createUserProfileAPI(builder: ApiBuilder) {
    builder.defineApi({
        public: false,
        id: "get_user_profile",
        group: "profile",
        method: "post",
        url: "/api/profile",
        payload_type: "#/definitions/porta_account",
        createTypes: ({ payload_type, request_type, response_type, typeSchema }) => {
            typeSchema.createAppendType(request_type);
            typeSchema.createResponseType(response_type, payload_type);
        }
    });

    builder.defineApi({
        public: false,
        id: "get_user_state",
        group: "profile",
        method: "get",
        url: "/api/:tenant/user_state",
        createTypes: ({ payload_type, request_type, response_type, typeSchema }) => {
            typeSchema
                //
                .createAppendType(request_type)
                .addString("tenant", { location: eParameterLocation.params });

            typeSchema
                //
                .createAppendType(payload_type)
                .addString("user_state");

            typeSchema.createResponseType(response_type, payload_type);
        }
    });

    builder.defineApi({
        public: false,
        id: "save_user_state",
        group: "profile",
        method: "post",
        url: "/api/:tenant/user_state",
        payload_type: refOpsResponse,
        createTypes: ({ payload_type, request_type, response_type, typeSchema }) => {
            typeSchema
                //
                .createAppendType(request_type)
                .addString("tenant", { location: eParameterLocation.params })
                .addString("user_state", { validate: false, acceptNullValue: true });

            typeSchema.createResponseType(response_type, payload_type);
        }
    });
}
