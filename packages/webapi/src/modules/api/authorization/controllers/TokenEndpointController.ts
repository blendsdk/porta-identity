import { isNullOrUndef } from "@blendsdk/stdlib";
import { Response, SuccessResponse } from "@blendsdk/webafx-common";
import {
    IAuthorizeRequest,
    ISysAuthorizationView,
    ISysTenant,
    IToken,
    ITokenRequest,
    ITokenResponse
} from "@porta/shared";
import * as jose from "jose";
import { SysKeyDataService } from "../../../../dataservices/SysKeyDataService";
import {
    eClientType,
    eErrorType,
    eOAuthGrantType,
    eOAuthScope,
    ICachedFlowInformation,
    IOTACache,
    IPortaSessionStorage
} from "../../../../types";
import { commonUtils, databaseUtils } from "../../../../utils";
import { portaAuthUtils } from "../../../auth/utils";
import { eFlow, EndpointController } from "./EndpointControllerBase";

/**
 * Handles the token endpoint
 *
 * @export
 * @class TokenEndpointController
 * @extends {EndpointController}
 */
export class TokenEndpointController extends EndpointController {
    /**
     * Links the access token to the OTA
     * so we can revoke it later of the OTA is used more than once
     *
     * @protected
     * @param {string} ota
     * @param {string} access_token
     * @memberof TokenEndpointController
     */
    protected async linkOtaToAccessToken(ota: string, access_token: string) {
        const otaKey = `ota:${ota}`;
        let { flowId, used, tenantRecord } = await this.getCache().getValue<IOTACache>(otaKey);
        await this.getCache().setValue<IOTACache>(otaKey, {
            flowId,
            used,
            tokenRef: access_token,
            tenantRecord
        });
    }

    /**
     * Gets the floeID by OTA code
     *
     * @protected
     * @param {string} ota
     * @returns
     * @memberof TokenEndpointController
     */
    protected async getFlowIdByOTACode(ota: string): Promise<string> {
        const otaKey = `ota:${ota}`;
        let {
            flowId = undefined,
            used = undefined,
            tokenRef = undefined,
            tenantRecord = undefined
        } = (await this.getCache().getValue<IOTACache>(otaKey)) || {};
        try {
            if (flowId && used === false) {
                /**
                 * Mark as used. This is needed to pass RFC6749-4.1.2
                 * We also will need the tenant in order to revoke the access_token, should this ota be called
                 * The second time
                 */
                const { tenantRecord } = await this.getFlow<ICachedFlowInformation>(eFlow.info, flowId);
                await this.getCache().setValue<IOTACache>(otaKey, { flowId, used: true, tokenRef, tenantRecord });
            }

            // is not allowed to use the second time
            if (flowId && used === true && tenantRecord) {
                await this.revokeAccessToken(tenantRecord, tokenRef);
                await this.clearAuthenticationFlow(flowId);
                await this.getCache().deleteValue(otaKey);
                flowId = undefined;
            }
        } catch (err) {
            await this.getLogger().warn("Trying to remove non-existing OTA", { ota });
        }

        return flowId || undefined;
    }

