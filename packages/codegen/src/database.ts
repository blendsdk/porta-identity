import { Database, eDBForeignKeyAction, refType } from "@blendsdk/codegen";
import path from "path";

export async function createDatabaseSchema(database: Database, resourcesRoot: string) {
    resourcesRoot = path.join(resourcesRoot, "database");

    const tenant = database.addTable("sys_tenant");
    const key = database.addTable("sys_key");
    const application = database.addTable("sys_application");
    const secret = database.addTable("sys_secret");
    const client = database.addTable("sys_client");
    const sys_extension = database.addTable("sys_extension").setMetaData({ has_list_by_expression: true });

    const user = database.addTable("sys_user");
    const profile = database.addTable("sys_profile");

    const role = database.addTable("sys_role");
    const permission = database.addTable("sys_permission");
    const user_role = database.addTable("sys_user_role");
    const role_permission = database.addTable("sys_role_permission");

    // const user_profile = database.addTable("sys_user_profile");
    // const role = database.addTable("sys_role");
    // const user_role = database.addTable("sys_user_role");
    // const permission = database.addTable("sys_permission");
    // const role_permission = database.addTable("sys_role_permission");
    // const application = database.addTable("sys_application");
    // const client = database.addTable("sys_client");
    const session = database.addTable("sys_session");
    const access_token = database.addTable("sys_access_token");
    const refresh_token = database.addTable("sys_refresh_token");

    const mfa = database.addTable("sys_mfa");
    //const user_mfa = database.addTable("sys_user_mfa");

    mfa
        .primaryKeyColumn("id", true)
        .stringColumn("name", { unique: true })
        .jsonColumn("settings", refType("mfa_settings"), { required: false, default: "'{}'" });

    sys_extension
        .primaryKeyColumn("extension_id", true)
        .stringColumn("name")
        .stringColumn("version")
        .stringColumn("description")
        .stringColumn("source")
        .stringColumn("options", { default: "'{}'" })
        .booleanColumn("is_active", { default: "false" })
        .dateTimeColumn("date_created", { default: "now()" })
        .uniqueConstraint(["name", "version"]);

    user.primaryKeyColumn("id", true) //
        .stringColumn("username", { unique: true })
        .stringColumn("password")
        .booleanColumn("is_active", { default: "true" })
        .booleanColumn("is_system", { default: "false" })
        .dateTimeColumn("date_created", { default: "now()" })
        .dateTimeColumn("date_modified", { default: "now()" });

    profile //
        .primaryKeyColumn("id", true)
        .stringColumn("email", { required: false })
        .stringColumn("firstname")
        .stringColumn("lastname")
        .stringColumn("website", { required: false })
        .stringColumn("zoneinfo", { required: false })
        .stringColumn("birthdate", { required: false })
        .stringColumn("gender", { required: false })
        .stringColumn("middle_name", { required: false })
        .stringColumn("locale", { required: false })
        .stringColumn("avatar", { required: false })
        .stringColumn("address", { required: false })
        .stringColumn("postalcode", { required: false })
        .stringColumn("city", { required: false })
        .stringColumn("country", { required: false })
        .stringColumn("state", { required: false })
        .stringColumn("phone_number", { required: false })
        .booleanColumn("phone_number_verified", { required: false })
        .referenceColumnAuto("user_id", user)
        .dateTimeColumn("date_created", { default: "now()" })
        .stringColumn("user_state", { required: false })
        .dateTimeColumn("date_modified", { default: "now()" });

    tenant //
        .primaryKeyColumn("id", true)
        .stringColumn("name", { unique: true })
        .stringColumn("database", { unique: true })
        .booleanColumn("is_active", { default: "true" })
        .booleanColumn("allow_reset_password", { default: "false" })
        .booleanColumn("allow_registration", { default: "false" })
        .integerColumn("auth_session_length_hours", { default: "0" }) // indefinate session
        .stringColumn("organization");

    application //
        .primaryKeyColumn("id", true)
        .stringColumn("logo", { required: false }) // base64 encoded image data
        .stringColumn("application_name")
        .stringColumn("client_id", { unique: true })
        .stringColumn("description", { required: false })
        .booleanColumn("is_system", { default: "false" })
        .booleanColumn("is_active", { default: "true" })
        .referenceColumnAuto("tenant_id", tenant);

    client //
        .primaryKeyColumn("id", true)
        .stringColumn("client_type", { default: "'C'" })
        .stringColumn("redirect_uri", { required: false })
        .stringColumn("post_logout_redirect_uri", { required: false })
        .booleanColumn("is_back_channel_post_logout", { default: "false" })
        .booleanColumn("is_system", { default: "false" })
        .booleanColumn("is_active", { default: "true" })
        .integerColumn("access_token_length")
        .integerColumn("refresh_token_length")
        .referenceColumnAuto("application_id", application)
        .referenceColumn("client_credentials_user_id", user, "id", { onDelete: eDBForeignKeyAction.cascade, onUpdate: eDBForeignKeyAction.cascade }, { required: false })
        .integerColumn("mfa_bypass_days", { default: "0" }) // 0 = no bypass
        .referenceColumn("mfa_id", mfa, "id", { onDelete: eDBForeignKeyAction.cascade, onUpdate: eDBForeignKeyAction.cascade }, { required: false });

    secret  //
        .primaryKeyColumn("id", true)
        .stringColumn("secret")
        .stringColumn("description", { required: false })
        .dateTimeColumn("valid_from", { withTimeZone: true })
        .dateTimeColumn("valid_to", { withTimeZone: true })
        .booleanColumn("is_system", { default: "false" })
        .referenceColumnAuto("application_id", application)
        .uniqueConstraint(["application_id", "secret"]);

    key.primaryKeyColumn("id", true) //
        .stringColumn("key_type")
        .stringColumn("key_id", { unique: true })
        .stringColumn("data");

    role.primaryKeyColumn("id", true) //
        .stringColumn("role", { unique: true })
        .stringColumn("description", { required: false })
        .booleanColumn("is_system", { default: "false" })
        .booleanColumn("is_active", { default: "true" });

    user_role //
        .primaryKeyColumn("id", true)
        .referenceColumnAuto("user_id", user)
        .referenceColumnAuto("role_id", role)
        .uniqueConstraint(["user_id", "role_id"]);

    permission //
        .primaryKeyColumn("id", true)
        .stringColumn("permission")
        .stringColumn("description", { required: false })
        .referenceColumnAuto("application_id", application,
            {
                onDelete: eDBForeignKeyAction.cascade,
                onUpdate: eDBForeignKeyAction.cascade
            },
            {
                required: false, default: "null"
            }
        )
        .booleanColumn("is_system", { default: "false" })
        .booleanColumn("is_active", { default: "true" });

    role_permission //
        .primaryKeyColumn("id", true)
        .referenceColumnAuto("role_id", role)
        .referenceColumnAuto("permission_id", permission)
        .uniqueConstraint(["role_id", "permission_id"]);

    session
        .primaryKeyColumn("id", true)
        .referenceColumnAuto("user_id", user, {
            onUpdate: eDBForeignKeyAction.cascade,
            onDelete: eDBForeignKeyAction.cascade
        })
        .dateTimeColumn("date_created", { default: 'now()' })
        .dateTimeColumn("last_token_auth_time", { default: 'now()' })
        .dateTimeColumn("date_expire");

    access_token
        //
        .primaryKeyColumn("id", true)
        .dateTimeColumn("date_expire")
        .dateTimeColumn("auth_time")
        .stringColumn("ota", { unique: true, required: false })
        .jsonColumn("auth_request_params", refType("any_index"))
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
        .dateTimeColumn("date_expire")
        .dateTimeColumn("date_created", { default: "now()" })
        .stringColumn("refresh_token", {
            unique: true,
            default: "encode(digest(md5(random()::text), 'sha1'::text),'hex')"
        })
        .referenceColumnAuto("access_token_id", access_token, {
            onDelete: eDBForeignKeyAction.cascade,
            onUpdate: eDBForeignKeyAction.cascade
        });

    // mfa.primaryKeyColumn("id", true) //
    //     .stringColumn("name")
    //     .jsonColumn(
    //         "settings",
    //         ({ mainSchema, suggestedTypeName }) => {
    //             mainSchema.createAppendType(suggestedTypeName);
    //             return suggestedTypeName;
    //         },
    //         { required: false }
    //     );

    // user_mfa //
    //     .primaryKeyColumn("id", true)
    //     .referenceColumnAuto("user_id", user)
    //     .referenceColumnAuto("mfa_id", mfa);

    // client //
    //     .primaryKeyColumn("id", true) //
    //     .stringColumn("client_id", { unique: true })
    //     .stringColumn("client_type") // Public = SPA/Native/Desktop, Confidential = WebApp / API, Service = MachineToMachine
    //     .booleanColumn("is_active", { default: "true" })
    //     .stringColumn("description", { required: false })
    //     .stringColumn("client_secret", { default: "encode(digest(md5(random()::text), 'sha1'::text),'hex')" })
    //     .integerColumn("access_token_ttl", { required: false })
    //     .integerColumn("refresh_token_ttl", { required: false })
    //     .dateTimeColumn("valid_from", { required: false, default: "now()" })
    //     .dateTimeColumn("valid_until", { required: false })
    //     .stringColumn("redirect_uri", { required: false })
    //     .referenceColumnAuto("client_credentials_user_id", user, undefined, { required: false })
    //     .referenceColumnAuto("application_id", application)
    //     .stringColumn("post_logout_redirect_uri", { required: false })
    //     .booleanColumn("is_back_channel_post_logout", { default: "false" })
    //     .booleanColumn("is_system_client", { default: "false" });

    // session
    //     .primaryKeyColumn("id", true)
    //     .stringColumn("session_id")
    //     .referenceColumnAuto("user_id", user, {
    //         onUpdate: eDBForeignKeyAction.cascade,
    //         onDelete: eDBForeignKeyAction.cascade
    //     })
    //     .referenceColumnAuto("client_id", client, {
    //         onUpdate: eDBForeignKeyAction.cascade,
    //         onDelete: eDBForeignKeyAction.cascade
    //     })
    //     .dateTimeColumn("date_created", { default: "now()" })
    //     .uniqueConstraint(["user_id", "client_id"]);

    // access_token
    //     //
    //     .primaryKeyColumn("id", true)
    //     .integerColumn("ttl")
    //     .integerColumn("refresh_ttl")
    //     .integerColumn("auth_time")
    //     .dateTimeColumn("date_created", { default: "now()" })
    //     .jsonColumn(
    //         "auth_request_params",
    //         ({ suggestedTypeName, mainSchema }) => {
    //             mainSchema
    //                 .createAppendType(suggestedTypeName)
    //                 .addString("ui_locales")
    //                 .addString("claims")
    //                 .addString("acr_values")
    //                 .addString("resource")
    //                 .addString("token_reference")
    //                 .addString("scope");

    //             return suggestedTypeName;
    //         },
    //         { required: false }
    //     )
    //     .stringColumn("access_token", {
    //         unique: true,
    //         default: "encode(digest(md5(random()::text), 'sha1'::text),'hex')"
    //     })
    //     .referenceColumnAuto("session_id", session, {
    //         onDelete: eDBForeignKeyAction.cascade,
    //         onUpdate: eDBForeignKeyAction.cascade
    //     })
    //     .referenceColumnAuto("user_id", user, {
    //         onDelete: eDBForeignKeyAction.cascade,
    //         onUpdate: eDBForeignKeyAction.cascade
    //     })
    //     .referenceColumnAuto("client_id", client, {
    //         onDelete: eDBForeignKeyAction.cascade,
    //         onUpdate: eDBForeignKeyAction.cascade
    //     })
    //     .referenceColumnAuto("tenant_id", tenant, {
    //         onDelete: eDBForeignKeyAction.cascade,
    //         onUpdate: eDBForeignKeyAction.cascade
    //     });

    // refresh_token
    //     //
    //     .primaryKeyColumn("id", true)
    //     .integerColumn("ttl")
    //     .dateTimeColumn("date_created", { default: "now()" })
    //     .stringColumn("refresh_token", {
    //         unique: true,
    //         default: "encode(digest(md5(random()::text), 'sha1'::text),'hex')"
    //     })
    //     .referenceColumnAuto("access_token_id", access_token, {
    //         onDelete: eDBForeignKeyAction.cascade,
    //         onUpdate: eDBForeignKeyAction.cascade
    //     });

}
