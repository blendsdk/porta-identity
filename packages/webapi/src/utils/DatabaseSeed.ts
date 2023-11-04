import { generateRandomUUID, sha256Hash } from "@blendsdk/crypto";
import { dataSourceManager } from "@blendsdk/datakit";
import { PostgreSQLDataSource } from "@blendsdk/postgresql";
import { IDictionaryOf, MD5, asyncForEach, isNullOrUndef, ucFirst } from "@blendsdk/stdlib";
import { IDatabaseAppSettings } from "@blendsdk/webafx";
import {
    ISysApplication,
    ISysClient,
    ISysPermission,
    ISysRole,
    ISysTenant,
    ISysUser,
    eApiPermissions,
    eApiRoles
} from "@porta/shared";
import fs from "fs";
import path from "path";
import util from "util";
import { SysApplicationDataService } from "../dataservices/SysApplicationDataService";
import { SysClientDataService } from "../dataservices/SysClientDataService";
import { SysKeyDataService } from "../dataservices/SysKeyDataService";
import { SysPermissionDataService } from "../dataservices/SysPermissionDataService";
import { SysRoleDataService } from "../dataservices/SysRoleDataService";
import { SysRolePermissionDataService } from "../dataservices/SysRolePermissionDataService";
import { SysTenantDataService } from "../dataservices/SysTenantDataService";
import { SysUserDataService } from "../dataservices/SysUserDataService";
import { SysUserProfileDataService } from "../dataservices/SysUserProfileDataService";
import { SysUserRoleDataService } from "../dataservices/SysUserRoleDataService";
import { application } from "../modules/application";
import { IPortaApplicationSetting, eDatabaseType } from "../types";
import { commonUtils } from "./CommonUtils";
import { databaseUtils } from "./DatabaseUtils";

export const eDefaultClients: IDictionaryOf<ISysClient> = {
    UI_CLIENT: {
        id: MD5("porta_ui_client"),
        client_type: "C",
        description: "porta_administrative_application",
        is_active: true,
        is_system_client: true,
        client_id: "porta_ui_client",
        application_id: undefined
    },
    API_CLIENT: {
        id: MD5("porta_api_client"),
        client_type: "S",
        description: "porta_api_application",
        is_active: true,
        is_system_client: true,
        client_id: "porta_api_client",
        application_id: undefined
    },
    CLI_CLIENT: {
        id: MD5("porta_cli_client"),
        client_type: "P",
        description: "porta_cli_application",
        is_active: true,
        is_system_client: true,
        client_id: "porta_cli_client",
        application_id: undefined
    }
};

/**
 * @export
 * @interface IInitializeTenant
 */
export interface IInitializeTenant {
    tenantName: string;
    databaseName: string;
    organization: string;
    allow_registration: boolean;
    allow_reset_password: boolean;
    username: string;
    password: string;
    email: string;
    serverURL: string;
}

/**
 * Implements database seedings
 *
 * @export
 * @class DatabaseSeed
 */
export class DatabaseSeed {
    protected async isSystemInitialized(databaseName: string) {
        const ctx = await dataSourceManager.getDataSource<PostgreSQLDataSource>(eDatabaseType.system).createContext();
        const { data } = await ctx.executeQuery(
            "select * from pg_catalog.pg_database where datname=:datname",
            {
                datname: databaseName
            },
            { single: true }
        );
        return !isNullOrUndef(data);
    }

    /**
     * Create The admin user
     *
     * @protected
     * @param {*} username
     * @param {*} password
     * @param {ISysTenant} tenant
     * @returns
     * @memberof DatabaseSeed
     */
    protected async createAdminUser(username: string, password: string, email: string, tenant: ISysTenant) {
        const userDs = new SysUserDataService({ tenantId: databaseUtils.getTenantDataSourceID(tenant) });
        const profileDs = new SysUserProfileDataService({ tenantId: databaseUtils.getTenantDataSourceID(tenant) });

        const adminUser = await userDs.insertIntoSysUser({
            username: username,
            password: password,
            is_active: true
        });

        await profileDs.insertIntoSysUserProfile({
            user_id: adminUser.id,
            firstname: ucFirst(tenant.name),
            lastname: "Administrator",
            email,
            avatar: ""
        });

        return adminUser;
    }

