import { ApiBuilder } from "@blendsdk/codegen";
import { eParameterLocation } from "@blendsdk/jsonschema";

export function defineAuthenticationAPI(builder: ApiBuilder) {
    /**
     * Check the account for its state and status
     */
    builder.defineApi({
        id: "discovery_keys",
        url: "/:tenant/oauth2/discovery/keys",
        group: "authorization",
        method: "get",
        public: true,
        createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
            typeSchema
                .createAppendType(request_type) //
                .addString("tenant", { location: eParameterLocation.params });

            typeSchema.createAppendType(payload_type);
            typeSchema.createAppendType(response_type); //
        }
    });

    /**
     * Check the account for its state and status
     */
    builder.defineApi({
        id: "discovery",
        url: "/:tenant/oauth2/.well-known/openid-configuration",
        group: "authorization",
        method: "get",
        public: true,
        createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
            typeSchema
                .createAppendType(request_type) //
                .addString("tenant", { location: eParameterLocation.params });

            typeSchema.createAppendType(payload_type);
            typeSchema.createAppendType(response_type);
        }
    });

    // oauth authorization request
    builder.defineApi({
        id: "authorize",
        url: "/:tenant/oauth2/authorize",
        group: "authorization",
        method: "get",
        public: true,
        createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
            typeSchema
                .createAppendType(request_type) //
                .addString("tenant", { location: eParameterLocation.params })
                .addString("response_type", { location: eParameterLocation.query, optional: true })
                .addString("client_id", { location: eParameterLocation.query })
                .addString("redirect_uri", { location: eParameterLocation.query, acceptNullValue: true })
                .addString("scope", { location: eParameterLocation.query })
                .addString("nonce", { location: eParameterLocation.query, optional: true }) // only for OIDC scope
                .addString("response_mode", { location: eParameterLocation.query, optional: true })
                .addString("state", { location: eParameterLocation.query, optional: true })
                .addString("code_challenge", { location: eParameterLocation.query, optional: true })
                .addString("code_challenge_method", { location: eParameterLocation.query, optional: true })
                .addString("ui_locales", { location: eParameterLocation.query, optional: true })
                .addString("request", { location: eParameterLocation.query, optional: true })
                .addString("acr_values", { location: eParameterLocation.query, optional: true })
                // Don't validate and pass it as it is. The validation will be done in the Claims class
                .addString("claims", { location: eParameterLocation.query, optional: true, validate: false })
                .addString("prompt", { location: eParameterLocation.query, optional: true })
                .addNumber("max_age", { location: eParameterLocation.query, optional: true })
                .addString("display", { location: eParameterLocation.query, optional: true })
                .addString("resource", { location: eParameterLocation.query, optional: true });

            typeSchema.createAppendType(payload_type); //

            typeSchema.createResponseType(response_type, payload_type);
        }
    });


}

// /**
//  * Creates authentication API
//  *
//  * @export
//  * @param {ApiBuilder} builder
//  */
// export function defineAuthenticationAPI(builder: ApiBuilder) {
//     builder.defineApi({
//         id: "token_info",
//         url: "/:tenant/oauth2/token_info",
//         group: "authorization",
//         method: "post",
//         public: false,
//         createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
//             typeSchema //
//                 .createAppendType(request_type)
//                 .addString("tenant", { location: eParameterLocation.params })
//                 .addString("token", { location: eParameterLocation.body })
//                 .addString("client_id", { location: eParameterLocation.body, optional: true }) // this normally comes from auth header
//                 .addString("client_secret", { location: eParameterLocation.body, optional: true }); // this normally comes from auth header

//             typeSchema
//                 .createAppendType(payload_type) //
//                 .addBoolean("active")
//                 .addString("scope", { optional: true })
//                 .addString("client_id", { optional: true })
//                 .addString("username", { optional: true })
//                 .addString("token_type", { optional: true })
//                 .addNumber("exp", { optional: true })
//                 .addNumber("iat", { optional: true })
//                 .addNumber("nbf", { optional: true })
//                 .addString("sub", { optional: true })
//                 .addString("aud", { optional: true })
//                 .addString("iss", { optional: true })
//                 .addString("jti", { optional: true });

