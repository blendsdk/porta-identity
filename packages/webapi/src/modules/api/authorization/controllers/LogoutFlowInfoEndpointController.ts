import { isNullOrUndef } from "@blendsdk/stdlib";
import { BadRequestResponse, Response, SuccessResponse } from "@blendsdk/webafx-common";
import { ILogoutFlowInfoRequest, ILogoutFlowInfoResponse } from "@porta/shared";
import { databaseUtils } from "../../../../utils";
import { EndpointController } from "./EndpointControllerBase";

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
            const { client_id, client, finalizeURL, flowId, tenant } = (await this.getCurrentLogoutFlow()) || {};
            if (client_id && tenant) {
                const tenantRecord = databaseUtils.findTenant(tenant);
                return new SuccessResponse<ILogoutFlowInfoResponse>({
                    data: {
                        logo: client.logo,
                        organization: (await tenantRecord).organization,
                        application_name: client.application_name,
                        finalize_url: finalizeURL,
                        has_post_redirect: !isNullOrUndef(client.post_logout_redirect_uri),
                        flowId
                    }
                });
            } else {
                return new BadRequestResponse(new Error("INVALID_REQUEST_NO_FLOW"));
            }
        } catch (err) {
            return new BadRequestResponse(err);
        }
    }
}
