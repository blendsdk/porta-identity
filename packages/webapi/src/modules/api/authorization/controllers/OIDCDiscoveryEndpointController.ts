import { BadRequestResponse, Response, SuccessResponse } from "@blendsdk/webafx-common";
import { IOidcDiscoveryRequest, IOidcDiscoveryResponse } from "@porta/shared";
import { SysTenantDataService } from "../../../../dataservices/SysTenantDataService";
import {
    eOAuthClaims,
    eOAuthGrantType,
    eOAuthResponseType,
    eOAuthScope,
    eOAuthSigningAlg,
    eOAuthTokenEndpointAuthMethods
} from "../../../../types";
import { EndpointController } from "./EndpointControllerBase";

/**
 * Handler for the discovery endpoint
 *
 * @export
 * @class OIDCDiscoveryEndpointController
 * @extends {EndpointController}
 */
export class OIDCDiscoveryEndpointController extends EndpointController {
    /**
     * @param {IOidcDiscoveryRequest} { tenant }
     * @returns {Promise<Response<IOidcDiscoveryResponse>>}
     * @memberof OIDCDiscoveryEndpointController
     */
    public async handleRequest({ tenant }: IOidcDiscoveryRequest): Promise<Response<IOidcDiscoveryResponse>> {
        const tenantDs = new SysTenantDataService();
        const tenantRecord = await tenantDs.findByNameOrId({ name: tenant });
        if (tenantRecord) {
            return new SuccessResponse<IOidcDiscoveryResponse>({
                authorization_endpoint: `${this.getServerUrl()}/${tenant}/oauth2/authorize`,
                token_endpoint: `${this.getServerUrl()}/${tenant}/oauth2/token`,
                grant_types_supported: Object.keys(eOAuthGrantType),
                issuer: this.getIssuer(tenant),
                jwks_uri: `${this.getServerUrl()}/${tenant}/oauth2/discovery/keys`,
                response_types_supported: Object.keys(eOAuthResponseType),
                id_token_signing_alg_values_supported: Object.keys(eOAuthSigningAlg),
                userinfo_endpoint: `${this.getServerUrl()}/${tenant}/oauth2/me`,
                subject_types_supported: ["pairwise"],
                scopes_supported: Object.keys(eOAuthScope),
                claims_supported: Object.keys(eOAuthClaims),
                token_endpoint_auth_methods_supported: Object.keys(eOAuthTokenEndpointAuthMethods),
                request_parameter_supported: true
            } as any);
        } else {
            return new BadRequestResponse({
                message: "INVALID_REQUEST",
                cause: `Invalid tenant ${tenant}`
            });
        }
    }
}
