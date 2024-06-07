import { expression } from "@blendsdk/expression";
import { HttpRequest } from "@blendsdk/webafx-common";
import { IPortaAccount } from "@porta/shared";
import { SysTenantDataService } from "../dataservices/SysTenantDataService";
import { ServiceBase } from "./ServiceBase";

export class DatabaseUtils extends ServiceBase {
    /**
     * Find the tenant by Key
     *
     * @param {string} tenantKeyOrName
     * @return {*}
     * @memberof DatabaseUtils
     */
    public findTenant(tenantKeyOrName: string) {
        const tenantDs = new SysTenantDataService(); // Query on master db
        return tenantDs.findByNameOrId({ name: tenantKeyOrName });
    }

    /**
     * Get the list of current tenants
     *
     * @return {*}
     * @memberof DatabaseUtils
     */
    public listTenants() {
        const tenantDs = new SysTenantDataService(); // Query on master db;
        const e = expression();
        return tenantDs.listSysTenantByExpression(e.createRenderer());
    }

    /**
     * Assets the tenant with the session tenant
     *
     * @param {string} tenant
     * @param {HttpRequest} req
     * @memberof DatabaseUtils
     */
    public assertTenant(tenant: string, req: HttpRequest) {
        const { tenant: sessionTenant } = req.context.getUser<IPortaAccount>();
        if (tenant !== sessionTenant.id) {
            throw new Error("Invalid or mismatch tenant");
        }
    }
}

export const databaseUtils = new DatabaseUtils();
