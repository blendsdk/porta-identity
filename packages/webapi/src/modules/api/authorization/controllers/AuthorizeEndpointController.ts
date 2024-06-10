import { generateRandomUUID, sha256Hash } from "@blendsdk/crypto";
import { expression } from "@blendsdk/expression";
import { isNullOrUndef } from "@blendsdk/stdlib";
import { RedirectResponse, Response } from "@blendsdk/webafx-common";
import { IAuthorizeRequest, IAuthorizeResponse, ISysAuthorizationView, ISysTenant, eSysAuthorizationView } from "@porta/shared";
import { SysTenantDataService } from "../../../../dataservices/SysTenantDataService";
import { EndpointController, commonUtils } from "../../../../services";
import { CONST_AUTH_FLOW_TTL, CONST_NONCE_TTL, IAuthorizationFlow, IPortaApplicationSetting, eErrorType, eOAuthDisplayModes, eOAuthPKCECodeChallengeMethod, eOAuthPrompt, eOAuthResponseMode, eOAuthResponseType } from "../../../../types";

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

        const { tenant, redirect_uri, response_mode, state } = authRequest;

        const tenantRecord = await this.getTenantRecord(tenant);

        if (!tenantRecord) {
            return this.responseWithError({
                error: eErrorType.invalid_tenant,
                error_description: tenant,
                redirect_uri,
                response_mode,
                state
            });
        }

        const validationResult = await this.validateAuthorizationRequest(authRequest);
        if (!isNullOrUndef(validationResult)) {
            // something is wrong with the request
            return validationResult;
        } else {
            const { errors, flowId } = await this.prepareAuthorization(authRequest, tenantRecord);
            if (errors.length === 0 && flowId) {
                // here we decide on the sign in URL. It is either from the webclient or 
                // an existing user.
                let signinURL = this.createFrontendSignInUrl(flowId, authRequest);
                return new RedirectResponse({ url: signinURL });
            } else {
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
     * @protected
     * @param {string} flowId
     * @param {IAuthorizeRequest} authRequest
     * @return {*} 
     * @memberof AuthorizeEndpointController
     */
    protected createFrontendSignInUrl(flowId: string, authRequest: IAuthorizeRequest) {
        let signinURL = `${this.getServerURL()}/fe/auth/${flowId}/signin`;
        const url = new URL(signinURL);
        if (authRequest.ui_locales) {
            url.searchParams.append("ui_locals", authRequest.ui_locales);
        }
        return url.toString();
    }

    protected async prepareAuthorization(authRequest: IAuthorizeRequest, tenantRecord: ISysTenant) {

        // Find the auth record based on the auth request from the database
        const authRecord = await this.findAuthorizationRecord(authRequest, tenantRecord);

        const errors: string[] = [];

        let flowId: string = undefined;

        if (authRecord.length === 1) { // authRecord must only return one record, otherwise somehow multiple records with the same client_id/secret where found!
            flowId = await this.createAuthorizationFlow(authRecord[0], authRequest);
        } else {
            errors.push("invalid_authorization");
        }
        return { errors, flowId };
    }

    /**
     * @protected
     * @param {ISysAuthorizationView} authRecord
     * @param {IAuthorizeRequest} authRequest
     * @return {*} 
     * @memberof AuthorizeEndpointController
     */
    protected async createAuthorizationFlow(authRecord: ISysAuthorizationView, authRequest: IAuthorizeRequest) {
        const flowId = generateRandomUUID();
        const expire = commonUtils.expireSecondsFromNow(CONST_AUTH_FLOW_TTL);
        await this.getCache().setValue<IAuthorizationFlow>(
            `auth_flow:${flowId}`,
            {
                authRecord: authRecord[0], // the first one
                authRequest,
                flowId,
                expire
            },
            {
                expire
            }
        );
        return flowId;
    }

    /**
     * @protected
     * @param {IAuthorizeRequest} authRequest
     * @param {ISysTenant} tenantRecord
     * @return {*} 
     * @memberof AuthorizeEndpointController
     */
    protected findAuthorizationRecord(authRequest: IAuthorizeRequest, tenantRecord: ISysTenant) {
        const tenantDs = new SysTenantDataService({ tenantId: tenantRecord.id });
        const { client_id, redirect_uri } = authRequest;
        const e = expression();
        return tenantDs.listSysAuthorizationViewByExpression(e.createRenderer(
            e.And(
                e.Equal(eSysAuthorizationView.CLIENT_ID, client_id),
                e.Equal(eSysAuthorizationView.REDIRECT_URI, redirect_uri)
            )
        ));
    }

    /**
     * @protected
     * @param {IAuthorizeRequest} authRequest
     * @return {*} 
     * @memberof AuthorizeEndpointController
     */
    protected async validateAuthorizationRequest(authRequest: IAuthorizeRequest) {
        const { response_type, redirect_uri, state, response_mode } = authRequest || {};
        // parse the response types. The response type can be an array of values!
        const response_types = this.parseResponseType(response_type);
        // check the nonce
        const isNonceValid = await this.isValidNonce(authRequest, response_types);
        if (!redirect_uri) {
            // When no redirect URI then we cannot even continue
            return this.responseWithError(
                {
                    error: eErrorType.invalid_request,
                    redirect_uri,
                    state,
                    error_description: "no_redirect_uri",
                    response_mode
                }
            );
        } else if (!this.isValidPKCERequest(authRequest)) {
            return this.responseWithError({
                error: eErrorType.invalid_request,
                redirect_uri,
                state,
                error_description: "invalid_pkce_parameters",
                response_mode
            });
        } else if (!isNonceValid) {
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
                    expire: commonUtils.expireSecondsFromNow(CONST_NONCE_TTL)
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
