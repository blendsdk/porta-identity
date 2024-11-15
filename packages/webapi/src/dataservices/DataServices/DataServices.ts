import { PostgreSQLDataSource } from "@blendsdk/postgresql";
import { HttpRequest } from "@blendsdk/webafx-common";
import { databaseUtils } from "../../services";
import { DataServicesBase } from "./DataServicesBase";

export interface ISystemConfig { }

export class DataServices extends DataServicesBase {
    /**
     * Reference to the system config
     *
     * @protected
     * @type {ISystemConfig}
     * @memberof DataServices
     */
    protected sysConfig: ISystemConfig;

    /**
     * Reference to the tenant
     *
     * @protected
     * @type {string}
     * @memberof DataServices
     */
    protected tenant: string;
    /**
     * Reference to the current request
     *
     * @protected
     * @type {HttpRequest}
     * @memberof DataServices
     */
    protected request: HttpRequest;
    /**
     * Flag to indicate to skip the tenant<->session assertion
     *
     * @protected
     * @type {boolean}
     * @memberof DataServices
     */
    protected assert: boolean;

    /**
     * Creates an instance of DataServices.
     * @param {string} tenant
     * @param {HttpRequest} request
     * @memberof DataServices
     */
    public constructor(tenant: string, request: HttpRequest, skipAssertion?: boolean) {
        super();
        this.tenant = tenant;
        this.request = request;
        this.assert = skipAssertion === true ? false : true;
    }

    /**
     * @param {string} tenantNameOrId
     * @return {*} 
     * @memberof DataServices
     */
    public getTenant(tenantNameOrId: string) {
        return databaseUtils.findTenant(tenantNameOrId);
    }

    /**
     * @protected
     * @return {*}  {Promise<PostgreSQLDataSource>}
     * @memberof DataServices
     */
    protected async initDataSource(): Promise<PostgreSQLDataSource> {
        const dataSource = await databaseUtils.initDataSource(this.tenant, this.request);
        if (this.assert) {
            databaseUtils.assertTenant(this.tenant, this.request);
        }
        return dataSource;
    }
}

