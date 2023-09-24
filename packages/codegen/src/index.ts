import { EnumBuilder, createMethodName, databaseToSchema } from "@blendsdk/codegen";
import * as path from "path";
import { createAPISchema } from "./api";
import { createCustomTypes } from "./customtypes";
import { createDatabaseSchema } from "./database";
import { createDataServices } from "./dataservice";
import { consoleLogger, database, typeBuilder, typeSchema, writeFileSync } from "./lib";
import { clean_generated } from "./lib/clean";

const WebApiRoot: string = path.join(process.cwd(), "..", "webapi");
const WebClientRoot: string = path.join(process.cwd(), "..", "webclient");
const WebClientAdminRoot: string = path.join(process.cwd(), "..", "webclient-admin");
const WebClientAccountRoot: string = path.join(process.cwd(), "..", "webclient-account");
const SharedRoot: string = path.join(process.cwd(), "..", "shared");
const packageScope = "@porta";

async function generate() {
    clean_generated();

    createCustomTypes(0);

    // Create the database schema definitions
    await createDatabaseSchema(database, path.join(process.cwd(), "resources"));

    // Convert the database schema to json schema
    databaseToSchema(database, typeSchema);

    createCustomTypes(1);

    const ds = await createDataServices(database, typeSchema);
    ds.writeOut(path.join(WebApiRoot, "src", "dataservices"));

    // Create the API schema definitions
    const apiBuilder = createAPISchema(typeSchema, typeBuilder);

    // Build TypeScriptTypes
    const {
        types,
        database: dbs,
        request_response
    } = typeBuilder.build(typeSchema.getSchema(), {
        importMapper: (from: string) => {
            switch (from) {
                case "database":
                    return "./generated_database_types";
                case "types":
                    return "./generated_types";
                default:
                    return from;
            }
        }
    });

    const { schema, views } = database.getSchemaSQL();

    // Write the database SQL script to file
    writeFileSync(path.join(WebApiRoot, "resources", "database", "schema.sql"), schema.join(";\n"));
    writeFileSync(path.join(WebApiRoot, "resources", "database", "views.sql"), views.join(";\n"));

    // Write the TypeScript types to file
    writeFileSync(path.join(SharedRoot, "src", "types", "generated_types.ts"), types || "export {}");
    writeFileSync(path.join(SharedRoot, "src", "types", "generated_database_types.ts"), dbs || "export {}");
    writeFileSync(
        path.join(SharedRoot, "src", "types", "generated_request_response_types.ts"),
        request_response || "export {}"
    );

    // Write TypeScript route definitions to file
    writeFileSync(
        path.join(WebApiRoot, "src", "types", `generated_validation_schema.ts`),
        typeSchema.toSource("validationSchema")
    );

    apiBuilder.writeOut(path.join(WebApiRoot, "src", "modules", "api"));

    // Create route definitions
    writeFileSync(
        path.join(WebApiRoot, "src", "types", `generated_route_definitions.ts`),
        apiBuilder.getSharedRouteDefinitions()
    );

    const enumBuilder = new EnumBuilder({ logger: consoleLogger, typeSchema });
    // create enums
    writeFileSync(path.join(SharedRoot, "src", "types", "generated_enums.ts"), enumBuilder.build());

    // create i18n keys
    writeFileSync(
        path.join(SharedRoot, "src", "types", "generated_i18n_keys.ts"), //
        enumBuilder.buildFromI18nFile(path.join(process.cwd(), "resources", "**", "*.i18n.json"))
    );

    // write the client both to the webclient and also to the webapi for tests
    const { code, variableInterfaceName, variableName } = apiBuilder.getClientSideAPI(
        createMethodName("porta_api", false),
        "@porta/shared"
    );
    [
        path.join(WebClientRoot, "src", "application", "api", "generated_rest_api.ts"),
        path.join(WebClientAdminRoot, "src", "application", "api", "generated_rest_api.ts"),
        path.join(WebClientAccountRoot, "src", "application", "api", "generated_rest_api.ts"),
        path.join(WebApiRoot, "src", "tests", "api", "generated_rest_api.ts")
    ].forEach((target) => {
        writeFileSync(target, code);
    });

    [
        path.join(WebClientRoot, "src", "system", "api", "generated_api.ts"),
        path.join(WebClientAdminRoot, "src", "system", "api", "generated_api.ts"),
        path.join(WebClientAccountRoot, "src", "system", "api", "generated_api.ts")
    ].forEach((outFile) => {
        writeFileSync(
            outFile,
            [
                `// Generated on ${new Date().toISOString()}`,
                ``,
                `import { I18NKeys } from "${packageScope}/shared";`,
                `import { ${variableInterfaceName}, ${variableName} } from "../../application/api";`,
                ``,
                `export interface IApplicationI18NKeys extends I18NKeys {}`,
                `export interface IApplicationApi extends ${variableInterfaceName} {}`,
                ``,
                `export const ApplicationApi = ${variableName};`
            ].join("\n")
        );
    });
}

(async () => {
    await generate();
})();
