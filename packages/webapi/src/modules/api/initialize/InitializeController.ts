import { errorObjectInfo } from "@blendsdk/stdlib";
import { Response, ServerErrorResponse, SuccessResponse } from "@blendsdk/webafx-common";
import {
    ICreateTenantRequest,
    ICreateTenantResponse,
    IDeleteTenantRequest,
    IDeleteTenantResponse,
    IInitializeRequest,
    IInitializeResponse
} from "@porta/shared";
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
     * @param {IDeleteTenantRequest} params
     * @return {*}  {Promise<Response<IDeleteTenantResponse>>}
     * @memberof InitializeController
     */
    public async deleteTenant(params: IDeleteTenantRequest): Promise<Response<IDeleteTenantResponse>> {
        try {
            let { name, tenant } = params;

            const registry = commonUtils.getPortaRegistryTenant();

            // Only allow tenant deletion from if logged into the registry!
            // Do not delete the registry itself!
            if (
                tenant.toLocaleLowerCase() !== registry.toLocaleLowerCase() ||
                name.toLocaleLowerCase() === registry.toLocaleLowerCase() ||
                name.toLocaleLowerCase() === tenant.toLocaleLowerCase()
            ) {
                throw new Error(`Unable to delete a ${name} while authenticated with ${tenant}`);
            }

            const databaseSeed = new DatabaseSeed();

            await databaseSeed.deleteTenant(name);

            return new SuccessResponse({
                status: true,
                error: undefined
            } as any);
        } catch (err) {
            this.getLogger().error(err.message, errorObjectInfo(err));
            return new ServerErrorResponse(err);
        }
    }
    /**
     * @param {ICreateTenantRequest} params
     * @return {*}  {Promise<Response<ICreateTenantResponse>>}
     * @memberof InitializeController
     */
    public async createTenant(params: ICreateTenantRequest): Promise<Response<ICreateTenantResponse>> {
        try {
            let { email, password, username, organization, name, tenant } = params;

            const registry = commonUtils.getPortaRegistryTenant();

            // Only allow tenant registration from if logged into the registry!
            if (tenant.toLocaleLowerCase() !== registry.toLocaleLowerCase()) {
                throw new Error(`Unable to create a new tenant while authenticated with ${tenant}`);
            }

            username = username || email;

            const databaseSeed = new DatabaseSeed();

            const newTenant = await databaseSeed.initializeTenant({
                allow_registration: false,
                allow_reset_password: true,
                databaseName: undefined,
                organization,
                tenantName: name.toLowerCase(),
                username,
                password,
                email,
                serverURL: this.getServerURL(),
                conformanceTest: false
            });

            return new SuccessResponse({
                status: newTenant ? true : false,
                error: newTenant ? undefined : `${name} is already initialized!`,
                tenants: {
                    tenant: newTenant || {}
                }
            } as any);
        } catch (err) {
            this.getLogger().error(err.message, errorObjectInfo(err));
            return new ServerErrorResponse(err);
        }
    }

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
                serverURL: this.getServerURL(),
                conformanceTest: true
            });

            return new SuccessResponse({
                status: registry ? true : false,
                error: registry ? undefined : "Porta is already initialized!",
                tenants: {
                    registry: registry || {}
                }
            } as any);
        } catch (err) {
            this.getLogger().error(err.message, errorObjectInfo(err));
            return new ServerErrorResponse(err);
        }
    }
}
