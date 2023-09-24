import { ApplicationControllerBase } from "./ApplicationControllerBase";
import { commonUtils } from "../../../utils";
import { DatabaseSeed } from "../../../utils/DatabaseSeed";
import { IInitializeRequest, IInitializeResponse } from "@porta/shared";
import { Response, ServerErrorResponse, SuccessResponse } from "@blendsdk/webafx-common";

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

            const databaseSeed = new DatabaseSeed();
            const tenantRecord = await databaseSeed.initializeTenant({
                admin_password: password,
                admin_user: username,
                allow_registration: false,
                allow_reset_password: true,
                databaseName: commonUtils.getPortaRegistryTenant(),
                organization: "Porta Registry",
                tenantName: commonUtils.getPortaRegistryTenant(),
                username,
                password,
                email,
                serverURL: this.getServerUrl()
            });

            return new SuccessResponse({
                status: tenantRecord ? true : false,
                error: tenantRecord ? undefined : "Porta is already initialized!",
                ...(tenantRecord || {})
            } as any);
        } catch (err) {
            return new ServerErrorResponse(err);
        }
    }
}
