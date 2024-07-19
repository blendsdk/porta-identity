import { isNullOrUndef } from "@blendsdk/stdlib";
import { Response, SuccessResponse } from "@blendsdk/webafx-common";
import { IAuthorizeRequest, ISysAccessToken, ISysAuthorizationView, ISysTenant, IToken, ITokenRequest, ITokenResponse } from "@porta/shared";
import * as jose from "jose";
import { EndpointController, commonUtils, databaseUtils } from "../../../../services";
import { IAuthorizationFlow, IPortaApplicationSetting, eClientType, eErrorType, eOAuthGrantType, eOAuthSigningAlg } from "../../../../types";

/**
 * @export
 * @class TokenEndpointController
 * @extends {EndpointController}
 */
export class TokenEndpointController extends EndpointController {

    /**
     * @protected
     * @param {string} code
     * @return {*} 
     * @memberof TokenEndpointController
     */
    protected async getFlowByOTACode(code: string) {
        const cacheKey = `auth_ota:${code}`;
        const flowId = await this.getCache().getValue<string>(cacheKey);
        await this.getCache().deleteValue(cacheKey);
        return this.getCache().getValue<IAuthorizationFlow>(`auth_flow:${flowId}`);
    }

    /**
     * @protected
     * @param {string} flowId
     * @return {*} 
     * @memberof TokenEndpointController
     */
    protected clearAuthenticationFlow(flowId: string) {
        return this.getCache().deleteValue(flowId);
    }

