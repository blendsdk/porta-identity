import { PostgreSQLTypeFromQuery, refType } from "@blendsdk/codegen";
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
            query: `SELECT * FROM ${view.getName()} LIMIT 1`,
            createMapping: ({ columnName }) => {
                const viewName = view.getName();
                if (viewName === "sys_access_token_view" || viewName === "sys_refresh_token_view") {
                    switch (columnName) {
                        case "session":
                            return refType("sys_session");
                        case "user":
                            return refType("sys_user");
                        case "profile":
                            return refType("sys_profile");
                        case "client":
                            return refType("sys_client");
                        case "tenant":
                            return refType("sys_tenant");
                        case "auth_request_parameters":
                            return refType("any_index");
                    }
                }
                if (viewName === "sys_refresh_token_view") {
                    switch (columnName) {
                        case "application":
                            return refType("sys_application");
                        case "access_token":
                            return refType("sys_access_token");
                    }
                }
                return undefined;
            }
        });
    });

    await view2Type.cleanupAndClose();
}
