import { generateRandomUUID } from "@blendsdk/crypto";
import { IDictionaryOf, asyncForEach } from "@blendsdk/stdlib";
import { renderGetRedirect } from "@blendsdk/webafx-auth-oidc";
import { Response, SuccessResponse } from "@blendsdk/webafx-common";
import { COOKIE_AUTH_FLOW, IAuthorizeRequest, IFinalizeRequest, IFinalizeResponse, ISysTenant, ISysUser } from "@porta/shared";
import { SysSessionDataService } from "../../../../dataservices/SysSessionDataService";
import { EndpointController, commonUtils } from "../../../../services";
import { CONST_DAY_IN_SECONDS, CONST_OTA_TTL, IAuthorizationFlow, eErrorType, eOAuthResponseType } from "../../../../types";

/**
 * @export
 * @class FinalizeEndpointController
 * @extends {EndpointController}
 */
export class FinalizeEndpointController extends EndpointController {

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

        const { authRequest, user } = flow;

        const response_types = this.parseResponseType(authRequest.response_type);
        const response: IDictionaryOf<string> = {};

        await asyncForEach(response_types, async (type) => {
            switch (type) {
                case eOAuthResponseType.code:
                    response[type] = await this.createOTACode(flow);
                    break;
                default:
                    throw new Error(`Response Type ${type} is not implemented yet!`);
            }
        });

        // Create or update the session for this flow
        flow.session = await this.createOrUpdateSession(flow.tenantRecord, user);
        await this.updateFlow(flow);

        // After this point we don't need any auth cookies
        this.clearAuthenticationFlowCookies();
        // Disable all caching        
        this.setNoCacheResponse();

        return new SuccessResponse(
            renderGetRedirect(
                this.createRedirectUri(authRequest, response)
            )
        );
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

    protected async cleanExpiredSessions() {
        return null;
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

    /**
     * @protected
     * @param {IAuthorizationFlow} flow
     * @return {*} 
     * @memberof FinalizeEndpointController
     */
    protected createRedirectUri(authRequest: IAuthorizeRequest, response: IDictionaryOf<string>) {

        const url = new URL(authRequest.redirect_uri);
        if (authRequest.state) {
            url.searchParams.append("state", authRequest.state);
        }

        if (authRequest.ui_locales) {
            url.searchParams.append("ui_locales", authRequest.ui_locales);
        }

        if (authRequest.nonce) {
            url.searchParams.append("nonce", authRequest.nonce);
        }

        Object.entries(response).forEach(([key, value]) => {
            url.searchParams.append(key, value);
        });

        return url.toString();
    }
}