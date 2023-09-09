import { asyncForEach, IDictionaryOf } from "@blendsdk/stdlib";
import { RedirectResponse, Response, ServerErrorResponse } from "@blendsdk/webafx-common";
import { IAuthorizeRequest, ISigninRequest, ISigninResponse, ISysAuthorizationView } from "@porta/shared";
import { eErrorType, eOAuthResponseType, ICachedUser, IFlowRedirect, IOTACache } from "../../../../types";
import { commonUtils } from "../../../../utils";
import { expireSecondsFromNow } from "../../../auth/utils";
import { OTA_TTL, REDIRECT_TTL } from "./constants";
import { eFlow, EndpointController } from "./EndpointControllerBase";

/**
 * Handles the sign-in endpoint
 *
 * @export
 * @class SigninEndpointController
 * @extends {EndpointController}
 */
export class SigninEndpointController extends EndpointController {
    /**
     * Redirected signin handler
     *
     * @param {ISigninRequest} _params
     * @returns {Promise<Response<ISigninResponse>>}
     * @memberof AuthorizationController
     */
    public async handleRequest(_params: ISigninRequest): Promise<Response<ISigninResponse>> {
        try {
            // deconstruct the flow variables
            const {
                flowId = undefined,
                authRequest = undefined,
                authRecord = undefined,
                currentUserToken = undefined,
                response_types = undefined,
                expire = undefined
            } = await this.getCurrentAuthenticationFlow();

            // deconstruct the auth request
            const { response_mode, redirect_uri, state, nonce } = authRequest || {};

            const response: IDictionaryOf<string> = {};
            let newToken: string = undefined;

            // perform a local login if the auth flow has been successful
            // this check will return false automatically when the currentUserToken
            // exists.
            if (await this.isAuthFlowSuccessful()) {
                newToken = await this.performLocalLogin({
                    flowId,
                    authRecord,
                    authRequest
                });
            } else if (!currentUserToken) {
                // return error when we also don't have a current user.
                return this.responseWithError({
                    error: eErrorType.login_required,
                    error_description: "invalid_signin_flow",
                    redirect_uri,
                    state,
                    response_mode
                });
            }

            // build response ?
            if (response_types.indexOf(eOAuthResponseType.code) !== -1) {
                await asyncForEach(response_types, async (type) => {
                    switch (type) {
                        case eOAuthResponseType.code:
                            /**
                             * Create a new OTA and mark it as NOT used.
                             * We will use this flag to revoke token access
                             * if the OTA is used more than once
                             */
                            const ota_code = commonUtils.getUUID();
                            await this.getCache().setValue<IOTACache>(
                                `ota:${ota_code}`,
                                { flowId, used: false, tokenRef: undefined, tenantRecord: undefined },
                                {
                                    expire: expireSecondsFromNow(OTA_TTL)
                                }
                            );
                            response[type] = ota_code;
                            break;
                        default:
                            return this.responseWithError({
                                error: eErrorType.invalid_request_uri,
                                error_description: "invalid_response_type",
                                redirect_uri,
                                state,
                                response_mode
                            });
                    }
                });

                // add to the response if possible
                if (state) {
                    response["state"] = state;
                }

                if (nonce) {
                    response["nonce"] = nonce;
                }
            }

            // save the redirect command into cache and commence with redirection
            // this is needed to cleanup the flow and do a final redirection to the client
            const redirectId = commonUtils.getUUID();
            await this.getCache().setValue<IFlowRedirect>(
                `redirect:${redirectId}`,
                {
                    response_mode,
                    response,
                    redirect_uri
                },
                { expire: expireSecondsFromNow(REDIRECT_TTL) }
            );

            // save in the flow for the token endpoint
            await this.setFlow(eFlow.access_token, flowId, newToken || currentUserToken, { expire });

            // clear the _af cookie
            await this.clearAuthenticationFlow();

            // and re-route to the redirect endpoint
            return new RedirectResponse({
                url: this.createFlowUrl("redirect", redirectId)
            });
        } catch (err) {
            return new ServerErrorResponse(err.message);
        }
    }

    /**
     * Get the current authenticated user data from the flow
     *
     * @protected
     * @template ICachedUser
     * @param {string} flowId
     * @returns
     * @memberof AuthorizationController
     */
    protected async getAuthenticatedUser(flowId: string): Promise<ICachedUser> {
        return this.getFlow<ICachedUser>(eFlow.user, flowId);
    }

    /**
     * Locally login to porta
     *
     * @protected
     * @param {string} flow
     * @memberof AuthorizationController
     */
    protected async performLocalLogin({
        flowId,
        authRecord,
        authRequest
    }: {
        flowId: string;
        authRequest: IAuthorizeRequest;
        authRecord: ISysAuthorizationView;
    }): Promise<string> {
        const { tenant, user } = await this.getAuthenticatedUser(flowId);

        const {
            accessTokenKeySignature,
            refreshTokenKeySignature,
            accessTokenStorage,
            refreshTokenStorage,
            sessionKeySignature,
            sessionStorage
        } = await this.createSessionStorageForUser({
            tenant,
            authRecord,
            user_id: user.id,
            auth_request_params: {
                claims: authRequest.claims,
                scope: authRequest.scope,
                ui_locales: authRequest.ui_locales,
                acr_values: authRequest.acr_values
            }
        });

        this.installLocalCookies({
            tenant: tenant.name,
            accessTokenStorage,
            accessTokenKeySignature,
            refreshTokenStorage,
            refreshTokenKeySignature,
            sessionKeySignature,
            sessionStorage
        });

        return accessTokenStorage.access_token;
    }

    /**
     * Checks if the authentication flow has been successful
     *
     * @protected
     * @returns
     * @memberof AuthorizationController
     */
    protected async isAuthFlowSuccessful() {
        const { account, account_state, account_status, password_state, mfa_state } =
            (await this.getCurrentFlowState()) || {};
        this.getLogger().debug("isAuthFlowSuccessful", {
            account,
            account_state,
            account_status,
            password_state,
            mfa_state
        });
        return account && account_state && account_status && password_state && mfa_state;
    }
}