//             typeSchema.createResponseType(response_type, payload_type);
//         }
//     });

//     // oauth authorization request
//     builder.defineApi({
//         id: "authorize",
//         // generate: "backend-only",
//         url: "/:tenant/oauth2/authorize",
//         group: "authorization",
//         method: "get",
//         public: true,
//         createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
//             typeSchema
//                 .createAppendType(request_type) //
//                 .addString("tenant", { location: eParameterLocation.params })
//                 .addString("response_type", { location: eParameterLocation.query, optional: true })
//                 .addString("client_id", { location: eParameterLocation.query })
//                 .addString("redirect_uri", { location: eParameterLocation.query, acceptNullValue: true })
//                 .addString("scope", { location: eParameterLocation.query })
//                 .addString("nonce", { location: eParameterLocation.query, optional: true }) // only for OIDC scope
//                 .addString("response_mode", { location: eParameterLocation.query, optional: true })
//                 .addString("state", { location: eParameterLocation.query, optional: true })
//                 .addString("code_challenge", { location: eParameterLocation.query, optional: true })
//                 .addString("code_challenge_method", { location: eParameterLocation.query, optional: true })
//                 .addString("ui_locales", { location: eParameterLocation.query, optional: true })
//                 .addString("request", { location: eParameterLocation.query, optional: true })
//                 .addString("acr_values", { location: eParameterLocation.query, optional: true })
//                 // Don't validate and pass it as it is. The validation will be done in the Claims class
//                 .addString("claims", { location: eParameterLocation.query, optional: true, validate: false })
//                 .addString("prompt", { location: eParameterLocation.query, optional: true })
//                 .addNumber("max_age", { location: eParameterLocation.query, optional: true })
//                 .addString("display", { location: eParameterLocation.query, optional: true })
//                 .addString("resource", { location: eParameterLocation.query, optional: true });

//             typeSchema.createAppendType(payload_type); //

//             typeSchema.createResponseType(response_type, payload_type);
//         }
//     });

//     builder.defineApi({
//         id: "token",
//         // generate: "backend-only",
//         url: "/:tenant/oauth2/token",
//         group: "authorization",
//         method: "post",
//         public: true,
//         createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
//             typeSchema
//                 .createAppendType(request_type) //
//                 .addString("tenant", { location: eParameterLocation.params })
//                 .addString("client_id", { location: eParameterLocation.body, optional: true }) // set to optional for oidc certification
//                 .addString("redirect_uri", { location: eParameterLocation.body, optional: true })
//                 .addString("grant_type", { location: eParameterLocation.body })
//                 .addString("code", { location: eParameterLocation.body, optional: true })
//                 .addString("code_verifier", { location: eParameterLocation.body, optional: true })
//                 .addString("client_secret", { location: eParameterLocation.body, optional: true })
//                 .addString("state", { location: eParameterLocation.body, optional: true }) // was added for client credentials / confidential clients
//                 .addString("nonce", { location: eParameterLocation.body, optional: true }) // was added for client credentials / confidential clients
//                 .addString("scope", { location: eParameterLocation.query, optional: true })
//                 .addString("claims", { location: eParameterLocation.query, optional: true, validate: false })
//                 .addString("refresh_token", { location: eParameterLocation.body, optional: true })
//                 .addString("resource", { location: eParameterLocation.query, optional: true });

//             typeSchema
//                 .createAppendType(payload_type) //
//                 .addString("access_token")
//                 .addString("token_type")
//                 .addNumber("expires_in")
//                 .addString("id_token")
//                 .addString("refresh_token", { optional: true })
//                 .addNumber("refresh_token_expires_in", { optional: true })
//                 .addNumber("refresh_token_expires_at", { optional: true });

//             typeSchema.createResponseType(response_type, payload_type);
//         }
//     });

//     builder.defineApi({
//         id: "signin",
//         // generate: "backend-only",
//         url: "/af/signin",
//         group: "authorization",
//         method: "get",
//         public: true,
//         createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
//             typeSchema //
//                 .createAppendType(request_type)
//                 .addString("af", { optional: true, location: eParameterLocation.query });
//             typeSchema.createAppendType(payload_type);
//             typeSchema.createResponseType(response_type, payload_type);
//         }
//     });