    /**
     * Creates a application record for a given tenant
     *
     * @protected
     * @param {ISysApplication} application
     * @param {ISysTenant} tenant
     * @return {*}
     * @memberof DatabaseSeed
     */
    protected async createApplication(application: ISysApplication, tenant: ISysTenant) {
        const applicationDs = new SysApplicationDataService({ tenantId: databaseUtils.getTenantDataSourceID(tenant) });
        return applicationDs.insertIntoSysApplication(application);
    }

    /**
     * Create a group
     *
     * @protected
     * @param {Partial<ISysRole>} group
     * @param {ISysTenant} tenant
     * @returns
     * @memberof DatabaseSeed
     */
    protected createRole(group: Partial<ISysRole>, tenant: ISysTenant) {
        const groupDs = new SysRoleDataService({ tenantId: databaseUtils.getTenantDataSourceID(tenant) });
        return groupDs.insertIntoSysRole(group as ISysRole);
    }

    /**
     * Assigns a user to a group
     *
     * @protected
     * @param {ISysUser} user
     * @param {ISysRole} group
     * @param {ISysTenant} tenant
     * @returns
     * @memberof DatabaseSeed
     */
    protected assignUserToGroup(user: ISysUser, group: ISysRole, tenant: ISysTenant) {
        const userGroupDs = new SysUserRoleDataService({ tenantId: databaseUtils.getTenantDataSourceID(tenant) });
        return userGroupDs.insertIntoSysUserRole({
            role_id: group.id,
            user_id: user.id
        });
    }

    /**
     * Create a permission
     *
     * @protected
     * @param {ISysPermission} perm
     * @param {ISysTenant} tenant
     * @returns
     * @memberof DatabaseSeed
     */
    protected createPermission(perm: ISysPermission, tenant: ISysTenant) {
        const permissionDs = new SysPermissionDataService({ tenantId: databaseUtils.getTenantDataSourceID(tenant) });
        return permissionDs.insertIntoSysPermission(perm);
    }

    /**
     * Assign permission to a group
     *
     * @protected
     * @param {ISysRole} group
     * @param {ISysPermission} perm
     * @param {ISysTenant} tenant
     * @returns
     * @memberof DatabaseSeed
     */
    protected assignRolePermission(group: ISysRole, perm: ISysPermission, tenant: ISysTenant) {
        const groupPermDs = new SysRolePermissionDataService({
            tenantId: databaseUtils.getTenantDataSourceID(tenant)
        });
        return groupPermDs.insertIntoSysRolePermission({
            role_id: group.id,
            permission_id: perm.id
        });
    }

    /**
     * Create a new client record
     *
     * @protected
     * @param {ISysClient} client
     * @param {ISysTenant} tenant
     * @returns
     * @memberof DatabaseSeed
     */
    protected createClient(client: ISysClient, tenant: ISysTenant) {
        const clientDs = new SysClientDataService({ tenantId: databaseUtils.getTenantDataSourceID(tenant) });
        return clientDs.insertIntoSysClient(client);
    }

    /**
     * Create JWK keys for a given tenant
     *
     * @protected
     * @param {ISysTenant} tenant
     * @returns
     * @memberof DatabaseSeed
     */
    protected async createJWKKeys(tenant: ISysTenant) {
        const keysDs = new SysKeyDataService({ tenantId: databaseUtils.getTenantDataSourceID(tenant) });
        return keysDs.insertIntoSysKey({
            key_type: "JWK",
            key_id: await sha256Hash(tenant.id + Date.now().toString()),
            data: (await commonUtils.generateKeyPareAndCertificate(tenant.name)) as any
        });
    }

