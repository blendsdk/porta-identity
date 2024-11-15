import { createMethodName, Database, eReturnValue, RdbDataServiceBuilder } from "@blendsdk/codegen";

/**
 * Creates CRUD DataServices for all tables in the database
 *
 * @export
 * @param {Database} databaseSchema
 * @param {RdbDataServiceBuilder} builder
 */
export function createCrudDataServices(databaseSchema: Database, builder: RdbDataServiceBuilder) {
    databaseSchema.getTables().forEach((table) => {
        const tableName = table.getName();
        const serviceName = createMethodName(`${tableName}_data_service`, false);
        const svc = builder.createService(serviceName, `Provides functionality to manipulate the ${tableName} table`);

        const { has_list_by_expression } = table.getMetaData();

        if (tableName == "sys_application_session") {
            svc.defineFindByColumns(
                {
                    table: tableName
                },
                table.getColumns("session_id")
            );
        }

        // if (tableName === "sys_refresh_token") {
        //     svc.defineDeleteByColumnMethod(
        //         {
        //             table: tableName
        //         },
        //         table.getColumns().filter((c) => {
        //             return c.getName() === "refresh_token";
        //         })
        //     );
        // }

        // if (tableName === "sys_session") {

        //     svc.defineDeleteByColumnMethod(
        //         {
        //             table: tableName
        //         },
        //         table.getColumns("user_id")
        //     );

        //     svc.defineFindByColumns(
        //         {
        //             table: tableName,
        //         },
        //         table.getColumns("id", "user_id")
        //     );

        //     svc.defineDeleteByColumnMethod(
        //         {
        //             table: tableName
        //         },
        //         table.getColumns("id", "user_id")
        //     );
        // }

        // if (tableName === "sys_access_token") {
        //     svc.defineDeleteByColumnMethod(
        //         {
        //             table: tableName
        //         },
        //         table.getColumns().filter((c) => {
        //             return c.getName() === "access_token";
        //         })
        //     );
        //     svc.defineDeleteByColumnMethod(
        //         {
        //             table: tableName
        //         },
        //         table.getColumns().filter((c) => {
        //             return c.getName() === "user_id";
        //         })
        //     );
        //     svc.defineDeleteByColumnMethod(
        //         {
        //             table: tableName
        //         },
        //         table.getColumns().filter((c) => {
        //             return c.getName() === "user_id" || c.getName() === "client_id";
        //         })
        //     );
        // }

        if (tableName === "sys_tenant") {
            const revokes = ["session", "access_token", "refresh_token"];

            revokes.forEach((name) => {
                svc.defineMethod({
                    name: `revoke_expired_${name}s`,
                    query: `delete from sys_${name} where id in (select id from sys_${name} where (now() > date_expire) = true);`,
                    recordSet: false,
                    returnValue: eReturnValue.dataOnly,
                    type: "query"
                });
            });

            svc.defineListByExpressionMethod({
                table: "sys_session_view"
            });

            svc.defineListByExpressionMethod({
                table: "sys_access_token_view"
            });

            svc.defineListByExpressionMethod({
                table: "sys_refresh_token_view"
            });

            svc.defineListByExpressionMethod({
                table: "sys_user_permission_view"
            });

            svc.defineListByExpressionMethod({
                table: "sys_authorization_view"
            });

            svc.defineListByExpressionMethod({
                table: "sys_secret_view"
            });

            svc.defineListByExpressionMethod({
                table: tableName
            });

            svc.defineMethod({
                name: "find_by_name_or_id",
                query: "SELECT * FROM sys_tenant WHERE UPPER(name) = UPPER(:name) OR REPLACE(UPPER(id::text),'-','') = REPLACE(UPPER(:name),'-','')",
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

        if (tableName === "sys_profile") {
            svc.defineMethod({
                name: "find_profile_by_user_id",
                query: "SELECT * FROM sys_profile WHERE user_id = :user_id",
                recordSet: false,
                returnValue: eReturnValue.dataOnly,
                type: "query",
                inputType: ({ suggestedTypeName, typeSchema }) => {
                    typeSchema
                        .createAppendType(suggestedTypeName) //
                        .addString("user_id");
                    return suggestedTypeName;
                },
                returnType: tableName
            });
        }

        if (tableName === "sys_key") {
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

        // if (tableName === "sys_user_group") {
        //     svc.defineMethod({
        //         name: "find_groups_by_user_id",
        //         query: "select * from sys_groups_by_user_view where user_id = :user_id",
        //         recordSet: true,
        //         returnValue: eReturnValue.dataOnly,
        //         type: "query",
        //         inputType: ({ suggestedTypeName, typeSchema }) => {
        //             typeSchema
        //                 .createAppendType(suggestedTypeName) //
        //                 .addString("user_id");
        //             return suggestedTypeName;
        //         },
        //         returnType: "sys_groups_by_user_view"
        //     });
        // }

        // if (tableName === "sys_permission") {
        //     svc.defineMethod({
        //         name: "find_permissions_by_user_id_and_client_id",
        //         query: "select * from sys_user_permission_view where user_id = :user_id and client_id = :client_id",
        //         recordSet: true,
        //         returnValue: eReturnValue.dataOnly,
        //         type: "query",
        //         inputType: ({ suggestedTypeName, typeSchema }) => {
        //             typeSchema
        //                 .createAppendType(suggestedTypeName) //
        //                 .addString("client_id")
        //                 .addString("user_id");
        //             return suggestedTypeName;
        //         },
        //         returnType: "sys_user_permission_view"
        //     });
        // }

        if (tableName === "sys_user") {
            svc.defineInsertMethod({ table: tableName, inConverter: true, outConverter: true });
            svc.defineUpdateByPrimaryKeyMethod({ table: tableName, inConverter: true, outConverter: true });
            svc.defineFindByPrimaryKeyMethod({ table: tableName, outConverter: true });
            svc.defineDeleteByPrimaryKeyMethod({ table: tableName });

            // svc.defineMethod({
            //     name: "find_mfa_by_user_id",
            //     query: "SELECT * FROM sys_user_mfa_view WHERE user_id = :user_id::uuid",
            //     recordSet: true,
            //     returnValue: eReturnValue.dataOnly,
            //     type: "query",
            //     inputType: ({ suggestedTypeName, typeSchema }) => {
            //         typeSchema
            //             .createAppendType(suggestedTypeName) //
            //             .addString("user_id");
            //         return suggestedTypeName;
            //     },
            //     returnType: "sys_user_mfa_view"
            // });

            svc.defineMethod({
                name: "find_by_username_non_service",
                query: `select
                            su.*
                        from
                            sys_user su
                            inner join sys_profile up on su.id = up.user_id
                        where
                            su.service_application_id is null and
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
            svc.defineFindByPrimaryKeyMethod({ table: tableName });
            svc.defineInsertMethod({ table: tableName });
            svc.defineDeleteByPrimaryKeyMethod({ table: tableName });
            svc.defineUpdateByPrimaryKeyMethod({ table: tableName });
            svc.defineFindByUniqueColumnMethod({ table: tableName });
            svc.defineFindByUniqueConstraintMethod({ table: tableName });
            if (has_list_by_expression) {
                svc.defineListByExpressionMethod({ table: tableName });
            }
        }
    });
}
