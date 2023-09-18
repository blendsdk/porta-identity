import { Response, ServerErrorResponse, SuccessResponse } from "@blendsdk/webafx-common";
import { ApplicationControllerBase } from "./ApplicationControllerBase";
import { IInitializeRequest, IInitializeResponse } from "@porta/shared";
import { commonUtils, databaseUtils } from "../../../utils";
import { IDatabaseAppSettings } from "@blendsdk/webafx";
import { IPortaApplicationSetting } from "../../../types";

/**
 * @export
 * @abstract
 * @class ApplicationController
 * @extends {ApplicationControllerBase}
 */
export class ApplicationController extends ApplicationControllerBase {
    /**
     * Initializes the Porta Registry Tenant
     *
     * @param {IInitializeRequest} {key}
     * @returns {Promise<Response<IInitializeResponse>>}
     * @memberof ApplicationController
     */
    public async initialize({ username, email, password }: IInitializeRequest): Promise<Response<IInitializeResponse>> {
        try {
            username = username || email;

            const { PORTA_REGISTRY_TENANT } = this.request.context.getSettings<
                IPortaApplicationSetting & IDatabaseAppSettings
            >();

            const status = await databaseUtils.initializeTenant(
                commonUtils.getPortaRegistryTenant(),
                PORTA_REGISTRY_TENANT,
                "Porta Registry",
                false,
                true,
                username,
                password,
                this.getContext().getServerURL()
            );

            return new SuccessResponse<IInitializeResponse>({
                data: {
                    status,
                    error: status ? undefined : "Porta is already initialized!"
                }
            });
        } catch (err) {
            return new ServerErrorResponse(err);
        }
    }
}
