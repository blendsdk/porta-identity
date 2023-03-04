import path from "path";
import { Database } from "@blendsdk/codegen";

export async function createDatabaseSchema(database: Database, resourcesRoot: string) {
    resourcesRoot = path.join(resourcesRoot, "database");

    const tenant = database.addTable("sys_tenant");
    tenant //
        .primaryKeyColumn("id", true)
        .stringColumn("name", { unique: true })
        .booleanColumn("is_active", { default: "true" })
        .booleanColumn("allow_reset_password", { default: "false" })
        .booleanColumn("allow_registration", { default: "false" })
        .stringColumn("organization");
}

// import { Database, PostgreSQLTypeFromQuery } from "@blendsdk/codegen";
// import { asyncForEach } from "@blendsdk/stdlib";
// import path from "path";
// import { dataSourceConfig } from "./config";
// import { consoleLogger, typeSchema } from "./lib";

// export async function createDatabaseSchema(database: Database, resourcesRoot: string) {
//     resourcesRoot = path.join(resourcesRoot, "database");

//     const tenant = database.addTable("sys_tenant");
//     // const user = database.addTable("sys_user");
//     // const user_profile = database.addTable("sys_user_profile");
//     // const group = database.addTable("sys_group");
//     // const user_group = database.addTable("sys_user_group");
//     // const application = database.addTable("sys_application");
//     // const redirect = database.addTable("sys_redirect");
//     // const mfa = database.addTable("sys_mfa");
//     // const user_mfa = database.addTable("sys_user_mfa");
//     // const client = database.addTable("sys_client");
//     // const permission = database.addTable("sys_permission");
//     // const group_permission = database.addTable("sys_group_permission");
//     // const client_type = database.addTable("sys_client_type");
//     // const confidential_client = database.addTable("sys_confidential_client");
//     // const key = database.addTable("sys_key");

//     tenant //
//         .primaryKeyColumn("id", true)
//         .stringColumn("name", { unique: true })
//         .stringColumn("domain", { unique: true })
//         .booleanColumn("is_active", { default: "true" })
//         .booleanColumn("allow_reset_password", { default: "false" })
//         .booleanColumn("allow_registration", { default: "false" })
//         .stringColumn("organization");

//     key.primaryKeyColumn("id", true) //
//         .stringColumn("key_type")
//         .stringColumn("key_id", { unique: true })
//         .stringColumn("data");

//     mfa.primaryKeyColumn("id", true) //
//         .stringColumn("name")
//         .jsonColumn(
//             "settings",
//             ({ mainSchema, suggestedTypeName }) => {
//                 mainSchema.createAppendType(suggestedTypeName);
//                 return suggestedTypeName;
//             },
//             { required: false }
//         );

//     user.primaryKeyColumn("id", true) //
//         .stringColumn("username", { unique: true })
//         .stringColumn("password")
//         .booleanColumn("is_active", { default: "true" })
//         .dateTimeColumn("date_created", { default: "now()" });

//     user_mfa //
//         .primaryKeyColumn("id", true)
//         .referenceColumn("user_id", user, "id")
//         .referenceColumn("mfa_id", mfa, "id");

