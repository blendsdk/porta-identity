import { errorObjectInfo } from "@blendsdk/stdlib";
import { Response, ServerErrorResponse, SuccessResponse } from "@blendsdk/webafx-common";
import { IInitializeRequest, IInitializeResponse } from "@porta/shared";
import { DatabaseSeed, commonUtils } from "../../../services";
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

            const databaseSeed = new DatabaseSeed();

            const registry = await databaseSeed.initializeTenant({
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
                status: registry ? true : false,
                error: registry ? undefined : "Porta is already initialized!",
                tenants: {
                    registry: registry || {},
                }
            } as any);
        } catch (err) {
            this.getLogger().error(err.message, errorObjectInfo(err));
            return new ServerErrorResponse(err);
        }
    }

}
