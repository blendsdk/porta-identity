import { errorObjectInfo, ucFirst } from "@blendsdk/stdlib";
import { Response, ServerErrorResponse, SuccessResponse } from "@blendsdk/webafx-common";
import { ICreateTenantRequest, IInitializeRequest, IInitializeResponse, IOpsResponse } from "@porta/shared";
import { commonUtils } from "../../../utils";
import { DatabaseSeed } from "../../../utils/DatabaseSeed";
import { ApplicationControllerBase } from "./ApplicationControllerBase";

/**
 * @export
 * @abstract
 * @class ApplicationController
 * @extends {ApplicationControllerBase}
 */
export class ApplicationController extends ApplicationControllerBase {
    /**
     * @param {ICreateTenantRequest} params
     * @returns {Promise<Response<IOpsResponse>>}
     * @memberof ApplicationController
     */
    public async createTenant(params: ICreateTenantRequest): Promise<Response<IOpsResponse>> {
        try {
            let { password, email, allow_registration, allow_reset_password, name, organization } = params;
            name = name.toLocaleLowerCase();
            const databaseSeed = new DatabaseSeed();
            const tenantRecord = await databaseSeed.initializeTenant({
                allow_registration,
                allow_reset_password,
                databaseName: `porta_${name}`,
                organization,
                tenantName: name,
                username: email,
                password,
                email,
                serverURL: this.getServerUrl()
            });

            return new SuccessResponse({
                status: tenantRecord ? true : false,
                error: tenantRecord ? undefined : `${ucFirst(organization)} is already initialized!`,
                ...(tenantRecord || {})
            } as any);
        } catch (err) {
            this.getLogger().error(err.message, errorObjectInfo(err));
            return new ServerErrorResponse(err);
        }
    }

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
            this.getLogger().error(err.message, errorObjectInfo(err));
            return new ServerErrorResponse(err);
        }
    }
}
