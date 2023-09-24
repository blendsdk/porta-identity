import { generateRandomUUID, sha256Hash } from "@blendsdk/crypto";
import { dataSourceManager } from "@blendsdk/datakit";
import { PostgreSQLDataSource } from "@blendsdk/postgresql";
import { asyncForEach, IDictionaryOf, isNullOrUndef, MD5, ucFirst } from "@blendsdk/stdlib";
import { IDatabaseAppSettings } from "@blendsdk/webafx";
import {
    eDefaultPermissions,
    eDefaultSystemGroups,
    ISysClient,
    ISysGroup,
    ISysPermission,
    ISysTenant,
    ISysUser
} from "@porta/shared";
import fs from "fs";
import path from "path";
import util from "util";
import { SysClientDataService } from "../dataservices/SysClientDataService";
import { SysGroupDataService } from "../dataservices/SysGroupDataService";
import { SysGroupPermissionDataService } from "../dataservices/SysGroupPermissionDataService";
import { SysKeyDataService } from "../dataservices/SysKeyDataService";
import { SysPermissionDataService } from "../dataservices/SysPermissionDataService";
import { SysTenantDataService } from "../dataservices/SysTenantDataService";
import { SysUserDataService } from "../dataservices/SysUserDataService";
import { SysUserGroupDataService } from "../dataservices/SysUserGroupDataService";
import { SysUserProfileDataService } from "../dataservices/SysUserProfileDataService";
import { application } from "../modules/application";
import { eDatabaseType, IPortaApplicationSetting } from "../types";
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
        application_name: undefined
    },
    API_CLIENT: {
        id: MD5("porta_api_client"),
        client_type: "S",
        description: "porta_api_application",
        is_active: true,
        is_system_client: true,
        client_id: "porta_api_client",
        application_name: undefined
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
    admin_user: string;
    admin_password: string;
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
            avatar: "n/a"
        });

        return adminUser;
    }

    /**
     * Create a group
     *
     * @protected
     * @param {Partial<ISysGroup>} group
     * @param {ISysTenant} tenant
     * @returns
     * @memberof DatabaseSeed
     */
    protected createGroup(group: Partial<ISysGroup>, tenant: ISysTenant) {
        const groupDs = new SysGroupDataService({ tenantId: databaseUtils.getTenantDataSourceID(tenant) });
        return groupDs.insertIntoSysGroup(group as ISysGroup);
    }

    /**
     * Assigns a user to a group
     *
     * @protected
     * @param {ISysUser} user
     * @param {ISysGroup} group
     * @param {ISysTenant} tenant
     * @returns
     * @memberof DatabaseSeed
     */
    protected assignUserToGroup(user: ISysUser, group: ISysGroup, tenant: ISysTenant) {
        const userGroupDs = new SysUserGroupDataService({ tenantId: databaseUtils.getTenantDataSourceID(tenant) });
        return userGroupDs.insertIntoSysUserGroup({
            group_id: group.id,
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
     * @param {ISysGroup} group
     * @param {ISysPermission} perm
     * @param {ISysTenant} tenant
     * @returns
     * @memberof DatabaseSeed
     */
    protected assignGroupPermission(group: ISysGroup, perm: ISysPermission, tenant: ISysTenant) {
        const groupPermDs = new SysGroupPermissionDataService({
            tenantId: databaseUtils.getTenantDataSourceID(tenant)
        });
        return groupPermDs.insertIntoSysGroupPermission({
            group_id: group.id,
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
            key_id: await sha256Hash(Date.now().toString()),
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

            // admin user
            const adminUser = await this.createAdminUser(username.trim(), password.trim(), email.trim(), tenantRecord);
            const apiUser = await this.createAdminUser(
                `${tenant.name}@api`,
                password.trim(),
                email.trim(),
                tenantRecord
            );

            // default groups
            const usersGroup = await this.createGroup(eDefaultSystemGroups.USERS_GROUP, tenant);
            const adminGroup = await this.createGroup(eDefaultSystemGroups.ADMINISTRATORS_GROUP, tenant);
            const apiGroup = await this.createGroup(eDefaultSystemGroups.API_GROUP, tenant);

            // assign the admin user to the system groups
            await this.assignUserToGroup(adminUser, usersGroup, tenant);
            await this.assignUserToGroup(adminUser, adminGroup, tenant);
            await this.assignUserToGroup(apiUser, apiGroup, tenant);

            await asyncForEach(Object.entries(eDefaultPermissions), async ([code, perm]) => {
                switch (code) {
                    case eDefaultPermissions.CAN_CREATE_TENANT.code:
                        if (isRegistry) {
                            await this.createPermission(perm, tenant);
                        }
                        break;
                    default:
                        await this.createPermission(perm, tenant);
                }
            });

            if (isRegistry) {
                await this.assignGroupPermission(adminGroup, eDefaultPermissions.CAN_CREATE_TENANT, tenant);
            }

            // Creating ROLE/GROUP membership permissions to each group
            // so it runs out as roles on the Claims
            await asyncForEach([usersGroup, adminGroup, apiGroup], async (group) => {
                await this.assignGroupPermission(group, eDefaultPermissions.GROUP_PERMISSION, tenant);
            });

            await this.createClient(
                {
                    ...eDefaultClients.UI_CLIENT,
                    application_name: `${ucFirst(tenant.name)} Admin`,
                    client_id: await sha256Hash(`porta_ui_${tenant.id}`),
                    secret: await sha256Hash(generateRandomUUID()),
                    redirect_uri: `${serverURL}/oidc/${tenant.name}/signin/callback`,
                    post_logout_redirect_uri: `${serverURL}/oidc/${tenant.name}/signout/callback`
                },
                tenant
            );

            await this.createClient(
                {
                    ...eDefaultClients.API_CLIENT,
                    application_name: `${ucFirst(tenant.name)} API`,
                    client_id: await sha256Hash(`porta_api_${tenant.id}`),
                    secret: await sha256Hash(generateRandomUUID()),
                    client_credentials_user_id: apiUser.id
                },
                tenant
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

        if (isRegistry) {
            const tenantDs = new SysTenantDataService({ tenantId });
            tenant = await tenantDs.insertIntoSysTenant(tenant);
        }
        return tenant;
    }
}
