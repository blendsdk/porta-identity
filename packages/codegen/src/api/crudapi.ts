import { ApiBuilder, IApiOptions, IApiOptionsBuilder } from "@blendsdk/codegen";
import { IDictionaryOf } from "@blendsdk/stdlib";

export interface ICreateURLParams {
    name: string;
    defaultValue: string;
}

export interface ICreateCRUDApiOptions {
    entityName: string;
    builder: ApiBuilder;
    openApi?: boolean;
    onCreateTypes?: (params: IApiOptionsBuilder & { name: eCrudAPI }) => void;
    onCreateURL: (partams: ICreateURLParams) => string;
    endpoints?: IDictionaryOf<Partial<IApiOptions>>;
}

export enum eCrudAPI {
    list = "list",
    get = "get",
    create = "create",
    update = "update",
    delete = "delete"
}

export function createSecureCrudAPI(params: ICreateCRUDApiOptions) {
    let { entityName, builder, openApi = false, onCreateTypes, onCreateURL, endpoints = {} } = params;
    onCreateURL =
        onCreateURL ||
        (({ defaultValue }) => {
            return defaultValue;
        });
    const endpointNames: IDictionaryOf<Partial<IApiOptions>> = {
        [eCrudAPI.list]: {
            method: "get",
            url: `/api/${entityName}/list`,
            id: `list_${entityName}`
        },
        [eCrudAPI.get]: {
            method: "get",
            url: `/api/${entityName}/:id`,
            id: `get_${entityName}`
        },
        [eCrudAPI.create]: {
            method: "post",
            url: `/api/${entityName}`,
            id: `create_${entityName}`
        },
        [eCrudAPI.update]: {
            method: "patch",
            url: `/api/${entityName}/:id`,
            id: `update_${entityName}`
        },
        [eCrudAPI.delete]: {
            method: "delete",
            url: `/api/${entityName}/:id`,
            id: `delete_${entityName}`
        },
        ...endpoints
    };
    Object.entries(endpointNames).forEach(([name, endpoint]) => {
        const { method, url, id } = endpoint;
        builder.defineApi({
            id,
            public: false,
            openApi,
            method,
            url: onCreateURL({ name, defaultValue: url }),
            group: entityName,
            createTypes: (params) => {
                onCreateTypes({ name: name as eCrudAPI, ...params });
            }
        });
    });
}
