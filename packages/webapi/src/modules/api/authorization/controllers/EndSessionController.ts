import {
    ISessionLogoutGetRequest,
    ISessionLogoutGetResponse,
    ISessionLogoutPostResponse,
    ISysSessionView
} from "@porta/shared";
import { RedirectResponse, Response, SuccessResponse } from "@blendsdk/webafx-common";
import { EndpointController } from "./EndpointControllerBase";
import { ISessionLogoutPostRequest } from "@porta/shared";
import { eErrorType, eLogoutFlowState, ILogoutFlowStorage } from "../../../../types";
import { ISysTenant } from "@porta/shared";
import { databaseUtils } from "../../../../utils";
import { SysSessionViewDataService } from "../../../../dataservices/SysSessionViewDataService";
import * as crypto from "crypto";
import { expireSecondsFromNow } from "../../../auth/utils";
import { AUTH_FLOW_TTL } from "./constants";

interface ISessionStorage extends Omit<ISysSessionView, "post_logout_redirect_uris"> {
    post_logout_redirect_uris: { uri: [] };
}

export class EndSessionController extends EndpointController {
    protected renderGetRedirect(url: string) {
        return `<html>
            <style>
            #html-spinner{
                width:32px;
                height:32px;
                border:2px solid #c9c9c9;
                border-top:2px solid white;
                border-radius:50%;
              }

              #html-spinner{
                -webkit-transition-property: -webkit-transform;
                -webkit-transition-duration: 1.2s;
                -webkit-animation-name: rotate;
                -webkit-animation-iteration-count: infinite;
                -webkit-animation-timing-function: linear;

                -moz-transition-property: -moz-transform;
                -moz-animation-name: rotate;
                -moz-animation-duration: 1.2s;
                -moz-animation-iteration-count: infinite;
                -moz-animation-timing-function: linear;

                transition-property: transform;
                animation-name: rotate;
                animation-duration: 1.2s;
                animation-iteration-count: infinite;
                animation-timing-function: linear;
              }

              @-webkit-keyframes rotate {
                  from {-webkit-transform: rotate(0deg);}
                  to {-webkit-transform: rotate(360deg);}
              }

              @-moz-keyframes rotate {
                  from {-moz-transform: rotate(0deg);}
                  to {-moz-transform: rotate(360deg);}
              }

              @keyframes rotate {
                  from {transform: rotate(0deg);}
                  to {transform: rotate(360deg);}
              }


              /* Rest of page style*/
              body{
                background:#fcfcfc;
                font-family: 'Open Sans', sans-serif;
                -webkit-font-smoothing: antialiased;
                color:#c9c9c9;
              }


              #html-spinner {
                position:absolute;
                top:50%;
                left:50%;
              }
            </style>
            <body>
                <div id="html-spinner"></div>
            </body>
            <script>
               window.location.href="${url}";
            </script>
        </html>`;
    }

    /**
     * Validates and retrieves the ID token
     *
     * @protected
     * @param {string} tenant
     * @param {string} id_token
     * @param {string} client_id
     * @returns {Promise<{ idToken: any; errors: string[] }>}
     * @memberof EndSessionController
     */
    protected async validateIDToken(
        tenant: string,
        id_token: string,
        client_id: string
    ): Promise<{ idToken: any; errors: string[] }> {
        if (id_token) {
            const { publicKey } = await this.getJWKKey(tenant);

            const { jwt, error } = this.verifyGetJWT(id_token, publicKey, {
                audience: client_id,
                ignoreExpiration: true,
                issuer: this.getIssuer(tenant)
            });

            return {
                idToken: error ? undefined : jwt,
                errors: error ? [error?.replace(/jwt/gi, "id_token_hint")] : undefined
            };
        } else {
            return {
                idToken: undefined,
                errors: undefined
            };
        }
    }

    /**
     * Try to find a session given a login_hint (sys_user->user_id)
     * and a client_id
     *
     * @protected
     * @param {ISysTenant} tenant
     * @param {string} client_id
     * @param {string} logout_hint
     * @returns
     * @memberof EndSessionController
     */
    protected async fontSessionByClientIDAndLogoutHint(tenant: ISysTenant, client_id: string, logout_hint: string) {
        const { dataSource } = await databaseUtils.getTenantDataSource(tenant.name);
        const sessionDs = new SysSessionViewDataService({ dataSource });
        return logout_hint && client_id
            ? sessionDs.findSessionByOidcClientAndSubject({
                  client_id,
                  sub_claim: logout_hint
              })
            : undefined;
    }

    protected async createLogoutFlow(
        tenant: string,
        session: ISessionStorage,
        post_logout_redirect_uri: string,
        errors: string[]
    ) {
        const flowId = crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex");
        const expire = expireSecondsFromNow(AUTH_FLOW_TTL);
        const post_logout_redirect_uris: string[] = [...session.post_logout_redirect_uris?.uri];

        // when none is registered
        if (post_logout_redirect_uris.length === 0) {
            errors.push("no_registered_post_logout_redirect_uri");
        }

        // when none matching
        if (
            post_logout_redirect_uri &&
            post_logout_redirect_uris.filter((i) => {
                return i === post_logout_redirect_uri;
            }).length === 0
        ) {
            errors.push("no_registered_post_logout_redirect_uri");
        }

        // when none provided and multiple registered
        if (!post_logout_redirect_uri && post_logout_redirect_uris.length > 1) {
            errors.push("missing_post_logout_redirect_uri");
        }

        // select the first one of none provided and only a single one is registered
        if (!post_logout_redirect_uri && post_logout_redirect_uris.length == 1) {
            post_logout_redirect_uri = post_logout_redirect_uris[0];
        }

        if (errors.length === 0) {
            await this.getCache().setValue<Partial<ILogoutFlowStorage>>(
                this.getLogoutFlowCacheKey(flowId),
                {
                    ...(session as any),
                    tenant,
                    flowState: eLogoutFlowState.consent,
                    finalizeURL: `${this.getServerUrl()}${this.request.path}?lf=${flowId}`,
                    post_logout_redirect_uri
                },
                {
                    expire
                }
            );
        }

        return errors.length === 0 ? flowId : undefined;
    }