    /**
     * Token endpoint handler
     *
     * @param {ITokenRequest} tokenRequest
     * @returns {Promise<Response<ITokenResponse>>}
     * @memberof AuthorizationController
     */
    public async handleRequest(tokenRequest: ITokenRequest): Promise<Response<ITokenResponse>> {
        const { grant_type, state, code = undefined } = tokenRequest; // state is for client_credentials
        let token: IToken = undefined;

        if (eOAuthGrantType[grant_type] !== undefined) {
            // Only when the requested grant type is authorization_code and we have a OTA
            if (grant_type === eOAuthGrantType.authorization_code && !isNullOrUndef(code)) {
                // for this grant type we need the cachedFlow information that would be
                // available from the OTA
                const flowIdByOTA = await this.getFlowIdByOTACode(code);

                // Pass a random time to the flowIdByOTA that does not exist
                // This way the getCurrentAuthenticationFlow will no default
                // to looking a flowId by _af

                const cachedFlow =
                    (await this.getCurrentAuthenticationFlow(flowIdByOTA || Date.now().toString())) ||
                    ({} as any as ICachedFlowInformation);

                const { flowId = undefined, authRequest } = cachedFlow;

                if (flowId) {
                    const { errors, token: localToken } = await this.getTokenByAuthorizationCode({
                        cachedFlow,
                        tokenRequest
                    });
                    token = localToken;

                    // link only if we have an access token
                    if (localToken && localToken.access_token) {
                        await this.linkOtaToAccessToken(code, localToken.access_token);
                    }

                    await this.clearAuthenticationFlow(flowId);

                    if (errors.length !== 0) {
                        return this.responseWithError(
                            {
                                error: eErrorType.invalid_request,
                                error_description: errors[0],
                                redirect_uri: authRequest?.redirect_uri,
                                response_mode: authRequest?.response_mode,
                                state
                            },
                            true
                        );
                    }
                } else {
                    return this.responseWithError(
                        {
                            error: eErrorType.invalid_grant,
                            error_description: "invalid_authorization_code"
                        },
                        true
                    );
                }
            } else if (grant_type === eOAuthGrantType.client_credentials && isNullOrUndef(code)) {
                /**
                 * Only when the grant type is client_credentials and we don't have a code
                 *
                 * for this grant type we will find the service user bound to the the confidential client
                 * and try to login with that user
                 */
                const { errors, token: localToken } = await this.getTokenByClientCredentials(tokenRequest);
                token = localToken;

                if (errors.length !== 0) {
                    return this.responseWithError(
                        {
                            error: eErrorType.invalid_request,
                            error_description: errors[0]
                        },
                        true
                    );
                }
            } else if (grant_type === eOAuthGrantType.refresh_token) {
            } else {
                return this.responseWithError(
                    {
                        error: eErrorType.invalid_request,
                        error_description: "invalid_grant_type_combination",
                        state
                    },
                    true
                );
            }
        } else {
            return this.responseWithError(
                {
                    error: eErrorType.invalid_grant,
                    error_description: grant_type,
                    state
                },
                true
            );
        }

        return new SuccessResponse({ ...token, state });
    }

    /**
     * Creates a token by client credentials for confidential clients
     *
     * @protected
     * @param {ITokenRequest} tokenRequest
     * @returns
     * @memberof TokenEndpointController
     */
    protected async getTokenByClientCredentials(tokenRequest: ITokenRequest) {
        const { client_id, tenant, nonce } = tokenRequest || {};
        const tenantRecord = await this.getTenant(tenant);
        let token: IToken = undefined;
        const errors: string[] = [];
        if (this.checkTenantValidity(tenant, tenantRecord)) {
            const authRecord = await this.getAuthorizationRecord(
                tenantRecord,
                client_id,
                eOAuthGrantType.client_credentials
            );

            if (authRecord) {
                if (!isNullOrUndef(authRecord.client_credentials_user_id)) {
                    /**
                     * The redirect_uri should already be null from the
                     * database query `getAuthorizationRecord`
                     */
                    if (this.checkOTACodeValidity(authRecord, client_id, /* redirect_uri -->*/ null)) {
                        const err = await this.checkAccessSecret(tokenRequest, authRecord, undefined);
                        if (err.length === 0) {
                            const { accessToken, sessionStorage } = await this.createSessionStorageForUser(
                                tenantRecord,
                                authRecord,
                                authRecord.client_credentials_user_id,
                                undefined,
                                eOAuthScope.openid, //TODO: porta specific claims should be added here!
                                ""
                            );
                            token = await this.buildTokenPayload({
                                access_token: accessToken,
                                tenant: tenantRecord,
                                authRecord,
                                authRequest: { nonce } as any,
                                sessionStorage
                            });
                        } else {
                            err.forEach((e) => errors.push(e));
                        }
                    } else {
                        errors.push("invalid_client");
                    }
                } else {
                    errors.push("not_a_confidential_client");
                }
            } else {
                errors.push("invalid_request!!");
            }
        } else {
            errors.push("invalid_tenant");
        }
        return { token, errors };
    }

