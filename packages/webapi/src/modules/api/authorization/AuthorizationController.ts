import { Response } from "@blendsdk/webafx-common";
import { IAuthorizeRequest, IAuthorizeResponse, ICheckSetFlowRequest, ICheckSetFlowResponse, IDiscoveryKeysRequest, IDiscoveryKeysResponse, IDiscoveryRequest, IDiscoveryResponse, IFinalizeRequest, IFinalizeResponse, ITokenRequest, ITokenResponse } from "@porta/shared";
import { AuthorizationControllerBase } from "./AuthorizationControllerBase";
import { AuthenticateEndpointController } from "./controllers/AuthenticateEndpointController";
import { AuthorizeEndpointController } from "./controllers/AuthorizeEndpointController";
import { DiscoveryEndpointController } from "./controllers/DiscoveryEndpointController";
import { FinalizeEndpointController } from "./controllers/FinalizeEndpointController";
import { JWKSEndpointController } from "./controllers/JWKSEndpointController";
import { TokenEndpointController } from "./controllers/TokenEndpointController";


/**
 * @export
 * @abstract
 * @class AuthorizationController
 * @extends {AuthorizationControllerBase}
 */
export class AuthorizationController extends AuthorizationControllerBase {
    public token(params: ITokenRequest): Promise<Response<ITokenResponse>> {
        const subController = new TokenEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);

    }

    /**
     * @param {IFinalizeRequest} params
     * @return {*}  {Promise<Response<IFinalizeResponse>>}
     * @memberof AuthorizationController
     */
    public finalize(params: IFinalizeRequest): Promise<Response<IFinalizeResponse>> {
        const subController = new FinalizeEndpointController(this.createSubControllerConfig());
        return subController.handleRequest(params);
    }

    /**
     * @param {ICheckSetFlowRequest} params
     * @return {*}  {Promise<Response<ICheckSetFlowResponse>>}
     * @memberof AuthorizationController
     */
    public checkSetFlow(params: ICheckSetFlowRequest): Promise<Response<ICheckSetFlowResponse>> {
        const subController = new AuthenticateEndpointController(this.createSubControllerConfig());
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
