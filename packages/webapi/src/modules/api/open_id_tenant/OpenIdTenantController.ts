import { errorObjectInfo } from "@blendsdk/stdlib";
import { Response, ServerErrorResponse, SuccessResponse } from "@blendsdk/webafx-common";
import {
    ICreateOpenIdTenantRequest,
    ICreateOpenIdTenantResponse,
    IDeleteOpenIdTenantRequest,
    IDeleteOpenIdTenantResponse,
    IGetOpenIdTenantRequest,
    IGetOpenIdTenantResponse,
    IListOpenIdTenantRequest,
    IListOpenIdTenantResponse,
    IUpdateOpenIdTenantRequest,
    IUpdateOpenIdTenantResponse
} from "@porta/shared";
import { commonUtils, databaseUtils } from "../../../utils";
import { DatabaseSeed } from "../../../utils/DatabaseSeed";
import { OpenIdTenantControllerBase } from "./OpenIdTenantControllerBase";

/**
 * @export
 * @abstract
 * @class OpenIdTenantController
 * @extends {OpenIdTenantControllerBase}
 */
export class OpenIdTenantController extends OpenIdTenantControllerBase {
    /**
     * @param {IListOpenIdTenantRequest} _params
     * @return {*}  {Promise<Response<IListOpenIdTenantResponse>>}
     * @memberof OpenIdTenantController
     */
    public async listOpenIdTenant(_params: IListOpenIdTenantRequest): Promise<Response<IListOpenIdTenantResponse>> {
        try {
            const data = await databaseUtils.listTenants();
            const registry = commonUtils.getPortaRegistryTenant();
            // filter the registry tenant
            return new SuccessResponse<IListOpenIdTenantResponse>({
                data: data.filter((r) => {
                    return r.name !== registry;
                })
            });
        } catch (err) {
            this.getLogger().error(err.message, errorObjectInfo(err));
            return new ServerErrorResponse(err);
        }
    }

    /**
     * @param {IGetOpenIdTenantRequest} { name }
     * @return {*}  {Promise<Response<IGetOpenIdTenantResponse>>}
     * @memberof OpenIdTenantController
     */
    public async getOpenIdTenant({ id }: IGetOpenIdTenantRequest): Promise<Response<IGetOpenIdTenantResponse>> {
        try {
            const tenant = await databaseUtils.findTenant(id);
            return new SuccessResponse<IGetOpenIdTenantResponse>({ data: tenant });
        } catch (err) {
            this.getLogger().error(err.message, errorObjectInfo(err));
            return new ServerErrorResponse(err);
        }
    }

    public async createOpenIdTenant(
        params: ICreateOpenIdTenantRequest
    ): Promise<Response<ICreateOpenIdTenantResponse>> {
        try {
            const { allow_registration, allow_reset_password, email, name, organization, password } = params;

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
                serverURL: this.getServerURL()
            });

            return new SuccessResponse({
                status: tenantRecord ? true : false,
                error: tenantRecord ? undefined : "Tenant is already initialized!",
                ...(tenantRecord || {})
            } as any);
        } catch (err) {
            this.getLogger().error(err.message, errorObjectInfo(err));
            return new ServerErrorResponse(err);
        }
    }
    public updateOpenIdTenant(_params: IUpdateOpenIdTenantRequest): Promise<Response<IUpdateOpenIdTenantResponse>> {
        throw new Error("Method not implemented.");
    }

    /**
     * @param {IDeleteOpenIdTenantRequest} params
     * @return {*}  {Promise<Response<IDeleteOpenIdTenantResponse>>}
     * @memberof OpenIdTenantController
     */
    public async deleteOpenIdTenant(
        params: IDeleteOpenIdTenantRequest
    ): Promise<Response<IDeleteOpenIdTenantResponse>> {
        try {
            const { id } = params;
            const success = await databaseUtils.deleteTenant(id);
            return new SuccessResponse<IDeleteOpenIdTenantResponse>({
                data: {
                    message: undefined,
                    success
                }
            });
        } catch (err) {
            this.getLogger().error(err.message, errorObjectInfo(err));
            return new ServerErrorResponse(err);
        }
    }
}