    /**
     * Handles the ACR values
     *
     * @protected
     * @param {string} acr_values
     * @returns
     * @memberof TokenEndpointController
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
     * Build an a token payload
     *
     * @protected
     * @param {{
     *         access_token: string;
     *         ttl: number;
     *         client_type: string;
     *         tenant: ISysTenant;
     *         authRecord: ISysAuthorizationView;
     *         authRequest: IAuthorizeRequest;
     *         sessionInfo: IPortaSessionInfo;
     *     }} {
     *         access_token,
     *         ttl,
     *         client_type,
     *         tenant,
     *         authRecord,
     *         authRequest,
     *         sessionInfo
     *     }
     * @returns {Promise<IToken>}
     * @memberof TokenEndpointController
     */
    protected async buildTokenPayload({
        access_token,
        tenant,
        authRecord,
        authRequest,
        sessionStorage
    }: {
        access_token: string;
        tenant: ISysTenant;
        authRecord: ISysAuthorizationView;
        authRequest: IAuthorizeRequest;
        sessionStorage: IPortaSessionStorage;
    }): Promise<IToken> {
        const keyDs = new SysKeyDataService({ tenantId: databaseUtils.getTenantDataSourceID(tenant) });
        const { data } = (await keyDs.findJwkKeys())[0];
        const { privateKey } = JSON.parse(data);
        const { client_id } = authRecord;

        const { metaData, user, accessTokenExpireAt, refresh_token, refreshTokenTTL, accessTokenTTL } =
            sessionStorage || {};
        const { auth_time, roles, permissions } = metaData || {};

        const pKey = await jose.importPKCS8(privateKey, "RS256");

        const { nonce, state } = authRequest || {};

        const auth_time_calculated = parseInt((auth_time / 1000) as any);

        const acr = this.handleAcrClaims(authRequest.acr_values);

        const id_token = await new jose.SignJWT({
            "urn:acl:roles": roles
                .filter((r) => {
                    return r.is_active === true;
                })
                .map((r) => {
                    return {
                        role_id: r.id,
                        role: r.name
                    };
                }),
            "urn:acl:permissions": permissions
                .filter((r) => {
                    return r.is_active === true;
                })
                .map((r) => {
                    return {
                        permission_id: r.permission_id,
                        permission: r.code
                    };
                }),
            nonce,
            state,
            auth_time: auth_time_calculated,
            acr
        })
            .setProtectedHeader({ alg: "RS256" })
            .setIssuedAt()
            .setIssuer(this.getIssuer(tenant.name))
            .setAudience(client_id)
            .setExpirationTime(accessTokenExpireAt)
            .setSubject(user.id)
            .sign(pKey);

        return {
            access_token,
            expires_in: accessTokenTTL,
            id_token,
            token_type: "Bearer", // OIDC
            refresh_token,
            refresh_token_expires_in: refreshTokenTTL
        };
    }

    /**
     * Get the token by client authorization_code and
     * optionally build an ID_TOKEN
     *
     * @protected
     * @param {{
     *         tenant: string;
     *         code: string;
     *         client_id: string;
     *         redirect_uri: string;
     *         cachedFlow: ICachedFlowInformation;
     *         tokenRequest: ITokenRequest;
     *     }} {
     *         tenant,
     *         code,
     *         client_id,
     *         redirect_uri,
     *         cachedFlow,
     *         tokenRequest
     *     }
     * @returns {Promise<{ token: IToken; errors: any[] }>}
     * @memberof TokenEndpointController
     */
    protected async getTokenByAuthorizationCode({
        cachedFlow,
        tokenRequest
    }: {
        cachedFlow: ICachedFlowInformation;
        tokenRequest: ITokenRequest;
    }): Promise<{ token: IToken; errors: any[] }> {
        const errors: string[] = [];

        const { authRecord, flowId, tenantRecord: cachedTenantRecord, authRequest } = cachedFlow;

        const { client_id, tenant, redirect_uri } = tokenRequest || {};

        const tenantRecord = await this.checkTenantValidity(tenant, cachedTenantRecord);

        if (isNullOrUndef(tenantRecord)) {
            errors.push("tenant");
            // Here we set the client_id to authRecord.client_id to be able to pass the OIDC cert-test
            // It looks like the authorization_code flow does not require the client_id
        } else if (!this.checkOTACodeValidity(authRecord, client_id || authRecord.client_id, redirect_uri)) {
            errors.push("ota");
        } else {
            if (process.env.BYPASS) {
                tokenRequest.client_secret = authRecord.secret; // OIDC test
            }
            (await this.checkAccessSecret(tokenRequest, authRecord, authRequest)).forEach((e) => errors.push(e));
        }

        if (errors.length === 0) {
            const access_token = await this.getFlow<string>(eFlow.access_token, flowId);
            const cacheKey = portaAuthUtils.getAccessTokenCacheKey(tenantRecord.name, access_token);
            const sessionStorage = await this.getCache().getValue<IPortaSessionStorage>(cacheKey);

            return {
                errors: [],
                token: await this.buildTokenPayload({
                    access_token,
                    tenant: tenantRecord,
                    authRecord,
                    authRequest,
                    sessionStorage
                })
            };
        } else {
            return {
                errors,
                token: undefined
            };
        }
    }

