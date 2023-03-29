import { sha256Hash } from "@blendsdk/crypto";
import { dataSourceManager } from "@blendsdk/datakit";
import { PostgreSQLDataSource } from "@blendsdk/postgresql";
import { apply, isNullOrUndef } from "@blendsdk/stdlib";
import { RedirectResponse, Response } from "@blendsdk/webafx-common";
import { IAuthorizeRequest, IAuthorizeResponse, ISysAuthorizationView, ISysTenant } from "@porta/shared";
import * as jwt from "jsonwebtoken";
import { SysKeyDataService } from "../../../../dataservices/SysKeyDataService";
import {
    eErrorType,
    eOAuthDisplayModes,
    eOAuthPKCECodeChallengeMethod,
    eOAuthPrompt,
    eOAuthResponseMode,
    eOAuthResponseType,
    IAccessToken,
    IPortaApplicationSetting
} from "../../../../types";
import { databaseUtils } from "../../../../utils";
import { eKeySignatureType, expireSecondsFromNow, portaAuthUtils } from "../../../auth/utils";
import { AUTH_FLOW_TTL, NONCE_TTL } from "./constants";
import { eFlow, EndpointController } from "./EndpointControllerBase";
/**
 * Handles the authorize endpoint
 *
 * @export
 * @class AuthorizeEndpointController
 * @extends {EndpointController}
 */
export class AuthorizeEndpointController extends EndpointController {
    /**
     * Handles the incoming request
     *
     * @param {IAuthorizeRequest} _params
     * @returns {Promise<Response<IAuthorizeResponse>>}
     * @memberof AuthorizeEndpointController
     */
    public async handleRequest(authRequest: IAuthorizeRequest): Promise<Response<IAuthorizeResponse>> {
        // normalize to the defaults
        authRequest.response_mode = authRequest.response_mode || eOAuthResponseMode.query;
        authRequest.display = eOAuthDisplayModes[authRequest.display] || eOAuthDisplayModes.page;
        authRequest.prompt = eOAuthPrompt[authRequest.prompt];

        let {
            response_type,
            tenant,
            client_id,
            redirect_uri,
            response_mode,
            request,
            prompt: prompt_type,
            state,
            max_age
        } = authRequest;

        // Apply the request to authRequest
        // It is not clear whether we need to do something with the alg parameter in jwt
        if (request) {
            try {
                const tenantRecord = await databaseUtils.findTenant(tenant);
                if (tenantRecord && tenantRecord.is_active) {
                    await this.initializeTenantDataSource(tenantRecord);
                    const dataSource = dataSourceManager.getDataSource<PostgreSQLDataSource>(tenantRecord.id);
                    const keyDs = new SysKeyDataService({ dataSource });
                    const { data } = (await keyDs.findJwkKeys())[0];
                    const { publicKey } = JSON.parse(data);
                    const payload = jwt.verify(request, publicKey);
                    apply(authRequest, payload, { overwrite: true, mergeArrays: true });
                } else {
                    return this.responseWithError(
                        {
                            error: eErrorType.invalid_request_object,
                            redirect_uri,
                            state,
                            error_description: "invalid_authorization_record",
                            response_mode
                        },
                        true
                    );
                }
            } catch (err: any) {
                return this.responseWithError({
                    error: eErrorType.request_not_supported,
                    redirect_uri,
                    state,
                    error_description: err.message,
                    response_mode
                });
            }
        }

        // parse the response types. The response type can be an array of values!
        const response_types = this.parseResponseType(response_type);
        // check the nonce
        const nonceValid = await this.isValidNonce(authRequest, response_types);

        if (!redirect_uri) {
            // When no redirect URI then we cannot even continue
            return this.responseWithError(
                {
                    error: eErrorType.invalid_request,
                    redirect_uri,
                    state,
                    error_description: "not_redirect_uri",
                    response_mode
                },
                true
            );
        } else if (!this.isValidPKCERequest(authRequest)) {
            return this.responseWithError({
                error: eErrorType.invalid_request,
                redirect_uri,
                state,
                error_description: "invalid_pkce_parameters",
                response_mode
            });
        } else if (!nonceValid) {
            return this.responseWithError({
                error: eErrorType.invalid_request,
                redirect_uri,
                state,
                error_description: "invalid_nonce",
                response_mode
            });
        } else if (!response_type || response_types.length == 0) {
            return this.responseWithError({
                error: eErrorType.invalid_request,
                redirect_uri,
                state,
                error_description: "invalid_response_type",
                response_mode
            });
        } else if (!eOAuthResponseMode[response_mode]) {
            return this.responseWithError({
                error: eErrorType.invalid_request,
                redirect_uri,
                state,
                error_description: "invalid_response_mode",
                response_mode
            });
        } else {
            const { errors, returningAuthorization, flowId, accessTokenStorage } = await this.prepareAuthorization({
                authRequest,
                client_id,
                confidentialClient: false,
                redirect_uri,
                response_types,
                tenant
            });
            if (errors.length === 0) {
                const { PORTA_SIGNIN_URI } = this.context.getSettings<IPortaApplicationSetting>();
                let requireLoginDueMaxAge = false;
                let signinUrl = undefined;

                // here we need to check the prompt parameter and
                if (prompt_type === eOAuthPrompt.none) {
                    signinUrl = this.createFlowUrl("signin");
                } else {
                    if (max_age && returningAuthorization && accessTokenStorage) {
                        const { auth_time } = accessTokenStorage;
                        requireLoginDueMaxAge = Math.trunc(Date.now() / 1000) - auth_time > max_age;
                    }

                    // here we skip the UI flow if we already have a user (currentUser) that is signed in
                    // and the prompt is not explicitly set
                    signinUrl =
                        returningAuthorization && isNullOrUndef(authRequest.prompt) && !requireLoginDueMaxAge
                            ? this.createFlowUrl("signin")
                            : PORTA_SIGNIN_URI || `${this.request.baseUrl}/fe/auth/signin`;
                }

                const params = new URLSearchParams();

                if (!isNullOrUndef(this.request.headers["x-blend-no-browser"])) {
                    params.append("af", flowId);
                }

                if (state) {
                    params.append("state", state);
                }

                signinUrl = [signinUrl, params.toString()].filter(Boolean).join("?");

                return new RedirectResponse({
                    url: signinUrl
                });
            } else {
                await this.clearAuthenticationFlow(flowId);
                await this.clearAuthenticationFlow();

                return this.responseWithError(
                    {
                        error: eErrorType.invalid_request,
                        error_description: errors.join(","),
                        state,
                        redirect_uri,
                        response_mode
                    },
                    true
                );
            }
        }
    }

