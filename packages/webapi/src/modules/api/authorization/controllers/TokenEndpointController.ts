import { IDictionaryOf, MD5, isNullOrUndef } from "@blendsdk/stdlib";
import { Response, SuccessResponse } from "@blendsdk/webafx-common";
import { IAuthorizeRequest, ISysAuthorizationView, ISysTenant, ISysUser, IToken, ITokenRequest, ITokenResponse } from "@porta/shared";
import { SysSessionDataService } from "../../../../dataservices/SysSessionDataService";
import { EndpointController, commonUtils, databaseUtils } from "../../../../services";
import { CONST_DAY_IN_SECONDS, IAuthorizationFlow, IPortaApplicationSetting, eClientType, eErrorType, eOAuthGrantType } from "../../../../types";

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
    protected async getFlowByOTACode(code: string, tenantRecord: ISysTenant) {
        const cacheKey = `auth_ota:${code}`;
        const flowId = await this.getCache().getValue<string>(cacheKey);
        // revoke any access token by this code
        await databaseUtils.revokeAccessToken(code, tenantRecord);
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

    /**
     * @protected
     * @param {ITokenRequest} tokenRequest
     * @param {ISysTenant} tenantRecord
     * @return {*} 
     * @memberof TokenEndpointController
     */
    protected async getTokenByRefreshToken(tokenRequest: ITokenRequest, tenantRecord: ISysTenant) {
        const errors: string[] = [];
        const { refresh_token } = tokenRequest;
        let token: IToken = undefined;
        if (!refresh_token) {
            errors.push(eErrorType.invalid_request);
        } else {
            let refresh_token_record = await databaseUtils.findRefreshTokenByTenant({
                tenantRecord,
                refresh_token,
                check_validity: false
            });
            if (!refresh_token_record) {
                errors.push(eErrorType.invalid_request);
            } else if (refresh_token_record && refresh_token_record.is_expired) {
                // delete the access_token and the refresh_token
                await databaseUtils.revokeRefreshToken(tenantRecord, refresh_token_record);
                errors.push("refresh_token_expired");
            } else {

                const { application, session, profile, user, access_token } = refresh_token_record;

                let { client_id, client_secret } = this.getBasicAuthCredentialsFromRequestHeader();

                client_id = client_id || tokenRequest.client_id;
                client_secret = client_secret || tokenRequest.client_secret;

                const isValidSecret = await databaseUtils.validateClientSecret(tenantRecord, client_id, client_secret);
                const authRequest = access_token.auth_request_params as IAuthorizeRequest;

                if (application.client_id === client_id && !isNullOrUndef(client_secret) && isValidSecret) {

                    const authRecord = await databaseUtils.findAuthorizationRecord(authRequest, tenantRecord);

                    // construct a flow 
                    const flow: IAuthorizationFlow = {
                        account_state: true,
                        complete: true,
                        mfa_state: true,
                        session,
                        profile,
                        user,
                        tenantRecord,
                        authRequest,
                        authRecord,
                        mfa_request: undefined,
                        flowId: undefined,
                        expire: undefined
                    };

                    token = await this.createTokens(flow, { ...tokenRequest, client_id });

                } else {
                    errors.push("invalid_bound_client");
                }
            }

        }
        return {
            errors,
            token
        };
    }

    /**
     * @protected
     * @param {IAuthorizationFlow} flow
     * @param {ITokenRequest} tokenRequest
     * @param {ISysTenant} tenantRecord
     * @return {*} 
     * @memberof TokenEndpointController
     */
    protected async getTokenByAuthorizationCode(flow: IAuthorizationFlow, tokenRequest: ITokenRequest, tenantRecord: ISysTenant) {
        const errors: string[] = [];

        // Here we set the client_id to authRequest.client_id to be able to pass the OIDC cert-test
        // It looks like the authorization_code flow does not require the client_id
        tokenRequest.client_id = tokenRequest.client_id ? tokenRequest.client_id : flow.authRequest.client_id;

        this.validateRequest(tokenRequest, flow.authRequest, errors);
        await this.checkAccessSecret(tokenRequest, flow.authRecord, flow.authRequest, tenantRecord, errors);
        const token = errors.length === 0 ? await this.createTokens(flow, tokenRequest) : undefined;
        if (token) {
            await databaseUtils.linkAccessTokenToOTA(token.access_token, tokenRequest.code, tenantRecord);
        }
        return {
            errors,
            token
        };
    }

    /**
     * @protected
     * @param {ISysTenant} tenantRecord
     * @param {ISysUser} user
     * @param {ITokenRequest} credentials
     * @return {*} 
     * @memberof TokenEndpointController
     */
    protected async createOrUpdateClientCredentialsSession(tenantRecord: ISysTenant, user: ISysUser, credentials: ITokenRequest) {
        const sessionDs = new SysSessionDataService({ tenantId: tenantRecord.id });
        const { client_id, client_secret } = credentials;
        const sessionId = MD5([client_id, client_secret, user.id].join(""));

        this.cleanExpiredSessions();

        let sessionRecord = await sessionDs.findSysSessionById({ id: sessionId });

        let date_expire: Date = undefined;

        // Determine the expre_date of this session
        // If the session time is set to 0 then we allow one year as indetinate session length
        let sessionLength = tenantRecord.auth_session_length_hours;
        if (sessionLength === 0) {
            date_expire = new Date(commonUtils.expireSecondsFromNow(CONST_DAY_IN_SECONDS * 365)); // 1 year
        } else {
            date_expire = new Date(commonUtils.expireSecondsFromNow(CONST_DAY_IN_SECONDS * sessionLength));
        }

        if (!sessionRecord) {
            sessionRecord = await sessionDs.insertIntoSysSession({
                user_id: user.id,
                date_expire: date_expire.toISOString()
            });
        } else {
            sessionRecord = await sessionDs.updateSysSessionById({
                date_expire: date_expire.toISOString()
            }, { id: sessionRecord.id });
        }

        return sessionRecord;
    }

    public async getTokenByClientCredentials(
        tokenRequest: ITokenRequest,
        tenantRecord: ISysTenant
    ) {
        const errors: string[] = [];
        let token: IToken;
        const { client_id, client_secret } = tokenRequest;

        const authRecord = await databaseUtils.findAuthorizationRecord({ client_id, redirect_uri: eOAuthGrantType.client_credentials }, tenantRecord);

        if (authRecord) {
            const secretRecord = await databaseUtils.findClientSecretForServiceAccount(tenantRecord, client_id, client_secret);
            const { user, profile } = await databaseUtils.finUserAndProfile(secretRecord.client_credential_user_id, tenantRecord);
            const session = await this.createOrUpdateClientCredentialsSession(tenantRecord, user, tokenRequest);
            if (secretRecord) {
                // construct a flow 
                const flow: IAuthorizationFlow = {
                    account_state: true,
                    complete: true,
                    mfa_state: true,
                    session,
                    profile,
                    user,
                    tenantRecord,
                    authRequest: tokenRequest as any,
                    authRecord,
                    mfa_request: undefined,
                    flowId: undefined,
                    expire: undefined
                };
                token = errors.length === 0 ? await this.createTokens(flow, tokenRequest) : undefined;
            } else {
                errors.push("invalid_secret");
            }
        } else {
            errors.push("invalid_request_auth_record");
        }

        return {
            errors,
            token
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

        const tenantRecord = await commonUtils.getTenantRecord(tenant, this.request);
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
                const flow = await this.getFlowByOTACode(code, tenantRecord);
                if (flow) {
                    const { authRequest } = flow;
                    const { errors, token: localToken } = await this.getTokenByAuthorizationCode(flow, params, tenantRecord);
                    token = localToken;
                    await this.clearAuthenticationFlow(flow.flowId);
                    if (errors.length !== 0) {
                        return this.responseWithError(
                            {
                                error: eErrorType.invalid_grant,
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
                /**
                 * Only when the grant type is client_credentials and we don't have a code
                 *
                 * for this grant type we will find the service user bound to the the confidential client
                 * and try to login with that user
                 */
                const { errors, token: localToken } = await this.getTokenByClientCredentials(params, tenantRecord);
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
                const { errors, token: localToken } = await this.getTokenByRefreshToken(params, tenantRecord);
                token = localToken;
                if (errors.length !== 0) {
                    return this.responseWithError(
                        {
                            error: eErrorType.invalid_grant,
                            error_description: errors[0]
                        },
                        true
                    );
                }
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

    /**
     * @protected
     * @param {IAuthorizationFlow} flow
     * @param {ITokenRequest} tokenRequest
     * @return {*}  {Promise<IToken>}
     * @memberof TokenEndpointController
     */
    protected async createTokens(flow: IAuthorizationFlow, tokenRequest: ITokenRequest): Promise<IToken> {
        const { authRecord, authRequest, tenantRecord, user, session, profile } = flow;
        const { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } = this.getSettings<IPortaApplicationSetting>();
        let { access_token_length, refresh_token_length } = authRecord;
        const scope = tokenRequest.scope || authRequest.scope;

        const { offline_access = false } = commonUtils.parseSeparatedTokens(scope) || {};
        access_token_length = parseFloat((access_token_length || ACCESS_TOKEN_TTL).toString());
        refresh_token_length = parseFloat((refresh_token_length || REFRESH_TOKEN_TTL).toString());

        const { access_token_record, date_expire } = await databaseUtils.newAccessToken({
            client_record_id: authRecord.sys_client_id,
            session,
            tenantRecord,
            ttl: access_token_length,
            user_id: user.id,
            authRequest,
            token_reference: commonUtils.createTokenReference(tokenRequest.client_id, tokenRequest.client_secret, this.request),
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

        let reftesh_token: IDictionaryOf<any> = {};
        if (offline_access) {
            const { refresh_token_record, refreshtoken_date_expire } = await databaseUtils.newRefreshToken({
                accessTokenRecord: access_token_record,
                tenantRecord,
                ttl: refresh_token_length
            });
            reftesh_token = {
                refresh_token: refresh_token_record.refresh_token,
                refresh_token_expires_in: refreshtoken_date_expire.getTime() - Date.now(),
            };
        }

        const id_token = await this.createIDToken({
            accessToken: access_token_record,
            authRequest,
            session,
            tenantRecord,
            tokenRequest,
            user_id: user.id,
            is_refresh_token_grant: tokenRequest.grant_type === eOAuthGrantType.refresh_token
        });

        return {
            access_token: access_token_record.access_token,
            expires_in: date_expire.getTime() - Date.now(),
            token_type: "Bearer",
            id_token,
            ...reftesh_token
        };
    }
}