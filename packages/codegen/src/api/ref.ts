import { ApiBuilder, refType } from "@blendsdk/codegen";
import { eParameterLocation } from "@blendsdk/jsonschema";
import { camelCase } from "@blendsdk/stdlib";
import { ref_types } from "../customtypes";

export function createReferenceDataAPI(builder: ApiBuilder) {
    builder.defineApi({
        public: false,
        id: "get_reference_data",
        group: "reference_data",
        method: "post",
        url: "/api/:tenant/reference_data",
        createTypes: ({ payload_type, request_type, response_type, typeSchema }) => {
            const ts = typeSchema.createAppendType(payload_type);
            ref_types().forEach((item) => {
                ts.addRefType(camelCase(item, true), refType(item), { array: true });
            });

            typeSchema
                //
                .createAppendType(request_type)
                .addString("tenant", { location: eParameterLocation.params });

            typeSchema
                //
                .createResponseType(response_type, payload_type);
        }
    });
}