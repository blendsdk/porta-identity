import { errorObjectInfo } from "@blendsdk/stdlib";
import { Response, ServerErrorResponse, SuccessResponse } from "@blendsdk/webafx-common";
import { IInitializeRequest, IInitializeResponse } from "@porta/shared";
import { commonUtils } from "../../../services";
import { databaseSeed } from "../../../services/DatabaseSeed";
import { InitializeControllerBase } from "./InitializeControllerBase";

/**
 * @export
 * @abstract
 * @class InitializeController
 * @extends {InitializeControllerBase}
 */
export class InitializeController extends InitializeControllerBase {
    /**
     * @param {IInitializeRequest} params
     * @return {*}  {Promise<Response<IInitializeResponse>>}
     * @memberof InitializeController
     */
    public async initialize(params: IInitializeRequest): Promise<Response<IInitializeResponse>> {
        try {
            let { email, password, username } = params;

            username = username || email;

            const tenantRecord = await databaseSeed.initializeTenant({
                allow_registration: false,
                allow_reset_password: true,
                databaseName: commonUtils.getPortaRegistryTenant(),
                organization: "Porta Registry",
                tenantName: commonUtils.getPortaRegistryTenant(),
                username,
                password,
                email,
                serverURL: this.getServerURL()
            });

            return new SuccessResponse({
                status: tenantRecord ? true : false,
                error: tenantRecord ? undefined : "Porta is already initialized!",
                ...(tenantRecord || {})
            } as any);
        } catch (err) {
            this.getLogger().error(err.message, errorObjectInfo(err));
            return new ServerErrorResponse(err);
        }
    }

}
