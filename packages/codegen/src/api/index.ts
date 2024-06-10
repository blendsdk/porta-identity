import { ApiBuilder, TypeBuilder, TypeSchema } from "@blendsdk/codegen";
import { consoleLogger } from "../lib";
import { defineCustomApi } from "./custom";

export function createAPISchema(typeSchema: TypeSchema, typeBuilder: TypeBuilder) {
    const builder = new ApiBuilder({
        // requestConfigHandler: {
        //     handlerFunction: "onInterceptRequestParameters",
        //     importFrom: "../../lib"
        // },
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

    // Define application API
    defineCustomApi(builder);

    return builder.build();
}