//     builder.defineApi({
//         id: "redirect",
//         // generate: "backend-only",
//         url: "/af/redirect",
//         group: "authorization",
//         method: "get",
//         public: true,
//         createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
//             typeSchema
//                 .createAppendType(request_type) //
//                 .addString("af", { location: eParameterLocation.query });
//             typeSchema.createAppendType(payload_type);
//             typeSchema.createResponseType(response_type, payload_type);
//         }
//     });

//     /**
//      * Gets the flow information for the webclient
//      */
//     builder.defineApi({
//         id: "flow_info",
//         url: "/af/flow_info",
//         group: "authorization",
//         method: "post",
//         public: true,
//         createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
//             typeSchema //
//                 .createAppendType(request_type)
//                 .addString("af", { optional: true });
//             typeSchema
//                 .createAppendType(payload_type) //
//                 .addString("logo")
//                 .addString("client_id")
//                 .addString("application_name")
//                 .addString("organization")
//                 .addBoolean("allow_reset_password")
//                 .addBoolean("allow_registration");
//             typeSchema.createResponseType(response_type, payload_type);
//         }
//     });

//     /**
//      * Check the account for its state and status
//      */
//     builder.defineApi({
//         id: "check_flow",
//         url: "/af/check_flow",
//         group: "authorization",
//         method: "post",
//         public: true,
//         payload_type: "#/definitions/authentication_flow_state",
//         createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
//             typeSchema
//                 .createAppendType(request_type)
//                 .addString("state") //
//                 .addString("af", { optional: true })
//                 .addString("options", { optional: true });

//             typeSchema.createResponseType(response_type, payload_type);
//         }
//     });

//     /**
//      * Check the account for its state and status
//      */
//     builder.defineApi({
//         id: "oidc_discovery",
//         url: "/:tenant/oauth2/.well-known/openid-configuration",
//         group: "authorization",
//         method: "get",
//         public: true,

//         createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
//             typeSchema
//                 .createAppendType(request_type) //
//                 .addString("tenant", { location: eParameterLocation.params });

//             typeSchema.createAppendType(payload_type);
//             typeSchema.createAppendType(response_type); //
//         }
//     });

//     /**
//      * Check the account for its state and status
//      */
//     builder.defineApi({
//         id: "oidc_discovery_keys",
//         url: "/:tenant/oauth2/discovery/keys",
//         group: "authorization",
//         method: "get",
//         public: true,

//         createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
//             typeSchema
//                 .createAppendType(request_type) //
//                 .addString("tenant", { location: eParameterLocation.params });

//             typeSchema.createAppendType(payload_type);
//             typeSchema.createAppendType(response_type); //
//         }
//     });

//     builder.defineApi({
//         id: "user_info_get",
//         url: "/:tenant/oauth2/me",
//         group: "authorization",
//         method: "get",
//         public: false,
//         createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
//             typeSchema
//                 .createAppendType(request_type) //
//                 .addString("tenant", { location: eParameterLocation.params });

//             typeSchema.createAppendType(payload_type);
//             typeSchema.createAppendType(response_type); //
//         }
//     });

//     builder.defineApi({
//         id: "user_info_post",
//         url: "/:tenant/oauth2/me",
//         group: "authorization",
//         method: "post",
//         public: false,
//         createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
//             typeSchema
//                 .createAppendType(request_type) //
//                 .addString("access_token", { location: eParameterLocation.body, optional: true })
//                 .addString("tenant", { location: eParameterLocation.params });

//             typeSchema.createAppendType(payload_type);
//             typeSchema.createAppendType(response_type); //
//         }
//     });

//     builder.defineApi({
//         id: "session_logout_get",
//         url: "/:tenant/oauth2/logout",
//         group: "authorization",
//         method: "get",
//         public: true,
//         createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
//             typeSchema
//                 .createAppendType(request_type) //
//                 .addString("tenant", { location: eParameterLocation.params, optional: true })
//                 .addString("id_token_hint", { location: eParameterLocation.query, optional: true })
//                 .addString("logout_hint", { location: eParameterLocation.query, optional: true })
//                 .addString("client_id", { location: eParameterLocation.query, optional: true })
//                 .addString("post_logout_redirect_uri", { location: eParameterLocation.query, optional: true })
//                 .addString("state", { location: eParameterLocation.query, optional: true })
//                 .addString("ui_locales", { location: eParameterLocation.query, optional: true })
//                 .addString("lf", { location: eParameterLocation.query, optional: true });

