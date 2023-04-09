import { BadRequestResponse, Response, SuccessResponse } from "@blendsdk/webafx-common";
import { ILogoutFlowInfoRequest, ILogoutFlowInfoResponse } from "@porta/shared";
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
            const { client_id, client } = (await this.getCurrentLogoutFlow()) || {};
            if (client_id) {
                return new SuccessResponse<ILogoutFlowInfoResponse>({
                    data: {
                        logo: client.logo,
                        organization: "organization->TODO",
                        application_name: client.application_name
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
