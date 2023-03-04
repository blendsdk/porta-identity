import { ApiBuilder, IApiCollection } from "@blendsdk/codegen";

export function defineCustomApi(builder: ApiBuilder) {
    // TODO: Add custom API here
    const application: IApiCollection = {};
    builder.defineApiCollection(application);
}
