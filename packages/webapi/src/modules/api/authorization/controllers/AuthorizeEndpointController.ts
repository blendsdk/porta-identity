import { generateRandomUUID, sha256Hash } from "@blendsdk/crypto";
import { isNullOrUndef } from "@blendsdk/stdlib";
import { RedirectResponse, Response } from "@blendsdk/webafx-common";
import { COOKIE_AUTH_FLOW, COOKIE_AUTH_FLOW_TTL, COOKIE_TENANT, IAuthorizeRequest, IAuthorizeResponse, ISysAuthorizationView, ISysProfile, ISysSession, ISysTenant, ISysUser } from "@porta/shared";
import * as jose from "jose";
import { SysProfileDataService } from "../../../../dataservices/SysProfileDataService";
import { SysSessionDataService } from "../../../../dataservices/SysSessionDataService";
import { SysUserDataService } from "../../../../dataservices/SysUserDataService";
import { EndpointController, commonUtils, databaseUtils } from "../../../../services";
import { CONST_AUTH_FLOW_TTL, CONST_NONCE_TTL, IAuthorizationFlow, IPortaApplicationSetting, eErrorType, eOAuthDisplayModes, eOAuthPKCECodeChallengeMethod, eOAuthPrompt, eOAuthResponseMode, eOAuthResponseType, eOAuthSigningAlg } from "../../../../types";


/**
 * Handler for the authorize endpoint
 *
 * @export
 * @class AuthorizeEndpointController
 * @extends {EndpointController}
 */
export class AuthorizeEndpointController extends EndpointController {
    /**
     * @param {IAuthorizeRequest} authRequest
     * @return {*}  {Promise<Response<IAuthorizeResponse>>}
     * @memberof AuthorizeEndpointController
     */
    public async handleRequest(authRequest: IAuthorizeRequest): Promise<Response<IAuthorizeResponse>> {

        // normalize to the defaults
        authRequest.response_mode = authRequest.response_mode || eOAuthResponseMode.query;
        authRequest.display = eOAuthDisplayModes[authRequest.display] || eOAuthDisplayModes.page;
        authRequest.prompt = eOAuthPrompt[authRequest.prompt];

        const { tenant, redirect_uri, response_mode, state, prompt, response_type } = authRequest;

        const tenantRecord = await commonUtils.getTenantRecord(tenant, this.request);

        if (!tenantRecord) {
            return this.responseWithError({
                error: eErrorType.invalid_tenant,
                error_description: tenant,
                redirect_uri,
                response_mode,
                state
            });
        }

        const validationResult = await this.validateAuthorizationRequest(authRequest, tenantRecord);
        if (!isNullOrUndef(validationResult)) {
            // something is wrong with the request
            return validationResult;
        } else {
            const { errors, flowId, flowComplete } = await this.prepareAuthorization(authRequest, tenantRecord);

            let invalidPromptRequest = prompt === eOAuthPrompt.none && !flowComplete;

            // OIDC Conformance test rule!
            if (invalidPromptRequest) {
                errors.push("prompt_none_when_flow_not_complete");
            }

            if (errors.length === 0 && flowId) {
                let signinUrl: string = undefined;
                if (prompt === eOAuthPrompt.login) {
                    const flow = await this.getAuthenticationFlow(flowId);
                    await this.updateFlow({ ...flow, complete: false, account_state: false });
                }
                signinUrl = this.createFrontendSignInUrl(authRequest);
                return new RedirectResponse({ url: signinUrl });
            } else {
                return this.responseWithError(
                    {
                        error: invalidPromptRequest ? eErrorType.login_required : eErrorType.invalid_request,
                        error_description: errors.join(","),
                        state,
                        redirect_uri,
                        response_mode,
                        response_type
                    },
                    errors.findIndex(i => (i === eErrorType.invalid_authorization)) !== -1
                );
            }
        }
    }

    /**
     * @protected
     * @param {string} flowId
     * @param {IAuthorizeRequest} authRequest
     * @return {*} 
     * @memberof AuthorizeEndpointController
     */
    protected createFrontendSignInUrl(authRequest: IAuthorizeRequest) {
        let signinURL = `${this.getServerURL()}/fe/auth/signin`;
        const url = new URL(signinURL);

        url.searchParams.append("display", authRequest.display);

        if (authRequest.ui_locales) {
            url.searchParams.append("ui_locals", authRequest.ui_locales);
        }
        return url.toString();
    }

