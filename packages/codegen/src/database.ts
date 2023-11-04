import { Database, PostgreSQLTypeFromQuery, eDBForeignKeyAction } from "@blendsdk/codegen";
import { asyncForEach } from "@blendsdk/stdlib";
import path from "path";
import { dataSourceConfig } from "./config";
import { consoleLogger, typeSchema } from "./lib";

export async function createDatabaseSchema(database: Database, resourcesRoot: string) {
    resourcesRoot = path.join(resourcesRoot, "database");

    const tenant = database.addTable("sys_tenant");
    const user = database.addTable("sys_user");
    const user_profile = database.addTable("sys_user_profile");
    const role = database.addTable("sys_role");
    const user_role = database.addTable("sys_user_role");
    const permission = database.addTable("sys_permission");
    const role_permission = database.addTable("sys_role_permission");
    const application = database.addTable("sys_application");
    const client = database.addTable("sys_client");
    const session = database.addTable("sys_session");
    const access_token = database.addTable("sys_access_token");
    const refresh_token = database.addTable("sys_refresh_token");

    const mfa = database.addTable("sys_mfa");
    const user_mfa = database.addTable("sys_user_mfa");
    const key = database.addTable("sys_key");

    tenant //
        .primaryKeyColumn("id", true)
        .stringColumn("name", { unique: true })
        .stringColumn("database", { unique: true })
        .booleanColumn("is_active", { default: "true" })
        .booleanColumn("allow_reset_password", { default: "false" })
        .booleanColumn("allow_registration", { default: "false" })
        .stringColumn("organization");

    application //
        .primaryKeyColumn("id", true)
        .stringColumn("logo", { required: false }) // base64 encoded image data
        .stringColumn("application_name")
        .stringColumn("description", { required: false })
        .booleanColumn("is_active", { default: "true" });

    user.primaryKeyColumn("id", true) //
        .stringColumn("username", { unique: true })
        .stringColumn("password")
        .booleanColumn("is_active", { default: "true" })
        .dateTimeColumn("date_created", { default: "now()" })
        .dateColumn("date_changed", { default: "now()" });

    user_profile //
        .primaryKeyColumn("id", true)
        .stringColumn("email", { required: false })
        .stringColumn("firstname")
        .stringColumn("lastname")
        .stringColumn("avatar", { required: false })
        .referenceColumnAuto("user_id", user)
        .dateColumn("date_created", { default: "now()" })
        .dateColumn("date_changed", { default: "now()" }); //	Time the End-User's information was last updated. Its value is a JSON number representing the number of seconds from 1970-01-01T0:0:0Z as measured in UTC until the date/time.

    role.primaryKeyColumn("id", true) //
        .stringColumn("role", { unique: true })
        .stringColumn("description", { required: false })
        .stringColumn("role_type", { default: "'A'" })
        .booleanColumn("is_active", { default: "true" });

    user_role //
        .primaryKeyColumn("id", true)
        .referenceColumnAuto("user_id", user)
        .referenceColumnAuto("role_id", role)
        .uniqueConstraint(["user_id", "role_id"]);

    permission //
        .primaryKeyColumn("id", true)
        .stringColumn("permission", { unique: true })
        .stringColumn("description", { required: false })
        .referenceColumnAuto("application_id", application)
        .booleanColumn("is_active", { default: "true" });

    role_permission //
        .primaryKeyColumn("id", true)
        .referenceColumnAuto("role_id", role)
        .referenceColumnAuto("permission_id", permission)
        .uniqueConstraint(["role_id", "permission_id"]);

    mfa.primaryKeyColumn("id", true) //
        .stringColumn("name")
        .jsonColumn(
            "settings",
            ({ mainSchema, suggestedTypeName }) => {
                mainSchema.createAppendType(suggestedTypeName);
                return suggestedTypeName;
            },
            { required: false }
        );

    user_mfa //
        .primaryKeyColumn("id", true)
        .referenceColumnAuto("user_id", user)
        .referenceColumnAuto("mfa_id", mfa);

    key.primaryKeyColumn("id", true) //
        .stringColumn("key_type")
        .stringColumn("key_id", { unique: true })
        .stringColumn("data");

    client //
        .primaryKeyColumn("id", true) //
        .stringColumn("client_id", { unique: true })
        .stringColumn("client_type") // Public = SPA/Native/Desktop, Confidential = WebApp / API, Service = MachineToMachine
        .booleanColumn("is_active", { default: "true" })
        .stringColumn("description", { required: false })
        .stringColumn("secret", { default: "encode(digest(md5(random()::text), 'sha1'::text),'hex')" })
        .integerColumn("access_token_ttl", { required: false })
        .integerColumn("refresh_token_ttl", { required: false })
        .dateTimeColumn("valid_from", { required: false, default: "now()" })
        .dateTimeColumn("valid_until", { required: false })
        .stringColumn("redirect_uri", { required: false })
        .referenceColumnAuto("client_credentials_user_id", user, undefined, { required: false })
        .referenceColumnAuto("application_id", application)
        .stringColumn("post_logout_redirect_uri", { required: false })
        .booleanColumn("is_back_channel_post_logout", { default: "false" })
        .booleanColumn("is_system_client", { default: "false" });

    session
        .primaryKeyColumn("id", true)
        .stringColumn("session_id")
        .referenceColumnAuto("user_id", user, {
            onUpdate: eDBForeignKeyAction.cascade,
            onDelete: eDBForeignKeyAction.cascade
        })
        .referenceColumnAuto("client_id", client, {
            onUpdate: eDBForeignKeyAction.cascade,
            onDelete: eDBForeignKeyAction.cascade
        })
        .dateTimeColumn("date_created", { default: "now()" })
        .uniqueConstraint(["user_id", "client_id"]);

    access_token
        //
        .primaryKeyColumn("id", true)
        .integerColumn("ttl")
        .integerColumn("refresh_ttl")
        .integerColumn("auth_time")
        .dateTimeColumn("date_created", { default: "now()" })
        .jsonColumn(
            "auth_request_params",
            ({ suggestedTypeName, mainSchema }) => {
                mainSchema
                    .createAppendType(suggestedTypeName)
                    .addString("ui_locales")
                    .addString("claims")
                    .addString("acr_values")
                    .addString("resource")
                    .addString("token_reference")
                    .addString("scope");

                return suggestedTypeName;
            },
            { required: false }
        )
        .stringColumn("access_token", {
            unique: true,
            default: "encode(digest(md5(random()::text), 'sha1'::text),'hex')"
        })
        .referenceColumnAuto("session_id", session, {
            onDelete: eDBForeignKeyAction.cascade,
            onUpdate: eDBForeignKeyAction.cascade
        })
        .referenceColumnAuto("user_id", user, {
            onDelete: eDBForeignKeyAction.cascade,
            onUpdate: eDBForeignKeyAction.cascade
        })
        .referenceColumnAuto("client_id", client, {
            onDelete: eDBForeignKeyAction.cascade,
            onUpdate: eDBForeignKeyAction.cascade
        })
        .referenceColumnAuto("tenant_id", tenant, {
            onDelete: eDBForeignKeyAction.cascade,
            onUpdate: eDBForeignKeyAction.cascade
        });

    refresh_token
        //
        .primaryKeyColumn("id", true)
        .integerColumn("ttl")
        .dateTimeColumn("date_created", { default: "now()" })
        .stringColumn("refresh_token", {
            unique: true,
            default: "encode(digest(md5(random()::text), 'sha1'::text),'hex')"
        })
        .referenceColumnAuto("access_token_id", access_token, {
            onDelete: eDBForeignKeyAction.cascade,
            onUpdate: eDBForeignKeyAction.cascade
        });

    database.addView("sys_client_view", path.join(resourcesRoot, "client_view.sql"), 99);
    database.addView("sys_authorization_view", path.join(resourcesRoot, "authorization_view.sql"), 100);
    database.addView("sys_user_mfa_view", path.join(resourcesRoot, "user_mfa_view.sql"), 101);
    database.addView("sys_roles_by_user_view", path.join(resourcesRoot, "roles_by_user_view.sql"), 102);
    database.addView("sys_user_permission_view", path.join(resourcesRoot, "user_permission_view.sql"), 102);
    database.addView("sys_access_token_view", path.join(resourcesRoot, "access_token_view.sql"), 103);
    database.addView("sys_refresh_token_view", path.join(resourcesRoot, "refresh_token_view.sql"), 103);
    database.addView("sys_session_view", path.join(resourcesRoot, "session_view.sql"), 104);

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
