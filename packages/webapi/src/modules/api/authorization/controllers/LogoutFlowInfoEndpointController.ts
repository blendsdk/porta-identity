import { errorObjectInfo, isNullOrUndef } from "@blendsdk/stdlib";
import { BadRequestResponse, Response, SuccessResponse } from "@blendsdk/webafx-common";
import { COOKIE_AUTH_FLOW, ILogoutFlowInfoRequest, ILogoutFlowInfoResponse } from "@porta/shared";
import { databaseUtils, EndpointController, ILogoutFlow } from "../../../../services";

/**
 * Handle the Logout FlowInfo endpoint
 *
 * @export
 * @class LogoutFlowInfoEndpointController
 * @extends {EndpointController}
 */
export class LogoutFlowInfoEndpointController extends EndpointController {
    /**
     * Handles the incoming request
     *
     * @param {ILogoutFlowInfoRequest} _params
     * @returns {Promise<Response<ILogoutFlowInfoResponse>>}
     * @memberof LogoutFlowInfoEndpointController
     */
    public async handleRequest(_params: ILogoutFlowInfoRequest): Promise<Response<ILogoutFlowInfoResponse>> {
        try {
            const flowId: string = this.getCookie(COOKIE_AUTH_FLOW);
            let { tenant, application, client, expire } = (await this.getCache().getValue<ILogoutFlow>(flowId)) || {};
            const tenantRecord = await databaseUtils.findTenant(tenant);
            if (tenantRecord) {
                return new SuccessResponse<ILogoutFlowInfoResponse>({
                    data: {
                        logo: application?.logo,
                        organization: tenantRecord.organization,
                        application_name: application.application_name,
                        finalize_url: `${this.getServerURL()}/${tenant}/oauth2/logout?lf=${flowId}`,
                        has_post_redirect: !isNullOrUndef(client.post_logout_redirect_uri),
                        expires_in: expire - Date.now()
                    }
                });
            } else {
                return new BadRequestResponse(errorObjectInfo(new Error("INVALID_REQUEST_NO_FLOW")));
            }
        } catch (err) {
            return new BadRequestResponse(err);
        }
    }
}
