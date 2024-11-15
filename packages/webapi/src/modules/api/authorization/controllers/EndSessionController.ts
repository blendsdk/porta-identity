import { generateRandomUUID } from "@blendsdk/crypto";
import { renderGetRedirect } from "@blendsdk/webafx-auth-oidc";
import { Response, SuccessResponse } from "@blendsdk/webafx-common";
import {
    COOKIE_AUTH_FLOW,
    COOKIE_AUTH_FLOW_TTL,
    IPortaAccount,
    ISessionLogoutGetRequest,
    ISessionLogoutGetResponse,
    ISessionLogoutPostRequest,
    ISessionLogoutPostResponse,
    ISysSessionView,
    ISysTenant
} from "@porta/shared";
import * as jose from "jose";
import { SysSessionDataService } from "../../../../dataservices/SysSessionDataService";
import { commonUtils, databaseUtils, EndpointController, ILogoutFlow } from "../../../../services";
import { CONST_AUTH_FLOW_TTL, eErrorType } from "../../../../types";

type TLogoutRequest = ISessionLogoutPostRequest | ISessionLogoutGetRequest;
type TlogoutResponse = ISessionLogoutGetResponse | ISessionLogoutPostResponse;
type TIdToken = jose.JWTVerifyResult<jose.JWTPayload>;

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
        tenantRecord: ISysTenant,
        id_token: string,
        client_id: string,
        errors: string[]
    ): Promise<TIdToken> {
        let idToken: TIdToken = undefined;
        if (id_token) {
            const { publicKey } = await databaseUtils.getJWKSigningKeys(tenantRecord);
            const pKey = await jose.importSPKI(publicKey, "ES256");

            try {
                idToken =
                    (await jose.jwtVerify(id_token, pKey, { issuer: this.getIssuer(tenantRecord.id) })) || ({} as any);
            } catch (err) {
                errors.push(err.message);
            }

            if (client_id && idToken?.payload?.aud !== client_id) {
                errors.push("Invalid id_token aud!");
            }
        }
        return idToken;
    }

    /**
     * @protected
     * @return {*}
     * @memberof EndSessionController
     */
    protected isPostRequest() {
        return this.request.method.toLocaleLowerCase() !== "get";
    }

    /**
     * Handle the end session request
     *
     * @param {ISessionLogoutGetRequest} request
     * @returns {Promise<Response<ISessionLogoutGetResponse>>}
     * @memberof EndSessionController
     */
    public async handleRequest(params: TLogoutRequest): Promise<Response<TlogoutResponse>> {
        // get the request params
        const { state, tenant, lf: logoutFlow = undefined, post_logout_redirect_uri } = params || {};

        const tenantRecord = await commonUtils.getTenantRecord(tenant, this.request);

        if (!tenantRecord) {
            return this.responseWithError(
                {
                    error: eErrorType.invalid_tenant,
                    error_description: tenant,
                    redirect_uri: post_logout_redirect_uri,
                    state
                },
                this.isPostRequest()
            );
        }

        if (logoutFlow) {
            return await this.finalizeSignout(tenantRecord, params);
        } else {
            return await this.startLogoutFlow(tenantRecord, params);
        }
    }

    /**
     * @protected
     * @param {ISysTenant} tenantRecord
     * @param {TLogoutRequest} params
     * @return {*}
     * @memberof EndSessionController
     */
    protected async finalizeSignout(tenantRecord: ISysTenant, params: TLogoutRequest) {
        const sessionDb = new SysSessionDataService({ tenantId: tenantRecord.id });
        const { lf: flowId } = params || {};
        const { session, post_logout_redirect_uri } = await this.getCache().getValue<ILogoutFlow>(flowId);

        // We only delete the session information from the database here.
        // The flow information still remains and will eventually timeout
        // This is deone because we still want to show the application_name and logo after
        // the logout process on the complete view!
        await sessionDb.deleteSysSessionById({ id: session.id });

        // try to remove the session cokkie too
        const cookieId = commonUtils.createSessionCookieID(tenantRecord, this.request);
        this.setCookie(cookieId, "?", {
            expires: new Date(Date.now() - 100000),
            httpOnly: true,
            secure: true,
            sameSite: "lax"
        });

        if (post_logout_redirect_uri) {
            return new SuccessResponse(renderGetRedirect(post_logout_redirect_uri));
        } else {
            return new SuccessResponse(renderGetRedirect(`${this.getServerURL()}/fe/auth/signout/complete`));
        }
    }

    /**
     * @protected
     * @param {ISysTenant} tenantRecord
     * @param {TLogoutRequest} params
     * @return {*}
     * @memberof EndSessionController
     */
    protected async startLogoutFlow(tenantRecord: ISysTenant, params: TLogoutRequest) {
        const { state, id_token_hint, client_id, logout_hint } = params || {};
        const errors: string[] = [];
        let sessionView: ISysSessionView = undefined;

        const idToken = await this.validateIDToken(tenantRecord, id_token_hint, client_id, errors);

        if (errors.length === 0) {
            //Find by id_token
            if (idToken) {
                const { payload } = idToken;
                const { sub, aud } = payload || {};
                sessionView = await databaseUtils.findSessionByClientIDAndLogoutHint(aud.toString(), sub, tenantRecord);
            }

            // Find by client_id logout_hit is provided
            if (!sessionView && client_id && logout_hint) {
                sessionView = await databaseUtils.findSessionByClientIDAndLogoutHint(
                    client_id,
                    logout_hint,
                    tenantRecord
                );
            }

            // Find by current session
            if (!sessionView) {
                const { user, application } = this.getContext()?.getUser<IPortaAccount>() || {};
                sessionView = await databaseUtils.findSessionByClientIDAndLogoutHint(
                    application?.client_id,
                    user?.id,
                    tenantRecord
                );
            }

            // when has a session (on a public route)
            if (!sessionView) {
                const cookieId = commonUtils.createSessionCookieID(tenantRecord, this.request);
                const sessionId = this.getCookie(cookieId);
                sessionView = await databaseUtils.findSessionBySessionId(sessionId, tenantRecord);
            }

            // So here we found a session
            if (sessionView) {
                const flowId = generateRandomUUID();
                const expire = commonUtils.expireSecondsFromNow(CONST_AUTH_FLOW_TTL * 2);

                let post_logout_redirect_uri = undefined;

                if (
                    params.post_logout_redirect_uri &&
                    params.post_logout_redirect_uri === sessionView.client.post_logout_redirect_uri
                ) {
                    const url = new URL(params.post_logout_redirect_uri);
                    if (params.state) {
                        url.searchParams.append("state", params.state);
                    }
                    if (params.ui_locales) {
                        url.searchParams.append("ui_locales", params.ui_locales);
                    }
                    post_logout_redirect_uri = url.toString();
                }

                await this.getCache().setValue<ILogoutFlow>(flowId, {
                    post_logout_redirect_uri,
                    session: sessionView.session,
                    application: sessionView.application,
                    client: sessionView.client,
                    tenant: tenantRecord.name,
                    expire
                });

                this.setCookie(COOKIE_AUTH_FLOW, flowId, {
                    expires: new Date(expire),
                    secure: true,
                    httpOnly: true,
                    sameSite: "strict"
                });

                this.setCookie(COOKIE_AUTH_FLOW_TTL, generateRandomUUID(), {
                    expires: new Date(expire),
                    secure: true,
                    sameSite: "strict"
                });

                return new SuccessResponse(renderGetRedirect(`${this.getServerURL()}/fe/auth/signout`));
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
}
