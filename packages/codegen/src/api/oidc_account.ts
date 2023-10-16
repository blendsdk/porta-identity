import { ApiBuilder, createSecureCrudAPI, eCrudAPI, refType } from "@blendsdk/codegen";
import { eParameterLocation } from "@blendsdk/jsonschema";

export function createOpenIDAccountAPI(builder: ApiBuilder) {
    createSecureCrudAPI({
        builder,
        entityName: "open_id_account",
        openApi: true,
        onCreateURL: ({ name }) => {
            switch (name) {
                case eCrudAPI.list:
                    return `/api/:tenant/${name}/list`;
                case eCrudAPI.create:
                    return `/api/:tenant/${name}`;
                case eCrudAPI.get:
                case eCrudAPI.delete:
                case eCrudAPI.update:
                    return `/api/:tenant/${name}/:id`;
            }
        },
        onCreateTypes: ({ name, payload_type, request_type, response_type, typeSchema }) => {
            switch (name) {
                default:
                    typeSchema.createAppendType(request_type);
                    typeSchema.createAppendType(payload_type);
                    typeSchema.createResponseType(response_type, payload_type);
            }
        }
    });

    builder.defineApi({
        method: "patch",
        group: "open_id_account",
        id: "change_account_password",
        url: "/api/:tenant/change_password/:id",
        openApi: true,
        createTypes: ({ request_type, response_type, typeSchema }) => {
            typeSchema
                .createAppendType(request_type)
                .addString("id", { location: eParameterLocation.query })
                .addString("tenant", { location: eParameterLocation.query })
                .addString("password");
            typeSchema.createResponseType(response_type, refType("ops_response"));
        }
    });
}
