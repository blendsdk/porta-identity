import { ApiBuilder, createSecureCrudAPI, eCrudAPI } from "@blendsdk/codegen";

export function createOpenIDPermissionAPI(builder: ApiBuilder) {
    createSecureCrudAPI({
        builder,
        entityName: "open_id_permission",
        openApi: true,
        onCreateURL: ({ name }) => {
            let url: string = undefined;
            switch (name) {
                case eCrudAPI.list:
                    url = `/api/:tenant/${name}/list`;
                    break;
                case eCrudAPI.create:
                    url = `/api/:tenant/${name}`;
                    break;
                case eCrudAPI.get:
                case eCrudAPI.delete:
                case eCrudAPI.update:
                    url = `/api/:tenant/${name}/:id`;
                    break;
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