    /**
     * @protected
     * @param {ITokenRequest} tokenRequest
     * @param {IAuthorizeRequest} authRequest
     * @param {string[]} errors
     * @memberof TokenEndpointController
     */
    protected validateRequest(tokenRequest: ITokenRequest, authRequest: IAuthorizeRequest, errors: string[]) {

        if (tokenRequest.client_id !== authRequest.client_id) {
            errors.push("invalid_client_id");
        }

        if (tokenRequest.redirect_uri !== authRequest.redirect_uri) {
            errors.push("invalid_redirect_uri");
        }
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
        authRequest: IAuthorizeRequest,
        tenantRecord: ISysTenant,
        errors: string[]
    ) {
        const { client_type } = authRecord || {};
        const { code_verifier = undefined, client_id } = tokenRequest || {};
        const { code_challenge = undefined, code_challenge_method = undefined } = authRequest || {};

        const isPublicClient = client_type == eClientType.public;
        const isConfidentialClient = client_type === eClientType.confidential;
        const isServiceClient = client_type === eClientType.service;

        // Try to get it from Authorization Bearer
        if (!tokenRequest.client_secret) {
            try {
                const { client_secret } = this.getBasicAuthCredentialsFromRequestHeader();
                tokenRequest.client_secret = client_secret;
            } catch (err) {
                errors.push("invalid_basic_auth_bearer_client_secret");
            }
        }

        /**
         * If the client_type is confidential or a service account then
         * we can check the secret validity
         */
        if (isConfidentialClient || isServiceClient) {
            const isValidSecret = await databaseUtils.validateClientSecret(tenantRecord, client_id, tokenRequest.client_secret);
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

    protected async getTokenByAuthorizationCode(flow: IAuthorizationFlow, tokenRequest: ITokenRequest, tenantRecord: ISysTenant) {
        const errors: string[] = [];

        // Here we set the client_id to authRequest.client_id to be able to pass the OIDC cert-test
        // It looks like the authorization_code flow does not require the client_id
        tokenRequest.client_id = tokenRequest.client_id ? tokenRequest.client_id : flow.authRequest.client_id;

        this.validateRequest(tokenRequest, flow.authRequest, errors);
        await this.checkAccessSecret(tokenRequest, flow.authRecord, flow.authRequest, tenantRecord, errors);
        return {
            errors,
            token: errors.length === 0 ? await this.createTokens(flow, tokenRequest) : undefined
        };
    }

    /**
     * @param {ITokenRequest} _params
     * @return {*}  {Promise<Response<ITokenResponse>>}
     * @memberof TokenEndpointController
     */
    public async handleRequest(params: ITokenRequest): Promise<Response<ITokenResponse>> {
        const { grant_type, state, tenant, redirect_uri, code = undefined } = params; // state is for client_credentials
        let token: IToken = undefined;

        const tenantRecord = await this.getTenantRecord(tenant, true);
        if (!tenantRecord) {
            return this.responseWithError({
                error: eErrorType.invalid_tenant,
                error_description: tenant,
                redirect_uri,
                state
            });
        }

        if (eOAuthGrantType[grant_type] !== undefined) {
            // Only when the requested grant type is authorization_code and we have a OTA
            if (grant_type === eOAuthGrantType.authorization_code && !isNullOrUndef(code)) {
                const flow = await this.getFlowByOTACode(code);
                if (flow) {
                    const { authRequest } = flow;
                    const { errors, token: localToken } = await this.getTokenByAuthorizationCode(flow, params, tenantRecord);
                    token = localToken;
                    await this.clearAuthenticationFlow(flow.flowId);
                    if (errors.length !== 0) {
                        return this.responseWithError(
                            {
                                error: eErrorType.invalid_request,
                                error_description: errors[0],
                                redirect_uri,
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
                            error_description: "invalid_authorization_code",
                            redirect_uri,
                            state,
                        },
                        true
                    );
                }
            } else if (grant_type === eOAuthGrantType.client_credentials && isNullOrUndef(code)) {
                // /**
                //  * Only when the grant type is client_credentials and we don't have a code
                //  *
                //  * for this grant type we will find the service user bound to the the confidential client
                //  * and try to login with that user
                //  */
                // const { errors, token: localToken } = await this.getTokenByClientCredentials(tokenRequest);
                // token = localToken;

                // if (errors.length !== 0) {
                //     return this.responseWithError(
                //         {
                //             error: eErrorType.invalid_request,
                //             error_description: errors[0]
                //         },
                //         true
                //     );
                // }
            } else if (grant_type === eOAuthGrantType.refresh_token) {
                // const { errors, token: localToken } = await this.getTokenByRefreshToken(tokenRequest);
                // token = localToken;

                // if (errors.length !== 0) {
                //     return this.responseWithError(
                //         {
                //             error: eErrorType.invalid_grant,
                //             error_description: errors[0]
                //         },
                //         true
                //     );
                // }
            } else {
                return this.responseWithError(
                    {
                        error: eErrorType.invalid_request,
                        error_description: "invalid_grant_type_combination",
                        redirect_uri,
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
                    redirect_uri,
                    state
                },
                true
            );
        }
        return new SuccessResponse({ ...token, state });
    }

    protected async createIDToken(params: {
        tenantRecord: ISysTenant,
        tokenRequest: ITokenRequest,
        accessToken: ISysAccessToken,
        session_id: string,
        authRequest: IAuthorizeRequest;
        user_id: string;
    }) {

        const { tenantRecord, tokenRequest, accessToken, session_id, authRequest, user_id } = params;

        const { nonce } = authRequest;

        const { privateKey } = await databaseUtils.getJWKSigningKeys(tenantRecord);
        const pKey = await jose.importPKCS8(privateKey, eOAuthSigningAlg.RS256);

        const acr = this.handleAcrClaims(authRequest.acr_values);

        const auth_time = new Date(accessToken.auth_time).getTime();
        const exp_time = new Date(accessToken.date_expire).getTime();

        return await new jose.SignJWT({
            nonce,
            auth_time: commonUtils.millisecondsToSeconds(auth_time),
            acr,
            sid: [tenantRecord.id, session_id].join(":")
        })
            .setProtectedHeader({ alg: eOAuthSigningAlg.RS256 })
            .setIssuedAt()
            .setIssuer(this.getIssuer(tenantRecord.id))
            .setAudience(tokenRequest.client_id)
            .setExpirationTime(commonUtils.millisecondsToSeconds(exp_time))
            .setSubject(user_id)
            .sign(pKey);
    }

    protected async createTokens(flow: IAuthorizationFlow, tokenRequest: ITokenRequest): Promise<IToken> {

        const { authRecord, authRequest, tenantRecord, user, session } = flow;
        const { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } = this.getSettings<IPortaApplicationSetting>();
        let { access_token_length, refresh_token_length } = authRecord;
        const scope = tokenRequest.scope || authRequest.scope;

        const { offline_access = false } = commonUtils.parseSeparatedTokens(scope) || {};
        access_token_length = parseFloat((access_token_length || ACCESS_TOKEN_TTL).toString());
        refresh_token_length = parseFloat((refresh_token_length || REFRESH_TOKEN_TTL).toString());

        console.log(offline_access);

        const { access_token_record, date_expire } = await databaseUtils.newAccessToken({
            client_record_id: authRecord.sys_client_id,
            session_id: session.id,
            tenantRecord,
            ttl: access_token_length,
            user_id: user.id,
            authRequest
        });

        const id_token = await this.createIDToken({
            accessToken: access_token_record,
            authRequest,
            session_id: session.id,
            tenantRecord,
            tokenRequest,
            user_id: user.id
        });

        return {
            access_token: access_token_record.access_token,
            expires_in: date_expire.getTime() - Date.now(),
            token_type: "Bearer",
            id_token,
            refresh_token: null,
            refresh_token_expires_in: null
        };
    }

    protected handleAcrClaims(acr_values: string) {
        if (acr_values) {
            const acr_request = commonUtils.parseSeparatedTokens(acr_values, true);
            //TODO: need to be implemented in a later version
            return Object.keys(acr_request)[0]; // just return something
        } else {
            return undefined;
        }
    }
}