    /**
     * Delete all cookies
     *
     * @protected
     * @memberof EndSessionController
     */
    protected deleteAllCookies() {
        const cookies = this.request.cookies;
        const signedCookies = this.request.signedCookies;

        for (const cookieName in cookies) {
            this.response.cookie(cookieName, "", { expires: new Date(0) });
        }

        for (const cookieName in signedCookies) {
            this.response.cookie(cookieName, "", { expires: new Date(0) });
        }
    }

    protected async handleLogoutFlowRequest(flowId: string) {
        const flowData = await this.getCache().getValue<ILogoutFlowStorage>(this.getLogoutFlowCacheKey(flowId));

        const expire = expireSecondsFromNow(AUTH_FLOW_TTL * 3);
        const expireAt = new Date(expire);

        const { flowState = undefined } = flowData || {};

        if (flowState === eLogoutFlowState.consent) {
            this.setCookie("_lf", flowId, {
                expires: expireAt,
                signed: true,
                secure: this.request.protocol !== "http",
                sameSite: "lax", // only send to this endpoint
                httpOnly: true
            });
            this.setCookie("_ls", expire, {
                expires: expireAt,
                sameSite: "lax"
            });
            flowData.flowState = eLogoutFlowState.finalize;
            await this.getCache().setValue(this.getLogoutFlowCacheKey(flowId), flowData);
            return new SuccessResponse(this.renderGetRedirect(`${this.getServerUrl()}/fe/auth/signout`));
        } else if (flowState === eLogoutFlowState.finalize) {
            this.deleteAllCookies();
            return new SuccessResponse(this.renderGetRedirect(flowData.post_logout_redirect_uri));
        } else {
            // render that the flow is already finalized invalid and the user can close this browser or tab
        }
    }

    protected async handleInitialRequest(tenantRecord: ISysTenant, params: ISessionLogoutGetRequest) {
        let logoutFlowId: string = undefined;
        const { state, tenant, id_token_hint, client_id, logout_hint, post_logout_redirect_uri } = params || {};
        const { anonymus_logout = false } = this.request.context.getSessionStorage<{ anonymus_logout: boolean }>();
        const { idToken, errors } = await this.validateIDToken(tenant, id_token_hint, client_id);

        // find a session based on the client_id and logout_hint
        const hintedSession = await this.fontSessionByClientIDAndLogoutHint(tenantRecord, client_id, logout_hint);
        // If the id token is ok? (not given or given and ok!)
        if (!errors) {
            const uriErrors: string[] = [];

            if (anonymus_logout) {
                // If we have an id_token here then it is validated and ok
                // In that case we will use the id_token as the recommended way of validating
                // the session and user
                if (idToken) {
                    const { sub, aud, sid } = idToken;
                    const session = await this.fontSessionByClientIDAndLogoutHint(tenantRecord, aud, sub);
                    if (sid !== session?.session_id) {
                        throw new Error("Invalid session! Code 1024");
                    }
                    logoutFlowId = await this.createLogoutFlow(
                        tenant,
                        session as any,
                        post_logout_redirect_uri,
                        uriErrors
                    );
                } else if (hintedSession) {
                    // Here we don't have an ID token, but the session was found (guessed) based on the
                    // client_id and the logout_hint (user_id)
                    logoutFlowId = await this.createLogoutFlow(
                        tenant,
                        hintedSession as any,
                        post_logout_redirect_uri,
                        uriErrors
                    );
                } else {
                    return this.responseWithError(
                        {
                            error: eErrorType.invalid_request,
                            error_description: "unable_to_determine_session",
                            state
                        },
                        true
                    );
                }
            } else {
                // authenticated user
            }

            if (uriErrors.length !== 0) {
                return this.responseWithError(
                    {
                        error: eErrorType.invalid_request,
                        error_description: errors.join(", "),
                        state
                    },
                    true
                );
            } else if (logoutFlowId) {
                return new RedirectResponse({
                    url: `${this.getServerUrl()}${this.request.path}?lf=${logoutFlowId}`
                });
            } else {
                return this.responseWithError(
                    {
                        error: eErrorType.invalid_request,
                        error_description: "invalid_logout_flow",
                        state
                    },
                    true
                );
            }
        } else {
            return this.responseWithError(
                {
                    error: eErrorType.invalid_request,
                    error_description: errors.join(","),
                    state
                },
                true
            );
        }
    }

    /**
     * Handle the end session request
     *
     * @param {ISessionLogoutGetRequest} request
     * @returns {Promise<Response<ISessionLogoutGetResponse>>}
     * @memberof EndSessionController
     */
    public async handleRequest(
        params: ISessionLogoutPostRequest | ISessionLogoutGetRequest
    ): Promise<Response<ISessionLogoutGetResponse | ISessionLogoutPostResponse>> {
        // get the request params
        const { state, tenant, lf: logoutFlow = undefined } = params || {};

        const tenantRecord = await this.getTenant(tenant);
        if (tenantRecord && tenantRecord.is_active) {
            if (logoutFlow) {
                return await this.handleLogoutFlowRequest(logoutFlow);
            } else {
                return await this.handleInitialRequest(tenantRecord, params);
            }
        } else {
            return this.responseWithError(
                {
                    error: eErrorType.invalid_request,
                    error_description: "invalid_tenant",
                    state
                },
                true
            );
        }
    }
}
