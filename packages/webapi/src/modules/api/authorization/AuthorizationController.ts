import { Response } from "@blendsdk/webafx-common";
import { AuthorizationControllerBase } from "./AuthorizationControllerBase";
import { AuthorizeEndpointController } from "./controllers/AuthorizeEndpointController";
import { DiscoveryEndpointController } from "./controllers/DiscoveryEndpointController";
import { FlowEndpointController } from "./controllers/FlowEndpointController";
import { JWKSEndpointController } from "./controllers/JWKSEndpointController";
import { ICheckSetFlowRequest, ICheckSetFlowResponse, IAuthorizeRequest, IAuthorizeResponse, IDiscoveryKeysRequest, IDiscoveryKeysResponse, IDiscoveryRequest, IDiscoveryResponse } from "@porta/shared";


/**
 * @export
 * @abstract
 * @class AuthorizationController
 * @extends {AuthorizationControllerBase}
 */
export class AuthorizationController extends AuthorizationControllerBase {

    /**
     * @param {ICheckSetFlowRequest} params
     * @return {*}  {Promise<Response<ICheckSetFlowResponse>>}
     * @memberof AuthorizationController
     */
    public checkSetFlow(params: ICheckSetFlowRequest): Promise<Response<ICheckSetFlowResponse>> {
        const subController = new FlowEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
    /**
     * @param {IAuthorizeRequest} params
     * @return {*}  {Promise<Response<IAuthorizeResponse>>}
     * @memberof AuthorizationController
     */
    public authorize(params: IAuthorizeRequest): Promise<Response<IAuthorizeResponse>> {
        const subController = new AuthorizeEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
    /**
     * @param {IDiscoveryKeysRequest} params
     * @return {*}  {Promise<Response<IDiscoveryKeysResponse>>}
     * @memberof AuthorizationController
     */
    public discoveryKeys(params: IDiscoveryKeysRequest): Promise<Response<IDiscoveryKeysResponse>> {
        const subController = new JWKSEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }
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
