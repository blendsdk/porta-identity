import { Database, PostgreSQLDataServiceBuilder, TypeSchema } from "@blendsdk/codegen";
import { dataSourceConfig } from "../config";
import { createCrudDataServices } from "../dataservice/crud";

/**
 * Creates DataServices
 *
 * @export
 * @param {Database} databaseSchema
 * @param {TypeSchema} typeSchema
 * @returns
 */
export async function createDataServices(databaseSchema: Database, typeSchema: TypeSchema) {
    const builder = new PostgreSQLDataServiceBuilder({
        typeSchema,
        databaseSchema,
        dataSourceConfig,
        importMapper: (from: string) => {
            switch (from) {
                case "database":
                    return "@porta/shared";
                default:
                    return from;
            }
        }
    });

    createCrudDataServices(databaseSchema, builder);

    return builder.build();
}
