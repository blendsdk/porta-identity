import { Response } from "@blendsdk/webafx-common";
import { IDiscoveryRequest, IDiscoveryResponse } from "@porta/shared";
import { AuthorizationControllerBase } from "./AuthorizationControllerBase";
import { DiscoveryEndpointController } from "./controllers/DiscoveryEndpointController";


/**
 * @export
 * @abstract
 * @class AuthorizationController
 * @extends {AuthorizationControllerBase}
 */
export class AuthorizationController extends AuthorizationControllerBase {
    /**
     * @param {IDiscoveryRequest} params
     * @return {*}  {Promise<Response<IDiscoveryResponse>>}
     * @memberof AuthorizationController
     */
    public discovery(params: IDiscoveryRequest): Promise<Response<IDiscoveryResponse>> {
        const subController = new DiscoveryEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);

    }
    /**
     * Creates a sub-controller config
     *
     * @protected
     * @returns
     * @memberof AuthorizationController
     */
    protected createSubControllerConfig() {
        return {
            request: this.request,
            response: this.response,
            ...this.request.context.services
        };
    }
}
