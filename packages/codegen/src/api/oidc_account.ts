import { ApiBuilder } from "@blendsdk/codegen";
import { createSecureCrudAPI, eCrudAPI } from "./crudapi";

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
}
