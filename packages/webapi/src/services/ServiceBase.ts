import { dataSourceManager } from "@blendsdk/datakit";
import { PostgreSQLDataSource } from "@blendsdk/postgresql";
import { IDatabaseAppSettings } from "@blendsdk/webafx";
import { HttpRequest } from "@blendsdk/webafx-common";
import { databaseUtils } from "./DatabaseUtils";

export abstract class ServiceBase {
    /**
     * @param {string} tenant
     * @param {HttpRequest} req
     * @return {*}
     * @memberof ServiceBase
     */
    public async initDataSource(tenant: string, req: HttpRequest) {
        let dataSource: PostgreSQLDataSource = dataSourceManager.getDataSource(tenant);
        if (!dataSource) {
            const tenantRecord = await databaseUtils.findTenant(tenant);
            if (tenantRecord) {
                // now check to fint the datasource by its id. this is because `tenant` could be the name
                dataSource = dataSourceManager.getDataSource(tenantRecord.id);
                if (!dataSource) {
                    dataSourceManager.registerDataSource(() => {
                        const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD } = req.context.getSettings<IDatabaseAppSettings>();
                        return new PostgreSQLDataSource({
                            host: DB_HOST,
                            port: DB_PORT,
                            user: DB_USER,
                            password: DB_PASSWORD,
                            database: tenantRecord.database
                        });
                    }, tenantRecord.id);
                    dataSource = dataSourceManager.getDataSource(tenant) || dataSourceManager.getDataSource(tenantRecord.id);
                }
            } else {
                throw new Error("UNKNOWN_TENANT");
            }
        }
        return dataSource;
    }

    protected async getTenantDataSource(tenant: string) {
        return dataSourceManager.getDataSource(tenant);
    }
}
