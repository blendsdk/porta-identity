import { Response, SuccessResponse } from "@blendsdk/webafx-common";
import { IDiscoveryRequest, IDiscoveryResponse } from "@porta/shared";
import { EndpointController } from "../../../../services";
import {
    eErrorType,
    eOAuthClaims,
    eOAuthGrantType,
    eOAuthResponseType,
    eOAuthScope,
    eOAuthSigningAlg,
    eOAuthTokenEndpointAuthMethods
} from "../../../../types";

/**
 * Handler for the discovery endpoint
 *
 * @export
 * @class DiscoveryEndpointController
 * @extends {EndpointController}
 */
export class DiscoveryEndpointController extends EndpointController {
    /**
     *
     *
     * @param {IDiscoveryRequest} { tenant }
     * @return {*}  {Promise<Response<IDiscoveryResponse>>}
     * @memberof DiscoveryEndpointController
     */
    public async handleRequest({ tenant }: IDiscoveryRequest): Promise<Response<IDiscoveryResponse>> {

        const tenantRecord = await this.getTenantRecord(tenant);

        if (!tenantRecord) {
            return this.responseWithError({
                error: eErrorType.invalid_tenant,
                error_description: tenant
            }, true);
        }

        return new SuccessResponse<IDiscoveryResponse>({
            authorization_endpoint: `${this.getServerURL()}/${tenant}/oauth2/authorize`,
            token_endpoint: `${this.getServerURL()}/${tenant}/oauth2/token`,
            grant_types_supported: Object.keys(eOAuthGrantType),
            issuer: this.getIssuer(tenant),
            jwks_uri: `${this.getServerURL()}/${tenant}/oauth2/discovery/keys`,
            response_types_supported: Object.keys(eOAuthResponseType),
            id_token_signing_alg_values_supported: Object.keys(eOAuthSigningAlg),
            userinfo_endpoint: `${this.getServerURL()}/${tenant}/oauth2/me`,
            subject_types_supported: ["pairwise"],
            scopes_supported: Object.keys(eOAuthScope),
            claims_supported: Object.keys(eOAuthClaims),
            token_endpoint_auth_methods_supported: Object.keys(eOAuthTokenEndpointAuthMethods),
            request_object_signing_alg_values_supported: Object.keys(eOAuthSigningAlg),
            request_parameter_supported: true,
            end_session_endpoint: `${this.getServerURL()}/${tenant}/oauth2/logout`,
            introspection_endpoint: `${this.getServerURL()}/${tenant}/oauth2/token_info`
        } as any);
    }
}
