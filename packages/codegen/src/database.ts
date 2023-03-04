import path from "path";
import { Database, PostgreSQLTypeFromQuery } from "@blendsdk/codegen";
import { asyncForEach } from "@blendsdk/stdlib";
import { dataSourceConfig } from "./config";
import { typeSchema, consoleLogger } from "./lib";

export async function createDatabaseSchema(database: Database, resourcesRoot: string) {
    resourcesRoot = path.join(resourcesRoot, "database");

    const tenant = database.addTable("sys_tenant");
    const user = database.addTable("sys_user");
    const user_profile = database.addTable("sys_user_profile");
    const group = database.addTable("sys_group");
    const user_group = database.addTable("sys_user_group");
    const permission = database.addTable("sys_permission");
    const group_permission = database.addTable("sys_group_permission");
    const client = database.addTable("sys_client");
    const client_type = database.addTable("sys_client_type");
    const redirect = database.addTable("sys_redirect");
    const confidential_client = database.addTable("sys_confidential_client");

    const mfa = database.addTable("sys_mfa");
    const user_mfa = database.addTable("sys_user_mfa");
    const key = database.addTable("sys_key");

    tenant //
        .primaryKeyColumn("id", true)
        .stringColumn("name", { unique: true })
        .booleanColumn("is_active", { default: "true" })
        .booleanColumn("allow_reset_password", { default: "false" })
        .booleanColumn("allow_registration", { default: "false" })
        .stringColumn("organization");

    user.primaryKeyColumn("id", true) //
        .stringColumn("username", { unique: true })
        .stringColumn("password")
        .booleanColumn("is_active", { default: "true" })
        .dateTimeColumn("date_created", { default: "now()" });

    user_profile //
        .primaryKeyColumn("id", true)
        .stringColumn("firstname")
        .stringColumn("lastname")
        .stringColumn("avatar", { required: false })
        .referenceColumn("user_id", user, "id")
        .dateColumn("date_created", { default: "now()" })
        .dateColumn("date_changed", { default: "now()" }); //	Time the End-User's information was last updated. Its value is a JSON number representing the number of seconds from 1970-01-01T0:0:0Z as measured in UTC until the date/time.

    group //
        .primaryKeyColumn("id", true)
        .stringColumn("name", { unique: true })
        .stringColumn("description")
        .booleanColumn("is_active", { default: "true" });

    user_group //
        .primaryKeyColumn("id", true)
        .referenceColumn("user_id", user, "id")
        .referenceColumn("group_id", group, "id")
        .uniqueConstraint(["user_id", "group_id"]);

    permission //
        .primaryKeyColumn("id", true)
        .stringColumn("code", { unique: true })
        .stringColumn("description")
        .booleanColumn("is_active", { default: "true" });

    group_permission //
        .primaryKeyColumn("id", true)
        .referenceColumn("group_id", group, "id")
        .referenceColumn("permission_id", permission, "id")
        .uniqueConstraint(["group_id", "permission_id"]);

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
        .referenceColumn("user_id", user, "id")
        .referenceColumn("mfa_id", mfa, "id");

    key.primaryKeyColumn("id", true) //
        .stringColumn("key_type")
        .stringColumn("key_id", { unique: true })
        .stringColumn("data");

    client_type //
        .primaryKeyColumn("id", true)
        .stringColumn("client_type")
        .stringColumn("description", { required: false });

    client //
        .primaryKeyColumn("id", true) //
        .stringColumn("client_id", { unique: true })
        .referenceColumn("client_type_id", client_type, "id")
        .stringColumn("logo", { required: false }) // base64 encoded image data
        .stringColumn("fallback_uri", { required: false }) // should be required
        .stringColumn("description")
        .stringColumn("secret", { default: "encode(digest(md5(random()::text), 'sha1'::text),'hex')" })
        .integerColumn("session_length", { required: false })
        .dateTimeColumn("valid_from", { required: false })
        .dateTimeColumn("valid_until", { required: false });

    redirect //
        .primaryKeyColumn("id", true)
        .referenceColumn("client_id", client, "id")
        .stringColumn("redirect_uri", { required: false })
        .stringColumn("logout_uri", { required: false })
        .stringColumn("ios_bundle_id", { required: false })
        .stringColumn("android_package_name", { required: false })
        .stringColumn("android_signature_hash", { required: false });

    confidential_client //
        .primaryKeyColumn("id", true)
        .referenceColumn("client_id", client, "id")
        .referenceColumn("user_id", user, "id");

    database.addView("sys_authorization_view", path.join(resourcesRoot, "authorization_view.sql"), 100);
    database.addView("sys_user_mfa_view", path.join(resourcesRoot, "user_mfa_view.sql"), 101);
    database.addView("sys_groups_by_user_view", path.join(resourcesRoot, "groups_by_user_view.sql"), 102);
    database.addView("sys_user_permission_view", path.join(resourcesRoot, "user_permission_view.sql"), 102);

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
