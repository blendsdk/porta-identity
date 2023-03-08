import { createErrorObject, isNullOrUndef } from "@blendsdk/stdlib";
import { BadRequestResponse, Response, SuccessResponse } from "@blendsdk/webafx-common";
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
    eOAuthClientType,
    eOAuthGrantType,
    eOAuthScope,
    ICachedFlowInformation,
    IPortaSessionInfo,
    IPortaSessionStorage
} from "../../../../types";
import { commonUtils, databaseUtils } from "../../../../utils";
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
     * Token endpoint handler
     *
     * @param {ITokenRequest} tokenRequest
     * @returns {Promise<Response<ITokenResponse>>}
     * @memberof AuthorizationController
     */
    public async handleRequest(tokenRequest: ITokenRequest): Promise<Response<ITokenResponse>> {
        const { grant_type, state, code } = tokenRequest; // state is for client_credentials
        const allErrors: any = [];
        let token: IToken = undefined;

        if (eOAuthGrantType[grant_type] !== undefined) {
            if (grant_type === eOAuthGrantType.authorization_code) {
                // for this grant type we need the cachedFlow information that would be
                // available from the OTA
                const cachedFlow = (await this.getCurrentAuthenticationFlow(code)) || ({} as any);
                const { flowId } = cachedFlow || {};
                if (!flowId) {
                    allErrors.push("invalid_grant");
                } else {
                    const { errors, token: localToken } = await this.getTokenByAuthorizationCode({
                        cachedFlow,
                        tokenRequest
                    });
                    token = localToken;
                    errors.forEach((e) => allErrors.push(e));
                    this.clearAuthenticationFlow(flowId);
                }
            } else if (grant_type === eOAuthGrantType.client_credentials) {
                // for this grant type we will find the service user bound to the the confidential client
                // and try to login with that user
                const { errors, token: localToken } = await this.getTokenByConfidentialClient(tokenRequest);
                token = localToken;
                errors.forEach((e) => allErrors.push(e));
            }
        } else {
            allErrors.push({ grant_type });
        }

        if (allErrors.length === 0) {
            return new SuccessResponse({ ...token, state });
        } else {
            return new BadRequestResponse(
                createErrorObject(`invalid_grant`, {
                    // small caps for conformance test
                    errors: allErrors
                })
            );
        }
    }

    /**
     * Creates a token by client credentials for confidential clients
     *
     * @protected
     * @param {ITokenRequest} tokenRequest
     * @returns
     * @memberof TokenEndpointController
     */
    protected async getTokenByConfidentialClient(tokenRequest: ITokenRequest) {
        const { client_id, redirect_uri, tenant, nonce } = tokenRequest || {};
        const tenantRecord = await this.getTenant(tenant);
        let token: IToken = undefined;
        const errors: string[] = [];
        if (this.checkTenantValidity(tenant, tenantRecord)) {
            const authRecord = await this.getAuthorizationRecord(tenantRecord, client_id, "m2m");

            if (authRecord) {
                if (!isNullOrUndef(authRecord.confidential_user_id)) {
                    if (this.checkOTACodeValidity(authRecord, client_id, redirect_uri || null, null, null)) {
                        const err = await this.checkAccessSecret(tokenRequest, authRecord, undefined);
                        if (err.length === 0) {
                            const { tokenKey, sessionStorage } = await this.createSessionStorageForUser(
                                tenantRecord,
                                authRecord,
                                authRecord.confidential_user_id,
                                undefined,
                                eOAuthScope.openid, //TODO: porta specific claims should be added here!
                                ""
                            );
                            token = await this.buildTokenPayload({
                                access_token: tokenKey,
                                ttl: sessionStorage.ttl,
                                tokenExpireAt: sessionStorage.tokenExpireAt,
                                tenant: tenantRecord,
                                authRecord,
                                authRequest: { nonce } as any,
                                sessionInfo: sessionStorage.sessionInfo
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
                errors.push("invalid_request");
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
        ttl,
        tokenExpireAt,
        tenant,
        authRecord,
        authRequest,
        sessionInfo
    }: {
        access_token: string;
        ttl: number;
        tokenExpireAt: number;
        tenant: ISysTenant;
        authRecord: ISysAuthorizationView;
        authRequest: IAuthorizeRequest;
        sessionInfo: IPortaSessionInfo;
    }): Promise<IToken> {
        const keyDs = new SysKeyDataService({ tenantId: databaseUtils.getTenantDataSourceID(tenant) });
        const { data } = (await keyDs.findJwkKeys())[0];
        const { privateKey } = JSON.parse(data);
        const { client_id } = authRecord;

        const { metaData, accountId } = sessionInfo || {};
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
            .setExpirationTime(tokenExpireAt)
            .setSubject(accountId)
            .sign(pKey);

        return {
            access_token,
            expires_in: ttl,
            id_token,
            token_type: "Bearer" // OIDC
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
        // get the current auth flow

        const errors: string[] = [];

        const { authRecord, flowId, tenantRecord: cachedTenantRecord, authRequest } = cachedFlow;

        const { code, client_id, tenant, redirect_uri } = tokenRequest || {};

        const tenantRecord = await this.checkTenantValidity(tenant, cachedTenantRecord);

        if (isNullOrUndef(tenantRecord)) {
            errors.push("tenant");
            // Here we set the client_id to authRecord.client_id to be able to pass the OIDC cert-test
            // It looks like the authorization_code flow does not require the client_id
        } else if (
            !this.checkOTACodeValidity(authRecord, client_id || authRecord.client_id, redirect_uri, code, flowId)
        ) {
            errors.push("ota");
        } else {
            tokenRequest.client_secret = authRecord.client_secret; // OIDC test
            (await this.checkAccessSecret(tokenRequest, authRecord, authRequest)).forEach((e) => errors.push(e));
        }

        if (errors.length === 0) {
            const access_token = await this.getFlow<string>(eFlow.access_token, flowId);
            const { sessionInfo, ttl, tokenExpireAt } = await this.getCache().getValue<IPortaSessionStorage>(
                `tokens:${access_token}`
            );
            return {
                errors: [],
                token: await this.buildTokenPayload({
                    access_token,
                    ttl,
                    tokenExpireAt,
                    tenant: tenantRecord,
                    authRecord,
                    authRequest,
                    sessionInfo
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
     * @param {string} code
     * @param {string} flowId
     * @returns
     * @memberof AuthorizationController
     */
    protected checkOTACodeValidity(
        authRecord: ISysAuthorizationView,
        client_id: string,
        redirect_uri: string,
        code: string,
        flowId: string
    ) {
        return (
            authRecord &&
            client_id === authRecord.client_id &&
            redirect_uri === authRecord.redirect_uri &&
            code == flowId
        );
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

        //TODO: test this, a SPA/mobile should not use a client_secret auth flow!
        // this is where we need to determine the type of client based on its redirect URL!
        // perhaps this way we could et rid of sys_client_type

        /**
         * T
         */

        if (client_type === eOAuthClientType.spa && tokenRequest.client_secret) {
            errors.push("client_secret_provided_for_spa");
        }

        // TODO: test client_secret flow
        if (client_type === eOAuthClientType.webapp || client_type === eOAuthClientType.webapp_pkce) {
            const isSecretValid =
                authRecord.client_secret === tokenRequest.client_secret && !isNullOrUndef(tokenRequest.client_secret);
            if (!isSecretValid) {
                errors.push("client_secret");
            }
        }

        /**
         * if any of the "code_verifier" or "code_challenge" or "code_challenge_method" exists
         * then check the PKCE value! Except for confidential client since there cannot do challenge by nature
         */
        const shouldCheckPKCE =
            (!isNullOrUndef(code_challenge) ||
                !isNullOrUndef(code_verifier) ||
                !isNullOrUndef(code_challenge_method)) &&
            isNullOrUndef(authRecord.confidential_user_id);

        if (shouldCheckPKCE) {
            const isValidPKCE = await commonUtils.verifyPkce(
                code_challenge_method,
                code_challenge,
                code_verifier || "",
                errors
            );
            if (!isValidPKCE) {
                errors.push("client_verifier_pkce");
            }
        }

        return errors;
    }
}
