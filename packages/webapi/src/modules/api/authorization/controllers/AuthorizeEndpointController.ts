import { sha256Hash } from "@blendsdk/crypto";
import { isNullOrUndef } from "@blendsdk/stdlib";
import { RedirectResponse, Response } from "@blendsdk/webafx-common";
import { IAuthorizeRequest, IAuthorizeResponse } from "@porta/shared";
import { DataServices } from "../../../../dataservices/DataServices";
import { EndpointController, commonUtils } from "../../../../services";
import { IPortaApplicationSetting, NONCE_TTL, eErrorType, eOAuthDisplayModes, eOAuthPKCECodeChallengeMethod, eOAuthPrompt, eOAuthResponseMode, eOAuthResponseType } from "../../../../types";

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

        const ds = new DataServices(tenant, this.request, true); // no user no assertion test
        return ds.withTransaction(async () => {

            // validate the authorization request
            const validationResult = await this.validateAuthorizationRequest(authRequest);

            if (!isNullOrUndef(validationResult)) {
                // something is wrong with the request
                return validationResult;
            } else {
                
                return new RedirectResponse({ url: "https://truesoftware.nl" });
            }

        });
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
                    expire: commonUtils.expireSecondsFromNow(NONCE_TTL)
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
