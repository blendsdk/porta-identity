import { generateRandomUUID } from "@blendsdk/crypto";
import {
    base64Decode,
    CRC32,
    deepCopy,
    IDictionaryOf,
    isEmptyObject,
    isNullOrUndef,
    isObject,
    MD5
} from "@blendsdk/stdlib";
import {
    BadRequestResponse,
    Controller,
    IRequestContext,
    RedirectResponse,
    SuccessResponse
} from "@blendsdk/webafx-common";
import {
    COOKIE_AUTH_FLOW,
    COOKIE_AUTH_FLOW_TTL,
    COOKIE_TENANT,
    IAuthorizeRequest,
    ILifetime,
    IPortaAccount,
    ISysAccessToken,
    ISysApplication,
    ISysAuthorizationView,
    ISysClient,
    ISysSession,
    ISysTenant,
    ISysUser,
    IToken,
    ITokenRequest
} from "@porta/shared";
import * as jose from "jose";
import crypto from "node:crypto";
import {
    eOAuthGrantType,
    eOAuthPrompt,
    eOAuthResponseMode,
    eOAuthResponseType,
    eOAuthSigningAlg,
    IAuthorizationFlow,
    IErrorResponseParams,
    IPortaApplicationSetting
} from "../types";
import { Claims } from "./Claims";
import { commonUtils } from "./CommonUtils";
import { databaseUtils, INewAccessTokenResult } from "./DatabaseUtils";
import { formPostTemplate } from "./FormPostTemplate";