//     user_profile //
//         .primaryKeyColumn("id", true)
//         .stringColumn("firstname")
//         .stringColumn("lastname")
//         .stringColumn("avatar", { required: false })
//         .referenceColumn("user_id", user, "id")
//         //
//         // .stringColumn("name") //	End-User's full name in displayable form including all name parts, possibly including titles and suffixes, ordered according to the End-User's locale and preferences.
//         // .stringColumn("given_name") //	Given name(s) or first name(s) of the End-User. Note that in some cultures, people can have multiple given names; all can be present, with the names being separated by space characters.
//         // .stringColumn("family_name") //	Surname(s) or last name(s) of the End-User. Note that in some cultures, people can have multiple family names or no family name; all can be present, with the names being separated by space characters.
//         // .stringColumn("middle_name") //	Middle name(s) of the End-User. Note that in some cultures, people can have multiple middle names; all can be present, with the names being separated by space characters. Also note that in some cultures, middle names are not used.
//         // .stringColumn("nickname") //	Casual name of the End-User that may or may not be the same as the given_name. For instance, a nickname value of Mike might be returned alongside a given_name value of Michael.
//         // .stringColumn("preferred_username") //	Shorthand name by which the End-User wishes to be referred to at the RP, such as janedoe or j.doe. This value MAY be any valid JSON .stringColumn(" including special characters such as @, /, or whitespace. The RP MUST NOT rely upon this value being unique, as discussed in Section 5.7.
//         // .stringColumn("profile") //	URL of the End-User's profile page. The contents of this Web page SHOULD be about the End-User.
//         // .stringColumn("picture") //	URL of the End-User's profile picture. This URL MUST refer to an image file (for example, a PNG, JPEG, or GIF image file), rather than to a Web page containing an image. Note that this URL SHOULD specifically reference a profile photo of the End-User suitable for displaying when describing the End-User, rather than an arbitrary photo taken by the End-User.
//         // .stringColumn("website") //	URL of the End-User's Web page or blog. This Web page SHOULD contain information published by the End-User or an organization that the End-User is affiliated with.
//         // .stringColumn("email") //	End-User's preferred e-mail address. Its value MUST conform to the RFC 5322 [RFC5322] addr-spec syntax. The RP MUST NOT rely upon this value being unique, as discussed in Section 5.7.
//         // .booleanColumn("email_verified") //	True if the End-User's e-mail address has been verified; otherwise false. When this Claim Value is true, this means that the OP took affirmative steps to ensure that this e-mail address was controlled by the End-User at the time the verification was performed. The means by which an e-mail address is verified is context-specific, and dependent upon the trust framework or contractual agreements within which the parties are operating.
//         // .stringColumn("gender") //	End-User's gender. Values defined by this specification are female and male. Other values MAY be used when neither of the defined values are applicable.
//         // .stringColumn("birthdate") //	End-User's birthday, represented as an ISO 8601:2004 [ISO8601‑2004] YYYY-MM-DD format. The year MAY be 0000, indicating that it is omitted. To represent only the year, YYYY format is allowed. Note that depending on the underlying platform's date related function, providing just year can result in varying month and day, so the implementers need to take this factor into account to correctly process the dates.
//         // .stringColumn("zoneinfo") //	.stringColumn(" from zoneinfo [zoneinfo] time zone database representing the End-User's time zone. For example, Europe/Paris or America/Los_Angeles.
//         // .stringColumn("locale") //	End-User's locale, represented as a BCP47 [RFC5646] language tag. This is typically an ISO 639-1 Alpha-2 [ISO639‑1] language code in lowercase and an ISO 3166-1 Alpha-2 [ISO3166‑1] country code in uppercase, separated by a dash. For example, en-US or fr-CA. As a compatibility note, some implementations have used an underscore as the separator rather than a dash, for example, en_US; Relying Parties MAY choose to accept this locale syntax as well.
//         // .stringColumn("phone_number") //	End-User's preferred telephone number. E.164 [E.164] is RECOMMENDED as the format of this Claim, for example, +1 (425) 555-1212 or +56 (2) 687 2400. If the phone number contains an extension, it is RECOMMENDED that the extension be represented using the RFC 3966 [RFC3966] extension syntax, for example, +1 (604) 555-1234;ext=5678.
//         // .booleanColumn("phone_number_verified") //	True if the End-User's phone number has been verified; otherwise false. When this Claim Value is true, this means that the OP took affirmative steps to ensure that this phone number was controlled by the End-User at the time the verification was performed. The means by which a phone number is verified is context-specific, and dependent upon the trust framework or contractual agreements within which the parties are operating. When true, the phone_number Claim MUST be in E.164 format and any extensions MUST be represented in RFC 3966 format.
//         // .stringColumn("address") //	JSON End-User's preferred postal address. The value of the address member is a JSON [RFC4627] structure containing some or all of the members defined in Section 5.1.1.
//         .dateColumn("date_created", { default: "now()" })
//         .dateColumn("date_changed", { default: "now()" }); //	Time the End-User's information was last updated. Its value is a JSON number representing the number of seconds from 1970-01-01T0:0:0Z as measured in UTC until the date/time.

