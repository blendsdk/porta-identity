import { createMethodName, Database, eReturnValue, RdbDataServiceBuilder } from "@blendsdk/codegen";

/**
 * Creates CRUD DataServices for all tables in the database
 *
 * @export
 * @param {Database} databaseSchema
 * @param {RdbDataServiceBuilder} builder
 */
export function createCrudDataServices(databaseSchema: Database, builder: RdbDataServiceBuilder) {
    databaseSchema.getViews().forEach((view) => {
        const serviceName = createMethodName(`${view.getName()}_data_service`, false);
        const svc = builder.createService(
            serviceName,
            `Provides functionality to get data from ${view.getName()} view`
        );

        if (view.getName() === "sys_session_view") {
            svc.defineMethod({
                name: "find_session_by_oidc_client_and_subject",
                query: "select * from sys_session_view where oidc_sub_claim = :sub_claim and oidc_client_id = :client_id",
                recordSet: false,
                returnValue: eReturnValue.dataOnly,
                type: "query",
                inputType: ({ suggestedTypeName, typeSchema }) => {
                    typeSchema
                        .createAppendType(suggestedTypeName) //
                        .addString("sub_claim")
                        .addString("client_id");
                    return suggestedTypeName;
                },
                returnType: view.getName()
            });

            svc.defineMethod({
                name: "find_session_by_client_and_user",
                query: "select * from sys_session_view where user_id = :user_id and client_id = :client_id",
                recordSet: false,
                returnValue: eReturnValue.dataOnly,
                type: "query",
                inputType: ({ suggestedTypeName, typeSchema }) => {
                    typeSchema
                        .createAppendType(suggestedTypeName) //
                        .addString("user_id")
                        .addString("client_id");
                    return suggestedTypeName;
                },
                returnType: view.getName()
            });

            svc.defineMethod({
                name: "find_session_by_session_id",
                query: "select * from sys_session_view where id = :id",
                recordSet: false,
                returnValue: eReturnValue.dataOnly,
                type: "query",
                inputType: ({ suggestedTypeName, typeSchema }) => {
                    typeSchema
                        .createAppendType(suggestedTypeName) //
                        .addString("id");
                    return suggestedTypeName;
                },
                returnType: view.getName()
            });
        }

        if (view.getName() === "sys_access_token_view") {
            svc.defineMethod({
                name: "find_access_token",
                query: "select * from sys_access_token_view where access_token = :access_token",
                recordSet: false,
                returnValue: eReturnValue.dataOnly,
                type: "query",
                inputType: ({ suggestedTypeName, typeSchema }) => {
                    typeSchema
                        .createAppendType(suggestedTypeName) //
                        .addString("access_token");
                    return suggestedTypeName;
                },
                returnType: view.getName()
            });
        }

        if (view.getName() === "sys_refresh_token_view") {
            svc.defineMethod({
                name: "find_refresh_token",
                query: "select * from sys_refresh_token_view where refresh_token = :refresh_token",
                recordSet: false,
                returnValue: eReturnValue.dataOnly,
                type: "query",
                inputType: ({ suggestedTypeName, typeSchema }) => {
                    typeSchema
                        .createAppendType(suggestedTypeName) //
                        .addString("refresh_token");
                    return suggestedTypeName;
                },
                returnType: view.getName()
            });

            svc.defineMethod({
                name: "find_refresh_token_by_access_token",
                query: "select * from sys_refresh_token_view where access_token = :access_token",
                recordSet: false,
                returnValue: eReturnValue.dataOnly,
                type: "query",
                inputType: ({ suggestedTypeName, typeSchema }) => {
                    typeSchema
                        .createAppendType(suggestedTypeName) //
                        .addString("access_token");
                    return suggestedTypeName;
                },
                returnType: view.getName()
            });
        }

        if (view.getName() === "sys_authorization_view") {
            svc.defineMethod({
                name: "find_by_client_id_and_redirect_uri",
                query: "select * from sys_authorization_view where client_id = :client_id and client_type <> 'S'",
                recordSet: false,
                returnValue: eReturnValue.dataOnly,
                type: "query",
                inputType: ({ suggestedTypeName, typeSchema }) => {
                    typeSchema
                        .createAppendType(suggestedTypeName) //
                        .addString("client_id");
                    return suggestedTypeName;
                },
                returnType: view.getName()
            });

            svc.defineMethod({
                name: "find_by_client_id_only",
                query: "select * from sys_authorization_view where client_id = :client_id and redirect_uri is null and client_type = 'S'",
                recordSet: false,
                returnValue: eReturnValue.dataOnly,
                type: "query",
                inputType: ({ suggestedTypeName, typeSchema }) => {
                    typeSchema
                        .createAppendType(suggestedTypeName) //
                        .addString("client_id");
                    return suggestedTypeName;
                },
                returnType: view.getName()
            });
        }
    });

    databaseSchema.getTables().forEach((table) => {
        const serviceName = createMethodName(`${table.getName()}_data_service`, false);
        const svc = builder.createService(
            serviceName,
            `Provides functionality to manipulate the ${table.getName()} table`
        );

        if (table.getName() === "sys_refresh_token") {
            svc.defineDeleteByColumnMethod(
                {
                    table: table.getName()
                },
                table.getColumns().filter((c) => {
                    return c.getName() === "refresh_token";
                })
            );
        }

        if (table.getName() === "sys_session") {
            svc.defineDeleteByColumnMethod(
                {
                    table: table.getName()
                },
                table.getColumns().filter((c) => {
                    return c.getName() === "user_id";
                })
            );
            svc.defineDeleteByColumnMethod(
                {
                    table: table.getName()
                },
                table.getColumns().filter((c) => {
                    return c.getName() === "user_id" || c.getName() === "client_id";
                })
            );
        }

        if (table.getName() === "sys_access_token") {
            svc.defineDeleteByColumnMethod(
                {
                    table: table.getName()
                },
                table.getColumns().filter((c) => {
                    return c.getName() === "access_token";
                })
            );
            svc.defineDeleteByColumnMethod(
                {
                    table: table.getName()
                },
                table.getColumns().filter((c) => {
                    return c.getName() === "user_id";
                })
            );
            svc.defineDeleteByColumnMethod(
                {
                    table: table.getName()
                },
                table.getColumns().filter((c) => {
                    return c.getName() === "user_id" || c.getName() === "client_id";
                })
            );
        }

        if (table.getName() === "sys_tenant") {
            svc.defineMethod({
                name: "find_by_name_or_id",
                query: "SELECT * FROM sys_tenant WHERE UPPER(name) = UPPER(:name) OR id::text = :name",
                recordSet: false,
                returnValue: eReturnValue.dataOnly,
                type: "query",
                inputType: ({ suggestedTypeName, typeSchema }) => {
                    typeSchema
                        .createAppendType(suggestedTypeName) //
                        .addString("name");
                    return suggestedTypeName;
                },
                returnType: "sys_tenant"
            });
        }

        if (table.getName() === "sys_user_profile") {
            svc.defineMethod({
                name: "find_user_profile_by_user_id",
                query: "SELECT * FROM sys_user_profile WHERE user_id = :user_id::uuid",
                recordSet: false,
                returnValue: eReturnValue.dataOnly,
                type: "query",
                inputType: ({ suggestedTypeName, typeSchema }) => {
                    typeSchema
                        .createAppendType(suggestedTypeName) //
                        .addString("user_id");
                    return suggestedTypeName;
                },
                returnType: "sys_user_profile"
            });
        }

        if (table.getName() === "sys_key") {
            svc.defineMethod({
                name: "find_jwk_keys",
                query: "select * from sys_key where UPPER(key_type) = 'JWK'",
                recordSet: true,
                returnValue: eReturnValue.dataOnly,
                type: "query",
                inputType: null,
                returnType: "sys_key"
            });
        }

        if (table.getName() === "sys_user_group") {
            svc.defineMethod({
                name: "find_groups_by_user_id",
                query: "select * from sys_groups_by_user_view where user_id = :user_id",
                recordSet: true,
                returnValue: eReturnValue.dataOnly,
                type: "query",
                inputType: ({ suggestedTypeName, typeSchema }) => {
                    typeSchema
                        .createAppendType(suggestedTypeName) //
                        .addString("user_id");
                    return suggestedTypeName;
                },
                returnType: "sys_groups_by_user_view"
            });
        }

        if (table.getName() === "sys_permission") {
            svc.defineMethod({
                name: "find_permissions_by_user_id",
                query: "select * from sys_user_permission_view where user_id = :user_id",
                recordSet: true,
                returnValue: eReturnValue.dataOnly,
                type: "query",
                inputType: ({ suggestedTypeName, typeSchema }) => {
                    typeSchema
                        .createAppendType(suggestedTypeName) //
                        .addString("user_id");
                    return suggestedTypeName;
                },
                returnType: "sys_user_permission_view"
            });
        }

        if (table.getName() === "sys_user") {
            svc.defineInsertMethod({ table: table.getName(), inConverter: true, outConverter: true });
            svc.defineUpdateByPrimaryKeyMethod({ table: table.getName(), inConverter: true, outConverter: true });
            svc.defineFindByPrimaryKeyMethod({ table: table.getName(), outConverter: true });
            svc.defineDeleteByPrimaryKeyMethod({ table: table.getName() });

            svc.defineMethod({
                name: "find_mfa_by_user_id",
                query: "SELECT * FROM sys_user_mfa_view WHERE user_id = :user_id::uuid",
                recordSet: true,
                returnValue: eReturnValue.dataOnly,
                type: "query",
                inputType: ({ suggestedTypeName, typeSchema }) => {
                    typeSchema
                        .createAppendType(suggestedTypeName) //
                        .addString("user_id");
                    return suggestedTypeName;
                },
                returnType: "sys_user_mfa_view"
            });

            svc.defineMethod({
                name: "find_by_username_non_service",
                query: `select
                            su.*
                        from
                            sys_user su
                            inner join sys_user_profile up on su.id = up.user_id
                            left join sys_client sc on su.id = sc.client_credentials_user_id
                        where
                            sc.id is null and
                            (
                                UPPER(su.username) = UPPER(:username) or
                                UPPER(up.email) = UPPER(:username)
                            )
                `,
                recordSet: false,
                returnValue: eReturnValue.dataOnly,
                type: "query",
                inputType: ({ suggestedTypeName, typeSchema }) => {
                    typeSchema
                        .createAppendType(suggestedTypeName) //
                        .addString("username");
                    return suggestedTypeName;
                },
                returnType: "sys_user"
            });
        } else {
            // create CRUD
            svc.defineFindByPrimaryKeyMethod({ table: table.getName() });
            svc.defineInsertMethod({ table: table.getName() });
            svc.defineDeleteByPrimaryKeyMethod({ table: table.getName() });
            svc.defineUpdateByPrimaryKeyMethod({ table: table.getName() });
            svc.defineFindByUniqueColumnMethod({ table: table.getName() });
            svc.defineFindByUniqueConstraintMethod({ table: table.getName() });
        }
    });
}
