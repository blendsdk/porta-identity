import { generateRandomUUID } from "@blendsdk/crypto";
import { IDictionaryOf } from "@blendsdk/stdlib";
import { renderGetRedirect } from "@blendsdk/webafx-auth-oidc";
import { Response, SuccessResponse } from "@blendsdk/webafx-common";
import { COOKIE_AUTH_FLOW, IAuthorizeRequest, IFinalizeRequest, IFinalizeResponse, ISysAuthorizationView, ISysSession, ISysTenant, ISysUser } from "@porta/shared";
import { SysSessionDataService } from "../../../../dataservices/SysSessionDataService";
import { EndpointController, commonUtils, databaseUtils, formPostTemplate } from "../../../../services";
import { CONST_DAY_IN_SECONDS, CONST_OTA_TTL, IAuthorizationFlow, IPortaApplicationSetting, eErrorType, eOAuthPrompt, eOAuthResponseMode, eOAuthResponseType } from "../../../../types";

/**
 * @export
 * @class FinalizeEndpointController
 * @extends {EndpointController}
 */
export class FinalizeEndpointController extends EndpointController {

    /**
     * @protected
     * @param {ISysAuthorizationView} authRecord
     * @return {*} 
     * @memberof FinalizeEndpointController
     */
    protected createIDTokenLifeTime(authRecord: ISysAuthorizationView, session: ISysSession, authRequest: IAuthorizeRequest) {
        const { ACCESS_TOKEN_TTL } = this.getSettings<IPortaApplicationSetting>();
        let { access_token_length } = authRecord;
        access_token_length = parseFloat((access_token_length || ACCESS_TOKEN_TTL).toString());

        const isNewSession = commonUtils.checkLoginRequired(session, authRequest.max_age);
        const now = authRequest.prompt === eOAuthPrompt.none || (authRequest.max_age && !isNewSession) ? new Date(session.last_token_auth_time) : new Date();

        return {
            auth_time: now.toISOString(),
            date_expire: new Date(now.getTime() + commonUtils.secondsToMilliseconds(access_token_length)).toISOString()
        };
    }

    /**
     * @param {IFinalizeRequest} _params
     * @return {*}  {Promise<Response<IFinalizeResponse>>}
     * @memberof FinalizeEndpointController
     */
    public async handleRequest(_params: IFinalizeRequest): Promise<Response<IFinalizeResponse>> {
        let flow: IAuthorizationFlow = undefined;

        const flowId = this.getCookie(COOKIE_AUTH_FLOW);

        // read the flow first
        flow = await this.getAuthenticationFlow(flowId);
        if (!flow) {
            return this.responseWithError({
                error: eErrorType.invalid_request,
                error_description: "invalid_af_flow",
            });
        }

        const { authRequest, user, authRecord } = flow;
        const { response_type } = authRequest;

        // Create or update the session for this flow
        flow.session = await this.createOrUpdateSession(flow.tenantRecord, user);
        await this.updateFlow(flow);
        const { session, tenantRecord, profile } = flow;


        let fragmented: boolean = false;
        let fragment: IDictionaryOf<any>;
        let response: IDictionaryOf<any> = {};

        if (response_type === eOAuthResponseType.code) {
            // Just create the OTA
            response[response_type] = await this.createOTACode(flow);
        } else if (response_type === eOAuthResponseType.code_id_token) {
            // Create OTA and Id token (no access token)
            fragmented = true;
            const code = response[eOAuthResponseType.code] = await this.createOTACode(flow);
            const idTokenLifeTime = this.createIDTokenLifeTime(authRecord, session, authRequest);
            const result = await this.createTokens({
                flow,
                tokenRequest: { ...authRequest, grant_type: undefined },
                idTokenLifeTime,
                includeAccessToken: false, // no access token,
                idTokenPayload: await this.createIdTokenHeaderHashForKey("c_hash", code)
            });
            await databaseUtils.updateSessionLastTokenAuthTime(new Date(idTokenLifeTime.auth_time), session, tenantRecord);
            response = {
                code,
                ...result
            };
        } else if (response_type === eOAuthResponseType.code_token) {
            // Include OTA and access token (no id token)
            fragmented = true;
            const code = await this.createOTACode(flow);
            const result = await this.createTokens(
                {
                    flow,
                    tokenRequest: { ...authRequest, grant_type: undefined },
                    includeIdToken: false // no id token
                }
            );
            response = {
                code,
                ...result
            };
        } else if (response_type === eOAuthResponseType.code_id_token_token) {
            fragmented = true;
            const code = response[eOAuthResponseType.code] = await this.createOTACode(flow);
            const result = await this.createTokens(
                {
                    flow,
                    tokenRequest: { ...authRequest, grant_type: undefined },
                    idTokenPayload: await this.createIdTokenHeaderHashForKey("c_hash", code),
                    includeAtHash: true
                }
            );
            response = {
                code,
                ...result
            };
        } else if (response_type === eOAuthResponseType.id_token) {
            // Implicit flow
            fragmented = true;
            const idTokenLifeTime = this.createIDTokenLifeTime(authRecord, session, authRequest);
            const result = await this.createTokens({
                flow,
                tokenRequest: { ...authRequest, grant_type: undefined },
                idTokenLifeTime,
                includeAccessToken: false, // no access token,
                idTokenPayload: this.getClaimsByScope({
                    auth_request_params: authRequest,
                    user,
                    profile,
                    tenant: tenantRecord,
                    permissions: [],
                    roles: [],
                    application: {}
                })
            });

            // Since there is no access token to do this
            await databaseUtils.updateSessionLastTokenAuthTime(new Date(idTokenLifeTime.auth_time), session, tenantRecord);
            response = {
                ...result
            };
        } else if (response_type === eOAuthResponseType.id_token_token) {
            fragmented = true;
            const result = await this.createTokens(
                {
                    flow,
                    tokenRequest: { ...authRequest, grant_type: undefined },
                    includeAtHash: true
                }
            );
            response = {
                ...result
            };
        } else {
            throw new Error(`Response Type ${response_type} is not implemented yet!`);
        }

        // After this point we don't need any auth cookies
        this.clearAuthenticationFlowCookies();
        // Disable all caching        
        this.setNoCacheResponse();

        response = {
            state: authRequest.state,
            nonce: authRequest.nonce,
            ui_locales: authRequest.ui_locales,
            ...response,
        };

        /**
         * 3.2.2.5. Successful Authentication Response 
         * When using the form_post response mode, the parameters are encoded as HTML
         * form values that are auto-submitted in the User Agent using HTTP POST
         * method to the Client's Redirection URI.
         */
        if (fragmented && authRequest.response_mode !== eOAuthResponseMode.form_post) {
            fragment = { ...response };
            response = {};
        }

        const { redirect_uri } = authRequest;

        switch (authRequest.response_mode) {
            case eOAuthResponseMode.form_post: {
                return new SuccessResponse(formPostTemplate({
                    redirect_uri,
                    data: response,
                    fragment
                }));
            }
            default: {
                return new SuccessResponse(
                    renderGetRedirect(
                        this.createRedirectUri(redirect_uri, response, fragment)
                    )
                );
            }
        }

    }

