import { dataSourceManager } from "@blendsdk/datakit";
import { PostgreSQLDataSource } from "@blendsdk/postgresql";
import { ApplicationModule, IDatabaseAppSettings } from "@blendsdk/webafx";

export class DatabaseModule extends ApplicationModule {
    onInitialize(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                dataSourceManager.registerDataSource(() => {
                    const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE } = this.application.getSettings<IDatabaseAppSettings>();
                    return new PostgreSQLDataSource({
                        host: DB_HOST,
                        port: DB_PORT,
                        user: DB_USER,
                        password: DB_PASSWORD,
                        database: DB_DATABASE
                    });
                }, "default");
                resolve();
            } catch (err: any) {
                reject(err);
            }
        });
    }
}
