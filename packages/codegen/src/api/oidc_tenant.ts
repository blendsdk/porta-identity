import { ApiBuilder, createSecureCrudAPI, eCrudAPI, refType } from "@blendsdk/codegen";
import { eParameterLocation } from "@blendsdk/jsonschema";

export function createOpenIDTenantAPI(builder: ApiBuilder) {
    createSecureCrudAPI({
        builder,
        entityName: "open_id_tenant",
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
                case eCrudAPI.create:
                    typeSchema //
                        .createAppendType(request_type)
                        .addString("tenant", { location: eParameterLocation.query })
                        .addString("name")
                        .addString("email")
                        .addString("password")
                        .addBoolean("allow_registration")
                        .addBoolean("allow_reset_password")
                        .addString("organization");
                    typeSchema.createResponseType(response_type, refType("sys_tenant"));
                    break;
                default:
                    typeSchema.createAppendType(request_type);
                    typeSchema.createAppendType(payload_type);
                    typeSchema.createResponseType(response_type, payload_type);
            }
        }
    });
}