    /**
     * Prepares the authorization by checking and preparing the auth flow
     *
     * @protected
     * @param {{
     *         tenant: string;
     *         client_id: string;
     *         redirect_uri: string;
     *         response_types: string[];
     *         authRequest: IAuthorizeRequest;
     *         confidentialClient: boolean;
     *     }} {
     *         tenant,
     *         client_id,
     *         redirect_uri,
     *         response_types,
     *         authRequest,
     *         confidentialClient
     *     }
     * @returns
     * @memberof AuthorizationController
     */
    protected async prepareAuthorization({
        tenant,
        client_id,
        redirect_uri,
        response_types,
        authRequest,
        confidentialClient
    }: {
        tenant: string;
        client_id: string;
        redirect_uri: string;
        response_types: string[];
        authRequest: IAuthorizeRequest;
        confidentialClient: boolean;
    }) {
        const tenantRecord = await this.getTenant(tenant);
        const errors: any[] = [];
        let currentUserToken: string = undefined;
        let flowId: string = undefined;

        let accessTokenStorage: IAccessToken = undefined;

        if (tenantRecord && tenantRecord.is_active) {
            // make sure we have a database for this tenant
            await this.initializeTenantDataSource(tenantRecord);
            // check if we have a authorization record using the request combination
            const authRecord = await this.getAuthorizationRecord(tenantRecord, client_id, redirect_uri);
            if (authRecord) {
                // get the current user if possible
                const { token, accessTokenStorage: storage } = await this.getCurrentlyAuthenticatedUserToken(
                    tenantRecord
                );

                // check if the previous token is of the current tenant
                if (token && storage) {
                    currentUserToken = token;
                }

                accessTokenStorage = storage;

                // create a flow (anyway)
                flowId = await this.createAuthenticationFlow(
                    response_types,
                    tenantRecord,
                    authRecord,
                    authRequest,
                    currentUserToken,
                    confidentialClient
                );
            } else {
                errors.push("invalid_authorization_record");
            }
        } else {
            errors.push("invalid_or_inactive_tenant");
        }
        return {
            errors,
            returningAuthorization: currentUserToken !== undefined,
            flowId,
            currentUserToken,
            accessTokenStorage
        };
    }

