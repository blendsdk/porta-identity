import { PostgreSQLTypeFromQuery } from "@blendsdk/codegen";
import { asyncForEach } from "@blendsdk/stdlib";
import { dataSourceConfig } from "../config";
import { consoleLogger, database, typeSchema } from "./lib";

/**
 * Generate views defined in the database
 *
 * @export
 */
export async function createViews() {
    // Create a view to type builder
    const view2Type = new PostgreSQLTypeFromQuery({
        dataSourceConfig,
        databaseSchema: database,
        typeSchema,
        logger: consoleLogger
    });

    // Create the types for the views
    await asyncForEach(database.getViews(), async (view) => {
        await view2Type.typeFromQuery({
            name: view.getName(),
            query: `SELECT * FROM ${view.getName()} LIMIT 1`
        });
    });

    await view2Type.cleanupAndClose();
}