    /**
     * Check if the provided OTA code is valid
     *
     * @protected
     * @param {ISysAuthorizationView} authRecord
     * @param {string} client_id
     * @param {string} redirect_uri
     * @returns
     * @memberof TokenEndpointController
     */
    protected checkOTACodeValidity(authRecord: ISysAuthorizationView, client_id: string, redirect_uri: string) {
        return authRecord && client_id === authRecord.client_id && redirect_uri === authRecord.redirect_uri;
    }

    /**
     * Checks if a given tenant is valid
     *
     * @protected
     * @param {string} tenant
     * @param {ISysTenant} cachedTenantRecord
     * @returns {Promise<ISysTenant>}
     * @memberof AuthorizationController
     */
    protected async checkTenantValidity(tenant: string, cachedTenantRecord: ISysTenant): Promise<ISysTenant> {
        const tenantRecord = await this.getTenant(tenant);
        return cachedTenantRecord && tenantRecord && tenantRecord.is_active && cachedTenantRecord.id === tenantRecord.id
            ? tenantRecord
            : undefined;
    }

    /**
     * Check the client_secret or the pkce
     *
     * @protected
     * @param {ITokenRequest} tokenRequest
     * @param {ISysAuthorizationView} authRecord
     * @param {IAuthorizeRequest} authRequest
     * @returns
     * @memberof AuthorizationController
     */
    protected async checkAccessSecret(
        tokenRequest: ITokenRequest,
        authRecord: ISysAuthorizationView,
        authRequest: IAuthorizeRequest
    ) {
        const { client_type } = authRecord || {};
        const { code_verifier = undefined } = tokenRequest || {};
        const { code_challenge = undefined, code_challenge_method = undefined } = authRequest || {};
        const errors: string[] = [];

        const isPublicClient = client_type == eClientType.public;
        const isConfidentialClient = client_type === eClientType.confidential;
        const isServiceClient = client_type === eClientType.service;

        /**
         * If the client_type is confidential or a service account then
         * we can check the secret validity
         */
        if (isConfidentialClient || isServiceClient) {
            const isValidSecret =
                authRecord.secret == tokenRequest.client_secret && !isNullOrUndef(tokenRequest.client_secret);

            if (!isValidSecret) {
                errors.push("invalid_client_secret");
            }
        }

        /**
         * Check for the PKCE for public and confidential clients
         */
        if (isConfidentialClient || isPublicClient) {
            const has_pkce = !isNullOrUndef(code_challenge || code_verifier || code_challenge_method);
            /**
             * Check if a PKCE is provided.
             * This check is for bypassing FORCE_PKCE for OIDC tests and development only
             * when the client is NOT public
             *
             */
            if (has_pkce || isPublicClient) {
                const isValidPKCE = await commonUtils.verifyPkce(
                    code_challenge_method,
                    code_challenge,
                    code_verifier || "",
                    errors
                );
                if (!isValidPKCE) {
                    errors.push("invalid_pkce_combination");
                }
            }
        }

        /**
         * Public client with a client_secret is not acceptable!
         */
        if (isPublicClient && !isNullOrUndef(tokenRequest.client_secret)) {
            errors.push("public_client_provided_client_secret");
        }

        return errors;
    }
}