    /**
     * Creates and saves an authentication flow
     *
     * @protected
     * @param {string[]} response_types
     * @param {ISysTenant} tenantRecord
     * @param {ISysAuthorizationView} authRecord
     * @param {IAuthorizeRequest} authRequest
     * @param {string} currentUserToken
     * @param {boolean} confidentialClient
     * @returns {Promise<string>}
     * @memberof AuthorizeEndpointController
     */
    protected async createAuthenticationFlow(
        response_types: string[],
        tenantRecord: ISysTenant,
        authRecord: ISysAuthorizationView,
        authRequest: IAuthorizeRequest,
        currentUserToken: string,
        confidentialClient: boolean
    ): Promise<string> {
        const flowId = portaAuthUtils.randomSHA256();

        const expire = expireSecondsFromNow(AUTH_FLOW_TTL);
        const expireAt = new Date(expire);

        // create and save an empty state
        await this.setFlow(eFlow.state, flowId, {}, { expire });
        // create and save the flow information
        await this.setFlow(
            eFlow.info,
            flowId,
            {
                response_types,
                tenantRecord,
                authRecord,
                authRequest,
                flowId,
                expire,
                currentUserToken,
                confidentialClient
            },
            { expire }
        );

        if (!confidentialClient) {
            // send the authentication flow cookie
            this.setCookie("_af", flowId, {
                expires: expireAt,
                signed: true,
                secure: this.request.protocol !== "http",
                sameSite: "lax", // only send to this endpoint
                httpOnly: true
            });

            this.setCookie("_at", authRequest.tenant, {
                expires: expireAt,
                sameSite: "lax"
            });

            this.setCookie("_as", expire, {
                expires: expireAt,
                sameSite: "lax"
            });

            // set the ui locale
            if (authRequest.ui_locales) {
                this.setCookie("ui_locales", authRequest.ui_locales, {
                    expires: expireAt,
                    sameSite: "lax"
                });
            }
        }
        return flowId;
    }

    /**
     * Gets the current authenticated user
     *
     * @protected
     * @returns {Promise<string>}
     * @memberof AuthorizeEndpointController
     */
    protected async getCurrentlyAuthenticatedUserToken(
        tenant: ISysTenant
    ): Promise<{ token: string; accessTokenStorage: IAccessToken }> {
        const { PORTA_SSO_COMMON_NAME } = this.getSettings<IPortaApplicationSetting>();
        const accessTokenKeySignature = portaAuthUtils.getKeySignature(
            tenant,
            PORTA_SSO_COMMON_NAME,
            eKeySignatureType.access_token
        );
        // we first get the token from the cookie
        const accessTokenFromCookie = this.getCookie(accessTokenKeySignature, true) || undefined;

        // now we check if this token actually exists and was not revoked before

        let accessTokenRecord = await databaseUtils.findAccessTokenByTenant(tenant.id, accessTokenFromCookie);
        const isValid = accessTokenRecord && !accessTokenRecord.is_expired;

        return {
            token: isValid ? accessTokenFromCookie : undefined,
            accessTokenStorage: isValid ? accessTokenRecord : undefined
        };
    }

    /**
     * Check if the provided PKCE parameters are correct
     *
     * @protected
     * @param {IAuthorizeRequest} authRequest
     * @returns
     * @memberof AuthorizationController
     */
    protected isValidPKCERequest(authRequest: IAuthorizeRequest) {
        const { code_challenge, code_challenge_method } = authRequest || {};

        // if both provided then check for the supported method
        if (code_challenge && code_challenge_method) {
            return eOAuthPKCECodeChallengeMethod[code_challenge_method] !== undefined;
        } else if (!code_challenge && !code_challenge_method) {
            // none is provided then check if the PKCE needs to be enforced!
            const { ENFORCE_PKCE = true } = this.request.context.getSettings<{ ENFORCE_PKCE: boolean }>();
            return !ENFORCE_PKCE;
        } else {
            // only one is provided
            return false;
        }
    }

    /**
     * Check if we have a valid nonce
     *
     * @protected
     * @param {IAuthorizeRequest} authRequest
     * @returns
     * @memberof AuthorizationController
     */
    protected async isValidNonce(authRequest: IAuthorizeRequest, response_types) {
        const { nonce, client_id, redirect_uri } = authRequest;

        // https://bitbucket.org/openid/connect/issues/972/nonce-requirement-in-hybrid-auth-request%20/
        // nonce is not required for response type code
        if (response_types.indexOf(eOAuthResponseType.code) !== -1) {
            return true;
        } else if (isNullOrUndef(nonce)) {
            return false;
        } else {
            const key = `nonce:${await sha256Hash([client_id, redirect_uri, nonce].join("."))}`;
            const result = await this.getCache().getValue(key);
            if (!result) {
                await this.getCache().setValue(key, true, {
                    expire: expireSecondsFromNow(NONCE_TTL)
                });
                return true;
            } else {
                return false;
            }
        }
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
}
