import { BadRequestResponse, Response, SuccessResponse } from "@blendsdk/webafx-common";
import { IFlowInfoRequest, IFlowInfoResponse } from "@porta/shared";
import { EndpointController } from "./EndpointControllerBase";

/**
 * Handle the FlowInfo endpoint
 *
 * @export
 * @class FlowInfoEndpointController
 * @extends {EndpointController}
 */
export class FlowInfoEndpointController extends EndpointController {
    /**
     * Handles the incoming request
     *
     * @param {IFlowInfoRequest} _params
     * @returns {Promise<Response<IFlowInfoResponse>>}
     * @memberof FlowInfoEndpointController
     */
    public async handleRequest(_params: IFlowInfoRequest): Promise<Response<IFlowInfoResponse>> {
        try {
            const {
                authRecord = undefined,
                tenantRecord = undefined,
                authRequest = undefined
            } = (await this.getCurrentAuthenticationFlow()) || {};
            if (authRecord && tenantRecord && authRequest) {
                return new SuccessResponse<IFlowInfoResponse>({
                    data: {
                        logo: authRecord.logo,
                        client_id: authRequest.client_id,
                        application_name: authRecord.application_name,
                        allow_registration: tenantRecord.allow_registration || false,
                        allow_reset_password: tenantRecord.allow_registration || false,
                        organization: tenantRecord.organization
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
