import { createErrorObject } from "@blendsdk/stdlib";
import { BadRequestResponse, RedirectResponse, Response, SuccessResponse } from "@blendsdk/webafx-common";
import {
    ISessionLogoutGetRequest,
    ISessionLogoutGetResponse,
    ISessionLogoutPostRequest,
    ISessionLogoutPostResponse,
    ISysSessionView,
    ISysTenant
} from "@porta/shared";
import * as crypto from "crypto";
import { SysSessionViewDataService } from "../../../../dataservices/SysSessionViewDataService";
import { IAccessToken, ILogoutFlowStorage, eErrorType, eLogoutFlowState } from "../../../../types";
import { commonUtils, databaseUtils } from "../../../../utils";
import { expireSecondsFromNow, renderGetRedirect } from "../../../auth/utils";
import { EndpointController } from "./EndpointControllerBase";
import { AUTH_FLOW_TTL } from "./constants";

interface ISessionStorage extends ISysSessionView {}

export class EndSessionController extends EndpointController {
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
    protected async findSessionByClientIDAndLogoutHint(tenant: ISysTenant, client_id: string, logout_hint: string) {
        if (tenant) {
            const { dataSource } = await databaseUtils.getTenantDataSource(tenant.name);
            const sessionDs = new SysSessionViewDataService({ dataSource });
            return logout_hint && client_id
                ? sessionDs.findSessionByOidcClientAndSubject({
                      client_id,
                      sub_claim: logout_hint
                  })
                : null;
        } else {
            return null;
        }
    }

    protected async createLogoutFlow(
        tenant: string,
        session: ISessionStorage,
        post_logout_redirect_uri: string,
        errors: string[],
        accessToken: IAccessToken,
        state: string
    ) {
        const flowId = crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex");
        const expire = expireSecondsFromNow(AUTH_FLOW_TTL);
        let post_logout_redirect_uri_list: string[] = [];
        let post_logout_redirect_uri_matched = undefined;

        // Do checks if there is an access token
        if (accessToken) {
            if (session.session_id !== accessToken.session.session_id) {
                errors.push("invalid_or_mismatch_session");
            }

            if (session.user_id !== accessToken.user_id) {
                errors.push("invalid_or_mismatch_user");
            }

            if (session.client_id !== accessToken.client_id) {
                errors.push("invalid_or_mismatch_client");
            }
        }

        // when none is registered
        if (!session.post_logout_redirect_uri) {
            errors.push("no_registered_post_logout_redirect_uri_by_client");
        } else {
            post_logout_redirect_uri_list = commonUtils.parseToArray(session.post_logout_redirect_uri || "[]");
            post_logout_redirect_uri_matched = post_logout_redirect_uri_list.find((item) => {
                return item === post_logout_redirect_uri;
            });
        }

        // when none provided and multiple registered
        if (!post_logout_redirect_uri && post_logout_redirect_uri_list.length !== 0 && !accessToken) {
            errors.push("missing_post_logout_redirect_uri");
        }

        // when none matching
        if (!post_logout_redirect_uri_matched) {
            errors.push("no_registered_post_logout_redirect_uri");
        }

        if (errors.length === 0) {
            await this.getCache().setValue<Partial<ILogoutFlowStorage>>(
                this.getLogoutFlowCacheKey(flowId),
                {
                    ...(session as any),
                    tenant,
                    flowState: eLogoutFlowState.consent,
                    finalizeURL: `${this.getServerUrl()}${this.request.path}?lf=${flowId}`,
                    post_logout_redirect_uri,
                    flowId,
                    state
                },
                {
                    expire
                }
            );
        }

        return errors.length === 0 ? flowId : undefined;
    }

