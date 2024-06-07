import { deepCopy, isObject } from "@blendsdk/stdlib";
import { BadRequestResponse, Controller, IRequestContext, RedirectResponse, SuccessResponse } from "@blendsdk/webafx-common";
import { IErrorResponseParams, eOAuthResponseMode } from "../types";
import { databaseUtils } from "./DatabaseUtils";
import { formPostTemplate } from "./FormPostTemplate";

/**
 * Base class for a controller
 *
 * @export
 * @abstract
 * @class EndpointController
 * @extends {Controller<IRequestContext>}
 */
export abstract class EndpointController extends Controller<IRequestContext> {
    /**
     * Creates an issuer
     *
     * @protected
     * @param {string} tenant
     * @returns
     * @memberof EndpointController
     */
    protected getIssuer(tenant: string) {
        return `${this.getServerURL()}/${tenant}/oauth2`;
    }

    protected getTenantRecord(tenant: string) {
        return databaseUtils.findTenant(tenant);
    }

    /**
     * @protected
     * @param {IErrorResponseParams} args
     * @param {boolean} [toUserAgent]
     * @return {*} 
     * @memberof EndpointController
     */
    protected responseWithError(args: IErrorResponseParams, toUserAgent?: boolean) {

        const { error, error_description, state, redirect_uri, error_uri, response_mode } = args;

        const params = deepCopy({
            error,
            error_description: isObject(error_description)
                ? encodeURIComponent(JSON.stringify(error_description))
                : (error_description as string),
            error_uri,
            state
        });

        this.getLogger().error(error, params);

        if (toUserAgent) {
            return new BadRequestResponse({
                message: error,
                cause: params
            });
        } else if (response_mode === eOAuthResponseMode.form_post) {
            return new SuccessResponse(formPostTemplate({ redirect_uri, data: params }));
        } else {
            return new RedirectResponse({
                url: `${redirect_uri}?${new URLSearchParams(params).toString()}`
            });
        }
    }
}