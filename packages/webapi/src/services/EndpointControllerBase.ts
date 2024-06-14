import { deepCopy, isObject, wrapInArray } from "@blendsdk/stdlib";
import { BadRequestResponse, Controller, IRequestContext, RedirectResponse, SuccessResponse } from "@blendsdk/webafx-common";
import { COOKIE_AUTH_FLOW, COOKIE_AUTH_FLOW_TTL, COOKIE_TENANT } from "@porta/shared";
import { IAuthorizationFlow, IErrorResponseParams, eOAuthResponseMode, eOAuthResponseType } from "../types";
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

    /**
     * @memberof AuthorizeEndpointController
     */
    public clearAuthenticationFlowCookies() {
        this.setCookie(COOKIE_AUTH_FLOW, "-", {
            expires: new Date(-1),
        });

        this.setCookie(COOKIE_TENANT, "-", {
            expires: new Date(-1),
        });

        this.setCookie(COOKIE_AUTH_FLOW_TTL, "-", {
            expires: new Date(-1),
        });
    }

    /**
     * @protected
     * @param {string} flowId
     * @return {*} 
     * @memberof EndpointController
     */
    protected getAuthenticationFlow(flowId: string) {
        const flowCacheKey = `auth_flow:${flowId}`;
        return this.getCache().getValue<IAuthorizationFlow>(flowCacheKey);
    }

    /**
     * Parses the response_type
     *
     * @protected
     * @param {string} data
     * @returns
     * @memberof AuthorizationController
     */
    protected parseResponseType(data: string) {
        const codes = (data || "").split(" ");
        return codes
            .map((item) => {
                return eOAuthResponseType[item.trim()] || undefined;
            })
            .filter(Boolean).length === codes.length
            ? codes
            : [];
    }

    /**
     * @protected
     * @param {string} tenant
     * @param {boolean} [checkActive]
     * @return {*} 
     * @memberof EndpointController
     */
    protected async getTenantRecord(tenant: string, checkActive?: boolean) {
        const tenantRecord = await databaseUtils.findTenant(tenant);
        checkActive = checkActive === false ? false : true;
        const isActive = tenantRecord ? checkActive ? tenantRecord.is_active : true : false;
        if (tenantRecord && isActive) {
            await databaseUtils.initDataSource(tenantRecord.id, this.request);
            return tenantRecord;
        } else {
            return undefined;
        }
        return tenantRecord && isActive ? tenantRecord : undefined;
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
            // response_mode === eOAuthResponseMode.query
            return new RedirectResponse({
                url: `${redirect_uri}?${new URLSearchParams(params).toString()}`
            });
        }
    }

    protected setNoCacheResponse() {
        this.response.set({
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Surrogate-Control": "no-store"
        });
    }
}