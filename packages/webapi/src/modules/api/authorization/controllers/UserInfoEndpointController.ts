import { Response, SuccessResponse } from "@blendsdk/webafx-common";
import { IUserInfoGet, IUserInfoGetResponse, IUserInfoPost, IUserInfoPostRequest } from "@porta/shared";
import { SysTenantDataService } from "../../../../dataservices/SysTenantDataService";
import { IPortaSessionStorage } from "../../../../types";
import { EndpointController } from "./EndpointControllerBase";

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
        _params: IUserInfoGet | IUserInfoPost
    ): Promise<Response<IUserInfoGetResponse | IUserInfoPostRequest>> {
        const sessionStorage = this.getContext().getSessionStorage<IPortaSessionStorage>();
        const { tenant } = sessionStorage || {};
        const tenantDs = new SysTenantDataService();
        const tenantRecord = await tenantDs.findSysTenantById({ id: tenant.id });
        return new SuccessResponse(this.getClaimsByScope(sessionStorage, tenantRecord.name));
    }
}
