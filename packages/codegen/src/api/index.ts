import { ApiBuilder, TypeBuilder, TypeSchema } from "@blendsdk/codegen";
import { consoleLogger } from "../lib";
import { defineAuthenticationAPI } from "./auth";
import { defineCustomApi } from "./custom";

//TODO: Remove this if not needed
// export interface IApiCollectionEndpoint
//     extends Omit<IApiOptions, "group" | "request_type" | "response_type" | "dispatch" | "method" | "url"> {}
// export interface IApiCollection {
//     [controller: string]: {
//         [url: string]: {
//             get?: IApiCollectionEndpoint;
//             post?: IApiCollectionEndpoint;
//             patch?: IApiCollectionEndpoint;
//             delete?: IApiCollectionEndpoint;
//         };
//     };
// }
// export function buildApiCollection(collection: IApiCollection, builder: ApiBuilder) {
//     Object.entries(collection || {}).forEach(([controllerName, endPoints]) => {
//         Object.entries(endPoints || {}).forEach(([url, epCollection]) => {
//             Object.entries(epCollection || {}).forEach(([method, endPoint]) => {
//                 builder.defineApi({
//                     group: controllerName,
//                     url,
//                     dispatch:"greepPerson",
//                     method: method as any,
//                     ...endPoint
//                 });
//             });
//         });
//     });
// }

export function createAPISchema(typeSchema: TypeSchema, typeBuilder: TypeBuilder) {
    const builder = new ApiBuilder({
        typeSchema,
        typeBuilder,
        logger: consoleLogger,
        routeDefVar: "routeDefinitions",
        importMapper: (from: string) => {
            switch (from) {
                case "request_response":
                    return "@porta/shared";
                case "routedefs":
                    return "../../../types";
                default:
                    return from;
            }
        }
    });

    // Add common i18N API
    builder.defineI18NApi();

    // Add version API
    builder.defineAppVersionApi(true);

    // Create the authentication API
    defineAuthenticationAPI(builder); //disable for now for experimenting with OIDC

    // Define application API
    defineCustomApi(builder);

    return builder.build();
}
