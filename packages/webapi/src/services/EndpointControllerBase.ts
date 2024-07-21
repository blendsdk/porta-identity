import { base64Decode, deepCopy, IDictionaryOf, isObject } from "@blendsdk/stdlib";
import { BadRequestResponse, Controller, IRequestContext, RedirectResponse, SuccessResponse } from "@blendsdk/webafx-common";
import { COOKIE_AUTH_FLOW, COOKIE_AUTH_FLOW_TTL, COOKIE_TENANT, ISysApplication, ISysSession, ISysTenant, ISysUser } from "@porta/shared";
import * as jose from "jose";
import { eOAuthResponseMode, eOAuthResponseType, eOAuthSigningAlg, IAuthorizationFlow, IErrorResponseParams } from "../types";
import { Claims } from "./Claims";
import { commonUtils } from "./CommonUtils";
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

    protected async builJTWToken(params:
        {
            tenantRecord: ISysTenant,
            app: ISysApplication,
            user: ISysUser,
            session: ISysSession,
            date_created: Date,
            date_expire: Date,
            claims: IDictionaryOf<any>;
        }) {
        const { tenantRecord, app, date_created, date_expire, claims, user, session } = params;
        const { privateKey } = await databaseUtils.getJWKSigningKeys(tenantRecord);

        const pKey = await jose.importPKCS8(privateKey, eOAuthSigningAlg.RS256);

        return new jose.SignJWT({
            client_id: app.client_id,
            ten: tenantRecord.id,
            ...claims
        }) //
            .setProtectedHeader({ alg: eOAuthSigningAlg.RS256, typ: "at+JWT" })
            .setIssuer(this.getIssuer(tenantRecord.id))
            .setExpirationTime(commonUtils.millisecondsToSeconds(date_expire.getTime()))
            .setAudience(app.client_id)
            .setSubject(user.id)
            .setJti(session.id)
            .setIssuedAt(commonUtils.millisecondsToSeconds(date_created.getTime()))
            .sign(pKey);
    }

    /**
     * Gets the OIDC claims by scope
     *
     * @protected
     * @param {IAccessToken} accessTokenStorage
     * @param {string} tenantName
     * @returns
     * @memberof EndpointController
     */
    protected getClaimsByScope(params: IDictionaryOf<any>) {
        const claims = new Claims({
            ...params,
            serverUrl: this.getServerURL(),
        } as any);
        return claims.getClaims();
    }

    /**
     *
     *
     * @protected
     * @param {IAuthorizationFlow} flow
     * @return {*} 
     * @memberof EndpointController
     */
    protected async updateFlow(flow: IAuthorizationFlow) {
        const flowCacheKey = `auth_flow:${flow.flowId}`;
        return this.getCache().setValue(flowCacheKey, flow, { expire: flow.expire });
    }

    protected getBasicAuthCredentialsFromRequestHeader() {
        const [type, data] = (this.request.headers.authorization || "").split(" ");
        if (data && type && type.toLocaleLowerCase() === "basic") {
            const [client_id, client_secret] = base64Decode(data).split(":");
            return {
                client_id,
                client_secret
            };
        }
        return {
            client_id: undefined,
            client_secret: undefined
        };
    }

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
            const url = new URL(redirect_uri);
            Object.entries(params).forEach(([key, val]) => {
                url.searchParams.append(key, val);
            });
            return new RedirectResponse({
                url: url.toString()
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