    /**
     * @protected
     * @param {IAuthorizeRequest} authRequest
     * @param {ISysTenant} tenantRecord
     * @return {*} 
     * @memberof AuthorizeEndpointController
     */
    protected async prepareAuthorization(authRequest: IAuthorizeRequest, tenantRecord: ISysTenant) {

        // Find the auth record based on the auth request from the database
        const authRecord = await databaseUtils.findAuthorizationRecord(authRequest, tenantRecord);

        const errors: string[] = [];

        let flow: { flowId: string, flowComplete: boolean; } = undefined;

        if (authRecord) { // authRecord must only return one record, otherwise somehow multiple records with the same client_id/secret where found!
            flow = await this.createAuthorizationFlow(authRecord, authRequest, tenantRecord);
        } else {
            errors.push(eErrorType.invalid_authorization);
        }
        return { errors, ...flow };
    }

    /**
     * @protected
     * @param {ISysTenant} tenantRecord
     * @return {*} 
     * @memberof AuthorizeEndpointController
     */
    protected async getReturningUser(tenantRecord: ISysTenant, authRequest: IAuthorizeRequest) {
        const sessionDS = new SysSessionDataService({ tenantId: tenantRecord.id });
        const userDs = new SysUserDataService({ tenantId: tenantRecord.id });
        const profileDs = new SysProfileDataService({ tenantId: tenantRecord.id });
        let user: ISysUser = undefined;
        let profile: ISysProfile = undefined;
        let session: ISysSession = undefined;
        let currentSessionId: string = undefined;

        // Get the current session id from the id_token_hint if possible
        if (authRequest.id_token_hint) {
            const [, sessionId] = authRequest.id_token_hint.split(":");
            currentSessionId = sessionId;
        } else {
            const cookieId = commonUtils.createSessionCookieID(tenantRecord, this.request);
            currentSessionId = this.getCookie(cookieId);
        }

        if (currentSessionId) {
            session = await sessionDS.findSysSessionById({ id: currentSessionId });
            if (session) {
                user = await userDs.findSysUserById({ id: session.user_id });
                profile = await profileDs.findProfileByUserId({ user_id: user.id });
            }
        }

        return { user, profile, session };
    }

    /**
     * @protected
     * @param {ISysAuthorizationView} authRecord
     * @param {IAuthorizeRequest} authRequest
     * @return {*} 
     * @memberof AuthorizeEndpointController
     */
    protected async createAuthorizationFlow(authRecord: ISysAuthorizationView, authRequest: IAuthorizeRequest, tenantRecord: ISysTenant) {
        const flowId = generateRandomUUID();
        const expire = commonUtils.expireSecondsFromNow(CONST_AUTH_FLOW_TTL);

        const { user, profile, session } = await this.getReturningUser(tenantRecord, authRequest);
        const authenticated = !isNullOrUndef(session) && !isNullOrUndef(user) && !isNullOrUndef(profile);
        const login_required = session ? commonUtils.checkLoginRequired(session, authRequest.max_age) : true;
        const complete = authenticated ? login_required ? false : authenticated : authenticated;

        let mfa_state = complete ? true : !isNullOrUndef(authRecord.mfa) ? false : true; // check if we have an MFA record bound to this client

        await this.getCache().setValue<IAuthorizationFlow>(
            `auth_flow:${flowId}`,
            {
                complete,
                authRecord,
                authRequest,
                flowId,
                expire,
                account_state: complete,
                mfa_state,
                mfa_request: undefined,
                profile,
                user,
                tenantRecord,
                session
            },
            {
                expire
            }
        );
        this.setCookie(COOKIE_AUTH_FLOW, flowId, {
            expires: new Date(expire),
            secure: true,
            httpOnly: true,
            sameSite: "strict"
        });

        this.setCookie(COOKIE_TENANT, tenantRecord.id, {
            expires: new Date(expire),
            secure: true,
            httpOnly: true,
            sameSite: "strict",
        });

        this.setCookie(COOKIE_AUTH_FLOW_TTL, generateRandomUUID(), {
            expires: new Date(expire),
            secure: true,
            sameSite: "strict",
        });

        return { flowId, flowComplete: complete };
    }

