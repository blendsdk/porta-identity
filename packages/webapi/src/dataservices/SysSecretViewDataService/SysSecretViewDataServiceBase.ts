import { DataService } from "@blendsdk/datakit";
import { PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to get data from sys_secret_view view
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysSecretViewDataServiceBase extends DataService<PostgreSQLExecutionContext> {}