    /**
     * Handle the form and following (second) request
     *
     * @protected
     * @param {string} flowId
     * @returns
     * @memberof EndSessionController
     */
    protected async handleLogoutFlowRequest(flowId: string) {
        const flowData = await this.getCache().getValue<ILogoutFlowStorage>(this.getLogoutFlowCacheKey(flowId));

        const expire = expireSecondsFromNow(AUTH_FLOW_TTL * 3);
        const expireAt = new Date(expire);

        const { flowState = undefined } = flowData || {};

        // Setting the flow to ask for logout
        if (flowState === eLogoutFlowState.consent) {
            // set the flow id cookie
            this.setCookie("_lf", flowId, {
                expires: expireAt,
                signed: true,
                secure: this.request.protocol !== "http",
                sameSite: "lax", // only send to this endpoint
                httpOnly: true
            });

            // set the logout session length
            this.setCookie("_ls", expire, {
                expires: expireAt,
                sameSite: "lax"
            });

            // set the tenant name
            this.setCookie("_t", flowData.tenant, {
                expires: expireAt,
                sameSite: "lax"
            });

            // set the readable logout flow id
            this.setCookie("_l", flowId, {
                expires: expireAt,
                sameSite: "lax"
            });

            // change and save the flow for the following call
            flowData.flowState = eLogoutFlowState.finalize;
            await this.getCache().setValue(this.getLogoutFlowCacheKey(flowId), flowData);

            // return to the logout form
            return new SuccessResponse(renderGetRedirect(`${this.getServerUrl()}/fe/auth/signout`));
        } else if (flowState === eLogoutFlowState.finalize) {
            // Removes all token by this user and client
            const tenantRecord = await databaseUtils.findTenant(flowData.tenant);
            await this.destroySessionAndAllTokens(tenantRecord, flowData.client_id, flowData.user_id);

            // delete all the cookies
            this.deleteAllCookies({
                tenant: flowData.tenant,
                client: flowData.client.client_id,
                system: this.getServerUrl(),
                type: undefined
            });
            // delete the flow cache
            await this.getCache().deleteValue(this.getLogoutFlowCacheKey(flowId));

            // Response by redirect otherwise with JSON
            if (flowData?.post_logout_redirect_uri) {
                const url = new URL(flowData.post_logout_redirect_uri);
                if (flowData.state && flowData.client.is_system_client !== true) {
                    url.searchParams.append("state", flowData.state);
                }
                return new SuccessResponse(renderGetRedirect(url.toString()));
            } else {
                return new SuccessResponse({ data: { done: true } });
            }
        } else {
            return new BadRequestResponse(createErrorObject("INVALID_LOGOUT_FLOW", { flowId }));
        }
    }

    /**
     * Handle the initial logout request
     *
     * @protected
     * @param {ISysTenant} tenantRecord
     * @param {ISessionLogoutGetRequest} params
     * @returns
     * @memberof EndSessionController
     */
    protected async handleInitialRequest(tenantRecord: ISysTenant, params: ISessionLogoutGetRequest) {
        let logoutFlowId: string = undefined;
        const { state, tenant, id_token_hint, client_id, logout_hint, post_logout_redirect_uri } = params || {};
        const { anonymus_logout = false } = this.request.context.getSessionStorage<{ anonymus_logout: boolean }>();
        const { idToken, errors } = await this.validateIDToken(tenant, id_token_hint, client_id);

        // find a session based on the client_id and logout_hint
        const hintedSession = await this.findSessionByClientIDAndLogoutHint(tenantRecord, client_id, logout_hint);
        // If the id token is ok? (not given or given and ok!)
        if (!errors) {
            const uriErrors: string[] = [];

            const sessionByAccessToken: IAccessToken = anonymus_logout
                ? undefined
                : this.getContext().getSessionStorage<IAccessToken>();

            // If we have an id_token here then it is validated and ok
            // In that case we will use the id_token as the recommended way of validating
            // the session and user
            if (idToken) {
                const { sub, aud, sid } = idToken;
                const session = await this.findSessionByClientIDAndLogoutHint(tenantRecord, aud, sub);
                if (sid !== session?.session_id) {
                    uriErrors.push("idk_session_mismatch");
                }
                logoutFlowId = await this.createLogoutFlow(
                    tenant,
                    session as any,
                    post_logout_redirect_uri,
                    uriErrors,
                    sessionByAccessToken,
                    state
                );
            } else if (hintedSession) {
                // Here we don't have an ID token, but the session was found (guessed) based on the
                // client_id and the logout_hint (user_id)
                logoutFlowId = await this.createLogoutFlow(
                    tenant,
                    hintedSession as any,
                    post_logout_redirect_uri ? post_logout_redirect_uri : hintedSession.post_logout_redirect_uri,
                    uriErrors,
                    sessionByAccessToken,
                    state
                );
            } else if (sessionByAccessToken) {
                // create the flow by access token
                logoutFlowId = await this.createLogoutFlow(
                    tenant,
                    {
                        user: sessionByAccessToken.user as any,
                        user_id: sessionByAccessToken.user_id,
                        client: sessionByAccessToken.client as any,
                        client_id: sessionByAccessToken.client.id,
                        oidc_client_id: sessionByAccessToken.client.client_id,
                        oidc_sub_claim: sessionByAccessToken.user.id,
                        post_logout_redirect_uri: sessionByAccessToken.client.post_logout_redirect_uri,
                        session_id: sessionByAccessToken.session.session_id,
                        id: sessionByAccessToken.session.id,
                        date_created: sessionByAccessToken.session.date_created,
                        is_back_channel_post_logout: sessionByAccessToken.client.is_back_channel_post_logout
                    },
                    undefined,
                    uriErrors,
                    sessionByAccessToken,
                    state
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

            if (uriErrors.length !== 0) {
                return this.responseWithError(
                    {
                        error: eErrorType.invalid_request,
                        error_description: uriErrors[0], // only the first one
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
        let { state, tenant, lf: logoutFlow = undefined } = params || {};

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