    /**
     * Initializes a tenant
     *
     * @param {IInitializeTenant} {
     *         tenantName,
     *         databaseName,
     *         organization,
     *         allow_registration,
     *         allow_reset_password,
     *         username,
     *         password,
     *         email,
     *         serverURL
     *     }
     * @returns
     * @memberof DatabaseSeed
     */
    public async initializeTenant({
        tenantName,
        databaseName,
        organization,
        allow_registration,
        allow_reset_password,
        username,
        password,
        email,
        serverURL
    }: IInitializeTenant) {
        // is registry flag
        const isRegistry = tenantName === commonUtils.getPortaRegistryTenant();

        // normalize db name
        databaseName = isRegistry ? databaseName : `porta_${tenantName}`.toLocaleLowerCase();

        const dbInitialized = await this.isSystemInitialized(databaseName);

        let tenant: ISysTenant = undefined;

        if (isRegistry && !dbInitialized) {
            tenant = {
                database: databaseName,
                name: tenantName,
                organization,
                allow_registration: false,
                allow_reset_password: true,
                is_active: true
            };
        } else if (!dbInitialized) {
            tenant = {
                database: databaseName,
                name: tenantName,
                organization,
                allow_registration,
                allow_reset_password,
                is_active: true
            };
        }

        const tenantRecord = tenant ? await this.initializeDatabaseSchema({ tenant, isRegistry }) : undefined;

        // At this point we should have a tenant record and an empty database to seed further
        if (tenantRecord) {
            // create keys
            await this.createJWKKeys(tenantRecord);

            const adminApp = await this.createApplication(
                {
                    application_name: `${ucFirst(tenant.name)} Admin`,
                    description: `${tenantRecord.organization} Admin`,
                    is_active: true
                },
                tenantRecord
            );

            // admin user
            const adminUser = await this.createAdminUser(username.trim(), password.trim(), email.trim(), tenantRecord);
            const apiUser = await this.createAdminUser(
                `${tenant.name}@api`,
                password.trim(),
                email.trim(),
                tenantRecord
            );

            // default groups
            const usersGroup = await this.createRole(
                {
                    role: eApiRoles.SYSTEM_USERS,
                    role_type: "S"
                },
                tenantRecord
            );
            const adminGroup = await this.createRole(
                {
                    role: eApiRoles.SYSTEM_ADMINS,
                    role_type: "S"
                },
                tenantRecord
            );
            const apiGroup = await this.createRole(
                {
                    role: eApiRoles.SYSTEM_API,
                    role_type: "S"
                },
                tenantRecord
            );

            // assign the admin user to the system groups
            await this.assignUserToGroup(adminUser, usersGroup, tenantRecord);
            await this.assignUserToGroup(adminUser, adminGroup, tenantRecord);
            await this.assignUserToGroup(apiUser, apiGroup, tenantRecord);

            await asyncForEach(Object.entries(eApiPermissions), async ([_, perm]) => {
                switch (perm) {
                    case eApiPermissions.CAN_CREATE_TENANT:
                        if (isRegistry) {
                            await this.createPermission(
                                {
                                    id: MD5(perm),
                                    application_id: adminApp.id,
                                    description: "permissions_to_create_tenant",
                                    permission: eApiPermissions.CAN_CREATE_TENANT,
                                    is_active: true
                                },
                                tenantRecord
                            );
                        }
                        break;
                    default:
                        await this.createPermission(
                            {
                                id: MD5(perm),
                                application_id: adminApp.id,
                                permission: perm.toString(),
                                is_active: true,
                                description: undefined
                            },
                            tenantRecord
                        );
                }
            });

            if (isRegistry) {
                await this.assignRolePermission(
                    adminGroup,
                    { id: MD5(eApiPermissions.CAN_CREATE_TENANT) } as any,
                    tenantRecord
                );
            }

            asyncForEach(Object.entries(eApiPermissions), async ([_key, perm]) => {
                if (perm == eApiPermissions.CAN_MANAGE_TENANTS) {
                    await this.assignRolePermission(
                        adminGroup,
                        {
                            id: MD5(perm)
                        } as any,
                        tenantRecord
                    );
                }
            });

            // Creating ROLE/GROUP membership permissions to each group
            // so it runs out as roles on the Claims
            await asyncForEach([usersGroup, adminGroup, apiGroup], async (group) => {
                await this.assignRolePermission(
                    group,
                    {
                        id: MD5(eApiPermissions.ROLE_PERMISSION)
                    } as any,
                    tenantRecord
                );
            });

            await this.createClient(
                {
                    ...eDefaultClients.UI_CLIENT,
                    application_id: adminApp.id,
                    client_id: await sha256Hash(`porta_ui_${tenant.name}`),
                    secret: await sha256Hash(generateRandomUUID()),
                    redirect_uri: `${serverURL}/oidc/${tenant.name}/signin/callback`,
                    post_logout_redirect_uri: `${serverURL}/fe/auth/${tenant.name}/signout/complete`
                },
                tenantRecord
            );

            await this.createClient(
                {
                    ...eDefaultClients.API_CLIENT,
                    application_id: adminApp.id,
                    client_id: await sha256Hash(`porta_api_${tenant.name}`),
                    secret: await sha256Hash(generateRandomUUID()),
                    client_credentials_user_id: apiUser.id
                },
                tenantRecord
            );

            await this.createClient(
                {
                    ...eDefaultClients.CLI_CLIENT,
                    application_id: adminApp.id,
                    client_id: await sha256Hash(`porta_cli_${tenant.name}`),
                    secret: await sha256Hash(generateRandomUUID()),
                    redirect_uri: `http://localhost:9090/oidc/${tenant.name}/signin/callback`
                },
                tenantRecord
            );
        }

        return tenantRecord;
    }

