import { dataSourceManager } from "@blendsdk/datakit";
import { PostgreSQLDataSource } from "@blendsdk/postgresql";
import { ApplicationModule, IDatabaseAppSettings } from "@blendsdk/webafx";
import { IPortaApplicationSetting, eDatabaseType } from "../../types";

export class DatabaseModule extends ApplicationModule {
    onInitialize(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, PORTA_REGISTRY_TENANT, DB_DATABASE } =
                    this.application.getSettings<IDatabaseAppSettings & IPortaApplicationSetting>();

                /**
                 * This is the Porta Registry Database
                 */
                dataSourceManager.registerDataSource(
                    () => {
                        return new PostgreSQLDataSource({
                            host: DB_HOST,
                            port: DB_PORT,
                            user: DB_USER,
                            password: DB_PASSWORD,
                            database: PORTA_REGISTRY_TENANT
                        });
                    },
                    eDatabaseType.registry,
                    true // the default
                );

                /**
                 * Register the system database. This is usually an existing database
                 * with a super user account
                 */
                dataSourceManager.registerDataSource(
                    () => {
                        return new PostgreSQLDataSource({
                            host: DB_HOST,
                            port: DB_PORT,
                            user: DB_USER,
                            password: DB_PASSWORD,
                            database: DB_DATABASE
                        });
                    },
                    eDatabaseType.system,
                    false // not the default
                );
                resolve();
            } catch (err: any) {
                reject(err);
            }
        });
    }
}
