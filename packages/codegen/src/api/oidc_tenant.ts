import { ApiBuilder, IApiAccessDescription, createSecureCrudAPI, eCrudAPI, refType } from "@blendsdk/codegen";
import { eParameterLocation } from "@blendsdk/jsonschema";

export function createOpenIDTenantAPI(builder: ApiBuilder) {
    createSecureCrudAPI({
        builder,
        entityName: "open_id_tenant",
        openApi: true,
        onCreateURL: ({ name }) => {
            let url: string = undefined;
            let access: IApiAccessDescription = undefined;
            switch (name) {
                case eCrudAPI.list:
                    url = `/api/:tenant/tenant/${name}/list`;
                    break;
                case eCrudAPI.create:
                    url = `/api/:tenant/tenant/${name}`;
                    access = {
                        permissions: [
                            {
                                permission: "CAN_CREATE_TENANT",
                                description: "permission_to_create_tenant"
                            }
                        ]
                    };
                    break;
                case eCrudAPI.get:
                case eCrudAPI.delete:
                case eCrudAPI.update:
                    url = `/api/:tenant/tenant/${name}/:id`;
                    break;
            }
            return {
                url,
                access
            };
        },
        onCreateTypes: ({ name, payload_type, request_type, response_type, typeSchema }) => {
            switch (name) {
                case eCrudAPI.create:
                    typeSchema //
                        .createAppendType(request_type)
                        .addString("tenant", { location: eParameterLocation.params })
                        .addString("name")
                        .addString("email")
                        .addString("password")
                        .addBoolean("allow_registration")
                        .addBoolean("allow_reset_password")
                        .addString("organization");
                    typeSchema.createResponseType(response_type, refType("sys_tenant"));
                    break;
                case eCrudAPI.delete:
                    typeSchema //
                        .createAppendType(request_type)
                        .addString("tenant", { location: eParameterLocation.params })
                        .addString("id", { location: eParameterLocation.params });
                    typeSchema.createResponseType(response_type, refType("ops_response"));
                    break;
                case eCrudAPI.get:
                    typeSchema //
                        .createAppendType(request_type)
                        .addString("tenant", { location: eParameterLocation.params })
                        .addString("id", { location: eParameterLocation.params });
                    typeSchema.createResponseType(response_type, refType("sys_tenant"));
                    break;
                case eCrudAPI.list:
                    typeSchema //
                        .createAppendType(request_type)
                        .addString("tenant", { location: eParameterLocation.params });
                    typeSchema.createResponseType(response_type, refType("sys_tenant"), { array: true });
                    break;
                default:
                    typeSchema.createAppendType(request_type);
                    typeSchema.createAppendType(payload_type);
                    typeSchema.createResponseType(response_type, payload_type);
            }
        }
    });
}
