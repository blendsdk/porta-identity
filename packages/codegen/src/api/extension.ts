import { ApiBuilder, refType } from "@blendsdk/codegen";
import { eParameterLocation } from "@blendsdk/jsonschema";

export function createExtensionAPI(builder: ApiBuilder) {
    builder.defineApi({
        id: `list_extension`,
        group: "extension",
        method: "get",
        url: `/api/:tenant/extensions/list`,
        payload_type: refType("sys_extension"),
        createTypes: ({ payload_type, request_type, response_type, typeSchema }) => {

            typeSchema
                //
                .createAppendType(request_type)
                .addString("tenant", { location: eParameterLocation.params });

            typeSchema
                //
                .createResponseType(response_type, payload_type, { array: true });
        }
    });
}