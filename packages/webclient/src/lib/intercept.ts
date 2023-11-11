import { IEndpointDefinition } from "@blendsdk/clientkit";
import { getGlobalRouter } from "@blendsdk/react";
import { IDictionaryOf } from "@blendsdk/stdlib";
import { IRouterCommonParams } from "../system/session/types";

/**
 * Applies the current tenant to the request parameter
 * if is is empty
 *
 * @export
 * @param {IEndpointDefinition} def
 * @param {IDictionaryOf<any>} params
 * @return {*}
 */
export function onInterceptRequestParameters(def: IEndpointDefinition, params: IDictionaryOf<any>) {
    if (def.url.indexOf(":tenant") !== -1 && !params.tenant) {
        const router = getGlobalRouter();
        const { tenant } = router.getParameters<IRouterCommonParams>();
        params.tenant = tenant;
    }
    return def;
}
