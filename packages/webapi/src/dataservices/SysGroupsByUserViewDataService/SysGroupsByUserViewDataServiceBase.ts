import { DataService } from "@blendsdk/datakit";
import { PostgreSQLExecutionContext } from "@blendsdk/postgresql";

/**
 * Provides functionality to get data from sys_groups_by_user_view view
 * @export
 * @abstract
 * @class
 * @extends {DataService<PostgreSQLExecutionContext>}
 */
export abstract class SysGroupsByUserViewDataServiceBase extends DataService<PostgreSQLExecutionContext> {}