    /**
     * @protected
     * @param {string} id_token_hint
     * @param {ISysTenant} tenantRecord
     * @param {IAuthorizeRequest} authRequest
     * @return {*} 
     * @memberof AuthorizeEndpointController
     */
    protected async isValidIDTokenHint(id_token_hint: string, tenantRecord: ISysTenant, authRequest: IAuthorizeRequest) {
        let is_valid: boolean = true;
        if (id_token_hint) {
            const { privateKey } = await databaseUtils.getJWKSigningKeys(tenantRecord);
            const pKey = await jose.importPKCS8(privateKey, eOAuthSigningAlg.RS256);

            try {
                const { payload } = await jose.jwtVerify(id_token_hint, pKey, {
                    issuer: this.getIssuer(tenantRecord.id),
                    audience: authRequest.client_id
                });
                is_valid = true;
                const { sid } = payload as any;
                authRequest.id_token_hint = sid;
            } catch (err) {
                this.getLogger().error("isValidIDTokenHint", { id_token_hint });
                return is_valid = false;
            }
        }
        return is_valid;
    }

    /**
     * @protected
     * @param {IAuthorizeRequest} authRequest
     * @return {*} 
     * @memberof AuthorizeEndpointController
     */
    protected async validateAuthorizationRequest(authRequest: IAuthorizeRequest, tenantRecord: ISysTenant) {
        let { response_type, redirect_uri, state, response_mode, id_token_hint } = authRequest || {};

        // check the nonce
        const isNonceValid = await this.isValidNonce(authRequest, response_type);
        if (!redirect_uri) {
            // When no redirect URI then we cannot even continue
            return this.responseWithError(
                {
                    error: eErrorType.invalid_request,
                    redirect_uri,
                    state,
                    error_description: "no_redirect_uri",
                    response_mode,
                    response_type
                }
            );
        } else if (!this.isValidPKCERequest(authRequest)) {
            return this.responseWithError({
                error: eErrorType.invalid_request,
                redirect_uri,
                state,
                error_description: "invalid_pkce_parameters",
                response_mode,
                response_type
            });
        } else if (!isNonceValid) {
            return this.responseWithError({
                error: eErrorType.invalid_request,
                redirect_uri,
                state,
                error_description: "invalid_nonce",
                response_mode,
                response_type
            });
        } else if (!eOAuthResponseType[response_type.replace(/\ /g, "_")]) {
            return this.responseWithError({
                error: eErrorType.invalid_request,
                redirect_uri,
                state,
                error_description: "invalid_response_type",
                response_mode,
                response_type
            });
        } else if (!eOAuthResponseMode[response_mode]) {
            return this.responseWithError({
                error: eErrorType.invalid_request,
                redirect_uri,
                state,
                error_description: "invalid_response_mode",
                response_mode,
                response_type
            });
        } else if (!await this.isValidIDTokenHint(id_token_hint, tenantRecord, authRequest)) {
            return this.responseWithError({
                error: eErrorType.invalid_request,
                redirect_uri,
                state,
                error_description: "invalid_id_token_hint",
                response_mode,
                response_type
            });
        } else {
            return null;
        }
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
            const { ENFORCE_PKCE = true } = this.request.context.getSettings<IPortaApplicationSetting>();
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
    protected async isValidNonce(authRequest: IAuthorizeRequest, response_type: string) {
        const { nonce, client_id, redirect_uri } = authRequest;

        // https://bitbucket.org/openid/connect/issues/972/nonce-requirement-in-hybrid-auth-request%20/
        // nonce is not required for response type code

        const skipNonceCheck = [
            eOAuthResponseType.code,
            eOAuthResponseType.code_token,
            eOAuthResponseType.token
        ].indexOf(response_type as any) !== -1;

        if (skipNonceCheck) {
            return true;
        } else if (isNullOrUndef(nonce)) {
            return false;
        } else {
            const key = `nonce:${await sha256Hash([client_id, redirect_uri, nonce].join("."))}`;
            const result = await this.getCache().getValue(key);
            if (!result) {
                await this.getCache().setValue(key, true, {
                    expire: commonUtils.expireSecondsFromNow(CONST_NONCE_TTL)
                });
                return true;
            } else {
                return false;
            }
        }
    }
}
