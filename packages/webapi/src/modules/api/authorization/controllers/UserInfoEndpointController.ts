import { Response, SuccessResponse } from "@blendsdk/webafx-common";
import { IPortaAccount, IUserInfoGet, IUserInfoGetResponse } from "@porta/shared";
import { SysTenantDataService } from "../../../../dataservices/SysTenantDataService";
import { EndpointController } from "../../../../services";
import { eErrorType } from "../../../../types";

/**
 * Handler for the user_info endpoint
 *
 * @export
 * @class UserInfoEndpointController
 * @extends {EndpointController}
 */
export class UserInfoEndpointController extends EndpointController {
    /**
     * @param {IUserInfoRequest} params
     * @returns {Promise<Response<IUserInfoResponse>>}
     * @memberof UserInfoEndpointController
     */
    public async handleRequest(
        _params: IUserInfoGet
    ): Promise<Response<IUserInfoGetResponse>> {
        const sessionStorage = this.getContext().getSessionStorage<IPortaAccount>();
        const { tenant } = sessionStorage || {};
        const tenantDs = new SysTenantDataService();
        const tenantRecord = await tenantDs.findSysTenantById({ id: tenant.id });

        if (!tenantRecord) {
            return this.responseWithError({
                error: eErrorType.invalid_tenant,
                error_description: tenant.name
            }, true);
        }

        return new SuccessResponse(this.getClaimsByScope(sessionStorage));

    }
}
