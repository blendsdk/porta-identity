import { IDictionaryOf, asyncForEach } from "@blendsdk/stdlib";
import { renderGetRedirect } from "@blendsdk/webafx-auth-oidc";
import { Response, SuccessResponse } from "@blendsdk/webafx-common";
import { COOKIE_AUTH_FLOW, IAuthorizeRequest, IFinalizeRequest, IFinalizeResponse, ISysTenant } from "@porta/shared";
import { EndpointController, commonUtils } from "../../../../services";
import { IAuthorizationFlow, eErrorType, eOAuthResponseType } from "../../../../types";

/**
 * @export
 * @class FinalizeEndpointController
 * @extends {EndpointController}
 */
export class FinalizeEndpointController extends EndpointController {

    public async handleRequest(_params: IFinalizeRequest): Promise<Response<IFinalizeResponse>> {
        let flow: IAuthorizationFlow = undefined;

        const flowId = this.getCookie(COOKIE_AUTH_FLOW);

        // read the flow first
        flow = await this.getAuthenticationFlow(flowId);
        if (!flow) {
            return this.responseWithError({
                error: eErrorType.invalid_request,
                error_description: "invalid_af_flow",
            }, true);
        }

        const { authRequest } = flow;

        const response_types = this.parseResponseType(authRequest.response_type);
        const response: IDictionaryOf<string> = {};

        await asyncForEach(response_types, async (type) => {
            switch (type) {
                case eOAuthResponseType.code: {

                }
                    break;
                default:
                    throw new Error(`Response Type ${type} is not implemented yet!`);
            }
        });

        this.createSSOSession(flow.tenantRecord);
        this.clearAuthenticationFlowCookies();
        this.setNoCacheResponse();

        return new SuccessResponse(
            renderGetRedirect(
                this.createRedirectUri(authRequest, response)
            )
        );
    }

    protected createSSOSession(tenantRecord: ISysTenant) {
        const cookieId = commonUtils.createSessionCookieID(tenantRecord, this.request);
        this.setCookie(cookieId, "hello", {
            expires: new Date(commonUtils.expireSecondsFromNow(60)),
            httpOnly: true,
            secure: true,
            sameSite: "strict"
        });
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

        this.getLogger().debug("response_uri", { url: url.toString() });

        return url.toString();
    }
}