//             typeSchema.createAppendType(payload_type);
//             typeSchema.createAppendType(response_type); //
//         }
//     });

//     builder.defineApi({
//         id: "session_logout_post",
//         url: "/:tenant/oauth2/logout",
//         group: "authorization",
//         method: "post",
//         public: false,
//         createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
//             typeSchema
//                 .createAppendType(request_type) //
//                 .addString("tenant", { location: eParameterLocation.params })
//                 .addString("id_token_hint", { location: eParameterLocation.body, optional: true })
//                 .addString("logout_hint", { location: eParameterLocation.body, optional: true })
//                 .addString("client_id", { location: eParameterLocation.body, optional: true })
//                 .addString("post_logout_redirect_uri", { location: eParameterLocation.body, optional: true })
//                 .addString("state", { location: eParameterLocation.body, optional: true })
//                 .addString("ui_locales", { location: eParameterLocation.body, optional: true })
//                 .addString("lf", { location: eParameterLocation.body, optional: true }); // this only is here to satisfy TS typing

//             typeSchema.createAppendType(payload_type);
//             typeSchema.createAppendType(response_type); //
//         }
//     });

//     builder.defineApi({
//         id: "logout_flow_info",
//         url: "/lf/flow_info",
//         group: "authorization",
//         method: "get",
//         public: true,
//         createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
//             typeSchema //
//                 .createAppendType(request_type)
//                 .addString("lf", { optional: true });

//             typeSchema
//                 .createAppendType(payload_type) //
//                 .addString("logo")
//                 .addString("application_name")
//                 .addString("organization")
//                 .addString("finalize_url")
//                 .addString("flowId")
//                 .addBoolean("has_post_redirect");
//             typeSchema.createResponseType(response_type, payload_type);
//         }
//     });

//     builder.defineApi({
//         id: "forgot_password_flow_info",
//         url: "/fp/flow_info",
//         group: "authorization",
//         method: "post",
//         public: true,
//         createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
//             typeSchema //
//                 .createAppendType(request_type);

//             typeSchema
//                 .createAppendType(payload_type) //
//                 .addString("logo")
//                 .addString("organization");
//             typeSchema.createResponseType(response_type, payload_type);
//         }
//     });

//     builder.defineApi({
//         id: "forgot_password_request_account",
//         url: "/fp/forgot_request_account",
//         group: "authorization",
//         method: "post",
//         public: true,
//         createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
//             typeSchema //
//                 .createAppendType(request_type)
//                 .addString("account");

//             typeSchema.createAppendType(payload_type); //
//             typeSchema.createResponseType(response_type, payload_type);
//         }
//     });

//     builder.defineApi({
//         id: "check_password_reset_request",
//         url: "/fp/check_password_reset_request",
//         group: "authorization",
//         method: "post",
//         public: true,
//         createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
//             typeSchema //
//                 .createAppendType(request_type)
//                 .addString("flow");

//             typeSchema
//                 .createAppendType(payload_type) //
//                 .addString("logo")
//                 .addString("organization");
//             typeSchema.createResponseType(response_type, payload_type);
//         }
//     });

//     builder.defineApi({
//         id: "request_password_reset",
//         url: "/fp/request_password_reset",
//         group: "authorization",
//         method: "post",
//         public: true,
//         createTypes: ({ request_type, response_type, payload_type, typeSchema }) => {
//             typeSchema //
//                 .createAppendType(request_type)
//                 .addString("flow")
//                 .addString("password")
//                 .addString("confirmPassword");

//             typeSchema
//                 .createAppendType(payload_type) //
//                 .addBoolean("status");
//             typeSchema.createResponseType(response_type, payload_type);
//         }
//     });

//     builder.defineTokenAuthenticationAPI();
// }