export interface ILogoutFlow {
    session: ISysSession;
    application: ISysApplication;
    client: ISysClient;
    tenant: string;
    expire: number;
    post_logout_redirect_uri: string;
}

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
     * @protected
     * @param {{
     *         authRequest: IAuthorizeRequest;
     *         authRecord: ISysAuthorizationView;
     *         user: ISysUser;
     *         tenantRecord: ISysTenant;
     *     }} params
     * @return {*}
     * @memberof EndpointController
     */
    protected async isUserConsentRequired(params: {
        authRequest: IAuthorizeRequest;
        authRecord: ISysAuthorizationView;
        user: ISysUser;
        tenantRecord: ISysTenant;
    }) {
        const { authRecord, authRequest, tenantRecord, user } = params;
        if (authRequest.prompt === eOAuthPrompt.consent || isNullOrUndef(user)) {
            return true; // forced consent
        } else {
            const { is_consent = false } =
                (await databaseUtils.findConsentByUserAndApplication(
                    user.id,
                    authRecord.application_id,
                    tenantRecord
                )) || {};
            return is_consent === false || authRecord.ow_consent === false;
        }
    }

    /**
     * @protected
     * @memberof EndpointController
     */
    protected removeAllCookies() {
        Object.keys(this.request.cookies).forEach((name) => {
            this.setCookie(name, "?", {
                expires: new Date(Date.now() - 1000000)
            });
        });
        Object.keys(this.request.signedCookies).forEach((name) => {
            this.setCookie(name, "?", {
                expires: new Date(Date.now() - 1000000),
                signed: true
            });
        });
    }

    /**
     * @protected
     * @param {IAuthorizationFlow} flow
     * @return {*}
     * @memberof EndpointController
     */
    protected getMFABypassKey(user: ISysUser, authRecord: ISysAuthorizationView) {
        return `auth_mfa_bypass:${MD5([authRecord.client_id, commonUtils.getRemoteIP(this.request), user.id].join(""))}`;
    }

    /**
     * @protected
     * @param {string} keyName
     * @param {string} value
     * @return {*}
     * @memberof EndpointController
     */
    protected async createIdTokenHeaderHashForKey(keyName: string, value: string) {
        const hash = crypto.createHash("sha256").update(value).digest();
        const leftmostBits = hash.subarray(0, 16);
        return {
            [keyName]: leftmostBits.toString("base64url")
        };
    }

    /**
     * @protected
     * @param {IAuthorizationFlow} flow
     * @param {ITokenRequest} tokenRequest
     * @return {*}  {Promise<IToken>}
     * @memberof TokenEndpointController
     */
    protected async createTokens(params: {
        flow: IAuthorizationFlow;
        tokenRequest: ITokenRequest;
        idTokenPayload?: IDictionaryOf<any>;
        includeIdToken?: boolean;
        includeAccessToken?: boolean;
        idTokenLifeTime?: ILifetime;
        includeAtHash?: boolean;
    }): Promise<IToken> {
        const {
            flow,
            tokenRequest,
            idTokenPayload,
            includeIdToken = true,
            includeAccessToken = true,
            idTokenLifeTime,
            includeAtHash = false
        } = params;
        const { authRecord, authRequest, tenantRecord, user, session, profile } = flow;
        const { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } = this.getSettings<IPortaApplicationSetting>();
        let { access_token_length, refresh_token_length } = authRecord;
        const scope = tokenRequest.scope || authRequest.scope;

        const { offline_access = false } = commonUtils.parseSeparatedTokens(scope) || {};
        access_token_length = parseFloat((access_token_length || ACCESS_TOKEN_TTL).toString());
        refresh_token_length = parseFloat((refresh_token_length || REFRESH_TOKEN_TTL).toString());

        let accessTokenResult: INewAccessTokenResult = undefined;
        let reftesh_token: IDictionaryOf<any> = {};

        if (includeAccessToken) {
            accessTokenResult = await databaseUtils.newAccessToken({
                client_record_id: authRecord.sys_client_id,
                session,
                tenantRecord,
                ttl: access_token_length,
                user_id: user.id,
                authRequest,
                token_reference: commonUtils.createTokenReference(
                    tokenRequest.client_id,
                    tokenRequest.client_secret || "",
                    this.request
                ),
                tokenBuilder: async (date_created: Date, date_expire: Date) => {
                    return this.builJTWToken({
                        app: await databaseUtils.findApplicationByClientID(tenantRecord, authRequest.client_id),
                        date_created,
                        date_expire,
                        session,
                        tenantRecord,
                        user,
                        claims: {
                            ...(user ? { udc: new Date(user.date_modified).getTime() } : {}),
                            ...(profile ? { pdc: new Date(profile.date_modified).getTime() } : {})
                        }
                    });
                }
            });

            if (offline_access) {
                const { refresh_token_record, refreshtoken_date_expire } = await databaseUtils.newRefreshToken({
                    accessTokenRecord: accessTokenResult.access_token_record,
                    tenantRecord,
                    ttl: refresh_token_length
                });
                reftesh_token = {
                    refresh_token: refresh_token_record.refresh_token,
                    refresh_token_expires_in: refreshtoken_date_expire.getTime() - Date.now()
                };
            }
        }

        let id_token: string = undefined;
        if (includeIdToken) {
            let payload =
                includeAtHash && accessTokenResult
                    ? await this.createIdTokenHeaderHashForKey(
                          "at_hash",
                          accessTokenResult.access_token_record.access_token
                      )
                    : {};

            id_token = await this.createIDToken({
                lifeTime: accessTokenResult ? accessTokenResult.access_token_record : idTokenLifeTime,
                authRequest,
                session,
                tenantRecord,
                tokenRequest,
                user_id: user.id,
                is_refresh_token_grant: tokenRequest.grant_type === eOAuthGrantType.refresh_token,
                payload: { ...payload, ...(idTokenPayload || {}) }
            });
        }

        let result: IToken = {} as any;
        if (includeAccessToken) {
            const { access_token_record, date_expire } = accessTokenResult;
            result = {
                access_token: access_token_record.access_token,
                expires_in: date_expire.getTime() - Date.now(),
                token_type: "Bearer",
                ...reftesh_token
            };
        }

        if (includeIdToken) {
            result = {
                ...result,
                id_token
            };
        }

        return result;
    }

    /**
     * @protected
     * @return {*}
     * @memberof EndpointController
     */
    protected async cleanExpiredSessions(tenantRecord: ISysTenant) {
        await databaseUtils.cleanExpiredSessions(tenantRecord);
    }

    /**
     * @protected
     * @param {{
     *             tenantRecord: ISysTenant,
     *             app: ISysApplication,
     *             user: ISysUser,
     *             session: ISysSession,
     *             date_created: Date,
     *             date_expire: Date,
     *             claims: IDictionaryOf<any>;
     *         }} params
     * @return {*}
     * @memberof EndpointController
     */
    protected async builJTWToken(params: {
        tenantRecord: ISysTenant;
        app: ISysApplication;
        user: ISysUser;
        session: ISysSession;
        date_created: Date;
        date_expire: Date;
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
            .setProtectedHeader({ alg: eOAuthSigningAlg.RS256, typ: "at+JWT", rnd: CRC32(generateRandomUUID()) })
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
    protected async getClaimsByScope(params: IDictionaryOf<any>) {
        const { user, client, tenant, auth_request_params } =
            (params as any as IPortaAccount & Pick<ISysAccessToken, "auth_request_params">) || {};
        const { scope = "", is_consent } =
            (await databaseUtils.findConsentByUserAndApplication(user.id, client.application_id, tenant)) || {};

        const requested = commonUtils.parseSeparatedTokens(auth_request_params["scope"] || "");
        const consented = commonUtils.parseSeparatedTokens((scope || "").replace(/openid|offline_access/gi, ""));

        if (!is_consent) {
            // set the not consented scopes to false
            Object.keys(consented).forEach((item) => {
                requested[item] = false;
            });

            // Object loop and remove the scopes set to false
            params.auth_request_params.scope = Object.entries(requested)
                .filter(([, v]) => {
                    return v === true;
                })
                .map(([k]) => {
                    return k;
                })
                .join(" ");
        }

        const claims = new Claims({
            ...params,
            serverUrl: this.getServerURL()
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

    /**
     * @TODO implement this correctly!
     * @protected
     * @param {string} acr_values
     * @return {*}
     * @memberof EndpointController
     */
    protected handleAcrClaims(acr_values: string) {
        if (acr_values) {
            const acr_request = commonUtils.parseSeparatedTokens(acr_values, true);
            //TODO: need to be implemented in a later version
            return Object.keys(acr_request)[0]; // just return something
        } else {
            return undefined;
        }
    }

    /**
     * @protected
     * @return {*}
     * @memberof EndpointController
     */
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
            expires: new Date(-1)
        });

        this.setCookie(COOKIE_TENANT, "-", {
            expires: new Date(-1)
        });

        this.setCookie(COOKIE_AUTH_FLOW_TTL, "-", {
            expires: new Date(-1)
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
     * @protected
     * @param {IErrorResponseParams} args
     * @param {boolean} [toUserAgent]
     * @return {*}
     * @memberof EndpointController
     */
    protected responseWithError(args: IErrorResponseParams, toUserAgent?: boolean) {
        const {
            error,
            error_description,
            state,
            redirect_uri,
            error_uri,
            response_mode,
            response_type = eOAuthResponseType.code
        } = args;

        const fragmented = response_type !== eOAuthResponseType.code;
        let fragment: IDictionaryOf<any> = {};

        let params = deepCopy({
            error,
            error_description: isObject(error_description)
                ? encodeURIComponent(JSON.stringify(error_description))
                : (error_description as string),
            error_uri,
            state
        });

        if (fragmented && !toUserAgent) {
            fragment = { ...params };
            params = {} as any;
        }

        this.getLogger().error(error, params);

        if (toUserAgent) {
            return new BadRequestResponse({
                message: error,
                cause: params
            });
        } else if (response_mode === eOAuthResponseMode.form_post) {
            return new SuccessResponse(formPostTemplate({ redirect_uri, data: params, fragment }));
        } else {
            // response_mode === eOAuthResponseMode.query
            return new RedirectResponse({
                url: this.createRedirectUri(redirect_uri, params, fragment)
            });
        }
    }

    /**
     * @protected
     * @param {IAuthorizationFlow} flow
     * @return {*}
     * @memberof FinalizeEndpointController
     */
    protected createRedirectUri(redirect_uri: string, response: IDictionaryOf<string>, fragment?: IDictionaryOf<any>) {
        const url = new URL(redirect_uri);

        Object.entries(response).forEach(([key, value]) => {
            url.searchParams.append(key, encodeURIComponent(value));
        });

        if (!isEmptyObject(fragment || {})) {
            url.hash = Object.entries(fragment)
                .map(([k, v]) => {
                    return `${k}=${encodeURIComponent(v)}`;
                })
                .join("&");
        }
        return url.toString();
    }

    protected setNoCacheResponse() {
        this.response.set({
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
            "Surrogate-Control": "no-store"
        });
    }

    /**
     * @protected
     * @param {({
     *         tenantRecord: ISysTenant,
     *         tokenRequest: ITokenRequest | IAuthorizeRequest,
     *         accessToken: ISysAccessToken,
     *         session: ISysSession,
     *         authRequest: IAuthorizeRequest;
     *         user_id: string;
     *         is_refresh_token_grant: boolean;
     *     })} params
     * @return {*}
     * @memberof EndpointController
     */
    protected async createIDToken(params: {
        tenantRecord: ISysTenant;
        tokenRequest: ITokenRequest | IAuthorizeRequest;
        lifeTime: ILifetime;
        session: ISysSession;
        authRequest: IAuthorizeRequest;
        user_id: string;
        is_refresh_token_grant: boolean;
        payload?: IDictionaryOf<any>;
    }) {
        const { tenantRecord, tokenRequest, lifeTime, session, authRequest, user_id, is_refresh_token_grant, payload } =
            params;

        const { nonce } = authRequest;

        const { privateKey } = await databaseUtils.getJWKSigningKeys(tenantRecord);
        const pKey = await jose.importPKCS8(privateKey, eOAuthSigningAlg.RS256);

        const acr = this.handleAcrClaims(authRequest.acr_values);

        const auth_time_src = is_refresh_token_grant ? session.last_token_auth_time : lifeTime.auth_time;

        const auth_time = new Date(auth_time_src).getTime();

        const exp_time = new Date(lifeTime.date_expire).getTime();

        return await new jose.SignJWT({
            nonce,
            auth_time: commonUtils.millisecondsToSeconds(auth_time),
            acr,
            sid: [tenantRecord.id, session.id].join(":"),
            ...(payload || {})
        })
            .setProtectedHeader({ alg: eOAuthSigningAlg.RS256 })
            .setIssuedAt()
            .setIssuer(this.getIssuer(tenantRecord.id))
            .setAudience(tokenRequest.client_id)
            .setExpirationTime(commonUtils.millisecondsToSeconds(exp_time))
            .setSubject(user_id)
            .sign(pKey);
    }
}
