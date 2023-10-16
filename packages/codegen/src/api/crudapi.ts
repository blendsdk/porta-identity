import { ApiBuilder, IApiOptions, IApiOptionsBuilder } from "@blendsdk/codegen";
import { IDictionaryOf } from "@blendsdk/stdlib";

export interface ICreateCRUDApiOptions {
    entityName: string;
    builder: ApiBuilder;
    openApi?: boolean;
    onCreateTypes?: (params: IApiOptionsBuilder & { name: string }) => void;
}

export function createSecureCrudAPI(params: ICreateCRUDApiOptions) {
    const { entityName, builder, openApi = false, onCreateTypes } = params;
    const endpointNames: IDictionaryOf<Partial<IApiOptions>> = {
        list: {
            method: "get",
            url: `/api/${entityName}/list`,
            id: `list_${entityName}`
        },
        get: {
            method: "get",
            url: `/api/${entityName}/:id`,
            id: `get_${entityName}`
        },
        create: {
            method: "post",
            url: `/api/${entityName}`,
            id: `create_${entityName}`
        },
        update: {
            method: "patch",
            url: `/api/${entityName}/:id`,
            id: `update_${entityName}`
        },
        delete: {
            method: "delete",
            url: `/api/${entityName}/:id`,
            id: `delete_${entityName}`
        }
    };
    Object.entries(endpointNames).forEach(([name, endpoint]) => {
        const { method, url, id } = endpoint;
        builder.defineApi({
            id,
            public: false,
            openApi,
            method,
            url,
            group: entityName,
            createTypes: (params) => {
                onCreateTypes({ name, ...params });
            }
        });
    });
}