    /**
     * Initializes the database schema
     *
     * @protected
     * @param {{ tenant: ISysTenant; isRegistry?: boolean }} { isRegistry, tenant }
     * @returns
     * @memberof DatabaseSeed
     */
    protected async initializeDatabaseSchema({ isRegistry, tenant }: { tenant: ISysTenant; isRegistry?: boolean }) {
        const defaultDataSource = dataSourceManager.getDataSource<PostgreSQLDataSource>(eDatabaseType.system);
        const { DB_USER, DB_HOST, DB_PORT, DB_PASSWORD } = application.getSettings<
            IPortaApplicationSetting & IDatabaseAppSettings
        >();

        // if this is not the registry database then create a tenant record
        // in the registry database
        if (!isRegistry) {
            const tenantDs = new SysTenantDataService({ tenantId: eDatabaseType.registry });
            tenant = await tenantDs.insertIntoSysTenant(tenant);

            dataSourceManager.registerDataSource(() => {
                return new PostgreSQLDataSource({
                    host: DB_HOST,
                    port: DB_PORT,
                    user: DB_USER,
                    password: DB_PASSWORD,
                    database: tenant.database
                });
            }, tenant.id);
        }

        // create the database
        await defaultDataSource.withContext(async (asyncContext) => {
            const ctx = await asyncContext;
            await ctx.executeQuery(`CREATE DATABASE ${tenant.database};`);
            await ctx.executeQuery(`GRANT ALL PRIVILEGES ON DATABASE ${tenant.database} TO ${DB_USER};`);
        });

        const tenantId = isRegistry ? eDatabaseType.registry : databaseUtils.getTenantDataSourceID(tenant);

        const dataSource = dataSourceManager.getDataSource<PostgreSQLDataSource>(tenantId);

        const readFileAsync = util.promisify(fs.readFile);

        const ctx = await dataSource.createSharedContext();
        await asyncForEach(["schema.sql", "views.sql"], async (file) => {
            const script = (
                await readFileAsync(path.join(__dirname, "..", "..", "resources", "database", file))
            ).toString();
            await ctx.executeQuery(script);
        });
        ctx.disposeContext();

        const tenantDs = new SysTenantDataService({ tenantId });
        tenant = await tenantDs.insertIntoSysTenant(tenant);
        return tenant;
    }
}
