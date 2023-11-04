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
const CLIRoot: string = path.join(process.cwd(), "..", "cli");
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
    } = await typeBuilder.build(typeSchema.getSchema(), {
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
        await typeSchema.toSource("validationSchema")
    );

    apiBuilder.writeOut(path.join(WebApiRoot, "src", "modules", "api"));

    const permissions = await apiBuilder.getPermissionsAbdRoles({
        roles: [
            {
                role: "system_users"
            },
            {
                role: "system_admins"
            },
            {
                role: "system_api"
            }
        ],
        permissions: [
            {
                permission: "ROLE_PERMISSION",
                description: "internal_role_permission"
            },
            {
                permission: "CAN_MANAGE_TENANTS",
                description: "permission_to_manage_tenants"
            }
        ]
    });
    if (permissions) {
        writeFileSync(path.join(SharedRoot, "src", "types", `generated_permissions.ts`), permissions);
    }

    // Create route definitions
    writeFileSync(
        path.join(WebApiRoot, "src", "types", `generated_route_definitions.ts`),
        await apiBuilder.getSharedRouteDefinitions()
    );

    const enumBuilder = new EnumBuilder({ logger: consoleLogger, typeSchema });
    // create enums
    writeFileSync(path.join(SharedRoot, "src", "types", "generated_enums.ts"), await enumBuilder.build());

    // create i18n keys
    writeFileSync(
        path.join(SharedRoot, "src", "types", "generated_i18n_keys.ts"), //
        await enumBuilder.buildFromI18nFile(path.join(process.cwd(), "resources", "**", "*.i18n.json"))
    );

    // write the client both to the webclient and also to the webapi for tests
    const { code, variableInterfaceName, variableName } = await apiBuilder.getClientSideAPI(
        createMethodName("porta_api", false),
        "@porta/shared"
    );
    [
        path.join(WebClientRoot, "src", "application", "api", "generated_rest_api.ts"),
        path.join(CLIRoot, "src", "api", "generated_rest_api.ts"),
        path.join(WebApiRoot, "src", "tests", "api", "generated_rest_api.ts")
    ].forEach((target) => {
        writeFileSync(target, code);
    });

    [
        //
        path.join(WebClientRoot, "src", "system", "api", "generated_api.ts")
    ].forEach((outFile) => {
        writeFileSync(
            outFile,
            [
                `/**`,
                ` * DO NOT CHANGE THIS FILE`,
                ` * THIS FILE IS AUTO GENERATED`,
                ` */`,
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
