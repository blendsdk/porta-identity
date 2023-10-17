import { ApiBuilder, createSecureCrudAPI, eCrudAPI } from "@blendsdk/codegen";

export function createOpenIDRoleAPI(builder: ApiBuilder) {
    createSecureCrudAPI({
        builder,
        entityName: "open_id_role",
        openApi: true,
        onCreateURL: ({ name }) => {
            let url: string = undefined;
            switch (name) {
                case eCrudAPI.list:
                    url = `/api/:tenant/${name}/list`;
                case eCrudAPI.create:
                    url = `/api/:tenant/${name}`;
                case eCrudAPI.get:
                case eCrudAPI.delete:
                case eCrudAPI.update:
                    url = `/api/:tenant/${name}/:id`;
            }
            return {
                url
            };
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
}