    /**
     * @protected
     * @param {IAuthorizationFlow} flow
     * @return {*} 
     * @memberof FinalizeEndpointController
     */
    protected async createOTACode(flow: IAuthorizationFlow) {
        const code = generateRandomUUID();
        const expire = commonUtils.expireSecondsFromNow(CONST_OTA_TTL);
        await this.getCache().setValue(`auth_ota:${code}`, flow.flowId, {
            expire
        });
        return code;
    }

    /**
     * @protected
     * @param {ISysTenant} tenantRecord
     * @param {ISysUser} user
     * @memberof FinalizeEndpointController
     */
    protected async createOrUpdateSession(tenantRecord: ISysTenant, user: ISysUser) {
        const sessionDs = new SysSessionDataService({ tenantId: tenantRecord.id });
        const cookieId = commonUtils.createSessionCookieID(tenantRecord, this.request);
        let currentSessionId = this.getCookie(cookieId);
        let date_expire: Date = undefined;

        // Determine the expre_date of this session
        // If the session time is set to 0 then we allow one year as indetinate session length
        let sessionLength = tenantRecord.auth_session_length_hours;
        if (sessionLength === 0) {
            date_expire = new Date(commonUtils.expireSecondsFromNow(CONST_DAY_IN_SECONDS * 365)); // 1 year
        } else {
            date_expire = new Date(commonUtils.expireSecondsFromNow(CONST_DAY_IN_SECONDS * sessionLength));
        }

        // This check is for when the session record is deleted but there is a cookie.
        // Then we have to insert a new session record anyways
        let currentSessionRecord = await sessionDs.findSysSessionById({ id: currentSessionId });
        if (!currentSessionId || !currentSessionRecord) {
            const sessionRecord = await sessionDs.insertIntoSysSession({
                user_id: user.id,
                date_expire: date_expire ? date_expire.toISOString() : undefined
            });
            currentSessionId = sessionRecord.id;
            currentSessionRecord = sessionRecord;
        } else {
            currentSessionRecord = await sessionDs.updateSysSessionById({
                date_expire: date_expire.toISOString()
            }, { id: currentSessionId });
        }

        this.setCookie(cookieId, currentSessionId, {
            expires: date_expire,
            httpOnly: true,
            secure: true,
            sameSite: "lax"
        });

        this.cleanExpiredSessions();

        return currentSessionRecord;
    }
}