//     group //
//         .primaryKeyColumn("id", true)
//         .stringColumn("name", { unique: true })
//         .stringColumn("description")
//         .booleanColumn("is_active", { default: "true" });

//     user_group //
//         .primaryKeyColumn("id", true)
//         .referenceColumn("user_id", user, "id")
//         .referenceColumn("group_id", group, "id")
//         .uniqueConstraint(["user_id", "group_id"]);

//     application //
//         .primaryKeyColumn("id", true)
//         .stringColumn("name", { unique: true })
//         .stringColumn("logo", { required: false }) // base64 encoded image data
//         .stringColumn("fallback_uri", { required: false }); // should be required

//     client_type //
//         .primaryKeyColumn("id", true)
//         .stringColumn("client_type")
//         .stringColumn("description", { required: false });

//     client //
//         .primaryKeyColumn("id", true) //
//         .stringColumn("client_id", { unique: true })
//         .referenceColumn("application_id", application, "id")
//         .referenceColumn("client_type_id", client_type, "id")
//         .stringColumn("description")
//         .stringColumn("secret", { default: "encode(digest(md5(random()::text), 'sha1'::text),'hex')" })
//         .integerColumn("session_length", { required: false })
//         .dateTimeColumn("valid_from", { required: false })
//         .dateTimeColumn("valid_until", { required: false });

//     redirect //
//         .primaryKeyColumn("id", true)
//         .referenceColumn("client_id", client, "id")
//         .stringColumn("redirect_uri", { required: false })
//         .stringColumn("logout_uri", { required: false })
//         .stringColumn("ios_bundle_id", { required: false })
//         .stringColumn("android_package_name", { required: false })
//         .stringColumn("android_signature_hash", { required: false });

//     confidential_client //
//         .primaryKeyColumn("id", true)
//         .referenceColumn("client_id", client, "id")
//         .referenceColumn("user_id", user, "id");

//     permission //
//         .primaryKeyColumn("id", true)
//         .stringColumn("code")
//         .referenceColumn("application", application, "id")
//         .stringColumn("description")
//         .booleanColumn("is_active", { default: "true" })
//         .uniqueConstraint(["application", "code"]);

//     group_permission //
//         .primaryKeyColumn("id", true)
//         .referenceColumn("group_id", group, "id")
//         .referenceColumn("permission_id", permission, "id")
//         .uniqueConstraint(["group_id", "permission_id"]);

//     database.addView("sys_authorization_view", path.join(resourcesRoot, "authorization_view.sql"), 100);
//     database.addView("sys_user_mfa_view", path.join(resourcesRoot, "user_mfa_view.sql"), 101);
//     database.addView("sys_groups_by_user_view", path.join(resourcesRoot, "groups_by_user_view.sql"), 102);
//     database.addView("sys_user_permission_view", path.join(resourcesRoot, "user_permission_view.sql"), 102);

//     // Create a view to type builder
//     const view2Type = new PostgreSQLTypeFromQuery({
//         dataSourceConfig,
//         databaseSchema: database,
//         typeSchema,
//         logger: consoleLogger
//     });

//     // Create the types for the views
//     await asyncForEach(database.getViews(), async (view) => {
//         await view2Type.typeFromQuery({
//             name: view.getName(),
//             query: `SELECT * FROM ${view.getName()} LIMIT 1`
//         });
//     });

//     await view2Type.cleanupAndClose();
// }
