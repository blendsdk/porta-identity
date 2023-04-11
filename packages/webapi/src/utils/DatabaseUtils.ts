import { dataSourceManager } from "@blendsdk/datakit";
import { PostgreSQLDataSource } from "@blendsdk/postgresql";
import { ISysClient, ISysRefreshTokenView, ISysSession, ISysTenant } from "@porta/shared";
import { IAccessToken, IAuthRequestParams, IPortaApplicationSetting, PORTA_REGISTRY } from "../types";
import fs from "fs";
import path from "path";
import util from "util";
import { IDatabaseAppSettings } from "@blendsdk/webafx";
import { application } from "../modules/application";
import { isString, ucFirst } from "@blendsdk/stdlib";
import { sha256Hash } from "@blendsdk/crypto";
import { SysGroupDataService } from "../dataservices/SysGroupDataService";
import { SysGroupPermissionDataService } from "../dataservices/SysGroupPermissionDataService";
import { SysKeyDataService } from "../dataservices/SysKeyDataService";
import { SysPermissionDataService } from "../dataservices/SysPermissionDataService";
import { SysUserDataService } from "../dataservices/SysUserDataService";
import { SysUserGroupDataService } from "../dataservices/SysUserGroupDataService";
import { SysUserProfileDataService } from "../dataservices/SysUserProfileDataService";
import { SysTenantDataService } from "../dataservices/SysTenantDataService";
import { commonUtils } from "./CommonUtils";
import { SysClientDataService } from "../dataservices/SysClientDataService";
import { SysAccessTokenDataService } from "../dataservices/SysAccessTokenDataService";
import { SysAccessTokenViewDataService } from "../dataservices/SysAccessTokenViewDataService";
import { SysRefreshTokenDataService } from "../dataservices/SysRefreshTokenDataService";
import { SysRefreshTokenViewDataService } from "../dataservices/SysRefreshTokenViewDataService";
import { SysSessionDataService } from "../dataservices/SysSessionDataService";
import { SysSessionViewDataService } from "../dataservices/SysSessionViewDataService";

class DatabaseUtils {
    /**
     * Get a data source id based on a tenant record
     *
     * @param {ISysTenant} tenant
     * @returns
     * @memberof DatabaseUtils
     */
    public getTenantDataSourceID(tenant: ISysTenant) {
        return tenant.name === PORTA_REGISTRY ? "default" : tenant.id;
    }

    public findTenant(tenant: string) {
        const tenantDs = new SysTenantDataService();
        return tenantDs.findByNameOrId({ name: tenant.toString() });
    }

    /**
     * Creates a client with a redirect record for a given tenant
     *
     * @param {ISysClient} client
     * @param {ISysTenant} tenant
     * @returns
     * @memberof DatabaseUtils
     */
    public createClient(client: ISysClient, tenant: ISysTenant) {
        const clientDs = new SysClientDataService({ tenantId: tenant.id });
        return clientDs.insertIntoSysClient({
            application_name: client.application_name || tenant.organization,
            client_id: client.client_id || commonUtils.getUUID(),
            client_type: client.client_type,
            client_credentials_user_id: client.client_credentials_user_id || null,
            description: client.description || `${tenant.name} webapp client`,
            logo: client.logo || null,
            post_logout_redirect_uri: client.post_logout_redirect_uri,
            redirect_uri: client.redirect_uri,
            secret: client.secret || commonUtils.getUUID(),
            access_token_ttl: client.access_token_ttl,
            refresh_token_ttl: client.refresh_token_ttl,
            valid_from: client.valid_from,
            valid_until: client.valid_until
        });
    }

    /**
     * Initializes a DataSource for a tenant
     *
     * @param {ISysTenant} tenant
     * @memberof DatabaseUtils
     */
    public async initializeTenantDataSource(tenant: ISysTenant | string) {
        const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD } = application.getSettings<IDatabaseAppSettings>();
        let tenantRecord: ISysTenant = undefined;

        if (isString(tenant)) {
            tenantRecord = await this.findTenant(tenant.toString());
        } else {
            tenantRecord = tenant as ISysTenant;
        }

        let dataSource: PostgreSQLDataSource = dataSourceManager.getDataSource(
            this.getTenantDataSourceID(tenantRecord)
        );

        //  Register the data source if needed
        if (!dataSource) {
            dataSourceManager.registerDataSource(() => {
                return new PostgreSQLDataSource({
                    host: DB_HOST,
                    port: DB_PORT,
                    user: DB_USER,
                    password: DB_PASSWORD,
                    database: tenantRecord.database
                });
            }, tenantRecord.id);

            // test the connection. Will break if there is something with with the database
            dataSource = dataSourceManager.getDataSource(tenantRecord.id);
            const ctx = await dataSource.createContext();
            await ctx.disposeContext();
            return tenantRecord;
        }
    }

    /**
     * Delete the tenant by removing the database name
     *
     * @param {string} name
     * @returns
     * @memberof DatabaseUtils
     */
    public deleteTenant(name: string) {
        return new Promise<boolean>(async (resolve, reject) => {
            try {
                const defaultDataSource = dataSourceManager.getDataSource<PostgreSQLDataSource>();
                await defaultDataSource.withContext(async (asyncContext) => {
                    const tenantDs = new SysTenantDataService({ sharedContext: asyncContext });
                    const tenantRecord = await tenantDs.findByNameOrId({ name });
                    if (tenantRecord) {
                        const ctx = await asyncContext;
                        await ctx.executeQuery(`DROP DATABASE IF EXISTS ${tenantRecord.database}`);
                        await tenantDs.deleteSysTenantById({ id: tenantRecord.id });
                    }
                });
                resolve(true);
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Initializes a tenant database
     *
     * @protected
     * @param {string} dbName
     * @param {boolean} [registry]
     * @returns
     * @memberof DatabaseUtils
     */
    protected initializeDatabaseSchema(dbName: string, registry?: boolean, tenant?: ISysTenant) {
        return new Promise<PostgreSQLDataSource>(async (resolve, reject) => {
            try {
                const defaultDataSource = dataSourceManager.getDataSource<PostgreSQLDataSource>();
                const { DB_USER, DB_HOST, DB_PORT, DB_PASSWORD } = application.getSettings<
                    IPortaApplicationSetting & IDatabaseAppSettings
                >();

                if (!registry) {
                    await defaultDataSource.withContext(async (asyncContext) => {
                        const ctx = await asyncContext;
                        await ctx.executeQuery(`CREATE DATABASE ${dbName};`);
                        await ctx.executeQuery(`GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${DB_USER};`);
                    });
                }

                const tenantDs = new PostgreSQLDataSource({
                    host: DB_HOST,
                    port: DB_PORT,
                    user: DB_USER,
                    password: DB_PASSWORD,
                    database: dbName
                });

                await tenantDs.withContext(async (asyncContext) => {
                    const readFileAsync = util.promisify(fs.readFile);

                    const dbSchema = (
                        await readFileAsync(path.join(__dirname, "..", "..", "resources", "database", "schema.sql"))
                    ).toString();

                    const ctx = await asyncContext;
                    await ctx.executeQuery(dbSchema);

                    // copy the tenant record from the registry to the (sub) database
                    if (!registry && tenant) {
                        const tenantDs = new SysTenantDataService({ sharedContext: asyncContext });
                        await tenantDs.insertIntoSysTenant(tenant);
                    }
                    resolve(tenantDs);
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Seeds a tenant database
     *
     * @protected
     * @param {PostgreSQLDataSource} dbConn
     * @param {string} admin_user
     * @param {string} admin_password
     * @param {string} tenantName
     * @returns
     * @memberof DatabaseUtils
     */
    protected seedDatabase(
        dbConn: PostgreSQLDataSource,
        admin_user: string,
        admin_password: string,
        tenantName: string
    ) {
        return dbConn.withContext(async (sharedContext) => {
            const userDs = new SysUserDataService({ sharedContext });
            const profileDs = new SysUserProfileDataService({ sharedContext });
            const keysDs = new SysKeyDataService({ sharedContext });
            const groupDs = new SysGroupDataService({ sharedContext });
            const userGroupDs = new SysUserGroupDataService({ sharedContext });
            const permissionDs = new SysPermissionDataService({ sharedContext });
            const groupPermissionDs = new SysGroupPermissionDataService({ sharedContext });

            const adminUser = await userDs.insertIntoSysUser({
                username: admin_user,
                password: admin_password,
                is_active: true
            });

            await profileDs.insertIntoSysUserProfile({
                user_id: adminUser.id,
                firstname: ucFirst(tenantName),
                lastname: "Administrator"
            });

            const adminGroup = await groupDs.insertIntoSysGroup({
                name: "Administrators",
                description: `${tenantName} administrators group`,
                is_active: true
            });

            const userGroup = await groupDs.insertIntoSysGroup({
                name: "Users",
                description: "All users",
                is_active: true
            });

            await groupDs.insertIntoSysGroup({
                name: "Services",
                description: "All service accounts",
                is_active: true
            });

            await userGroupDs.insertIntoSysUserGroup({
                user_id: adminUser.id,
                group_id: adminGroup.id
            });

            await userGroupDs.insertIntoSysUserGroup({
                user_id: adminUser.id,
                group_id: userGroup.id
            });

            const adminPerm = await permissionDs.insertIntoSysPermission({
                code: "ADMIN",
                description: "Can perform system administrative operations",
                is_active: true
            });

            await groupPermissionDs.insertIntoSysGroupPermission({
                group_id: adminGroup.id,
                permission_id: adminPerm.id
            });

            await keysDs.insertIntoSysKey({
                key_type: "JWK",
                key_id: await sha256Hash(Date.now().toString()),
                data: (await commonUtils.generateKeyPareAndCertificate(tenantName)) as any
            });
        });
    }

    /**
     * Create a tenant database and initializes a tenant database
     *
     * @param {string} tenantName
     * @returns
     * @memberof DatabaseUtils
     */
    public initializeTenant(
        tenantName: string,
        databaseName: string,
        organization: string,
        allow_registration: boolean,
        allow_reset_password: boolean,
        admin_user: string,
        admin_password: string
    ) {
        return new Promise<void>(async (resolve, reject) => {
            try {
                // check if this is the porta database itself
                if (tenantName === PORTA_REGISTRY) {
                    // check if the porta database is already initialized by checking
                    // if the sys_tenant TABLE exists. In case it doeS not exists then
                    // we will create the database tables
                    const ctx = await dataSourceManager.getDataSource<PostgreSQLDataSource>().createContext();
                    const { data: initialized } = await ctx.executeQuery(
                        "select * from information_schema.tables where table_name = :table_name and table_catalog = :table_catalog",
                        {
                            table_name: "sys_tenant",
                            table_catalog: databaseName
                        },
                        { single: true }
                    );
                    // initialize the schema
                    if (!initialized) {
                        application
                            .getLogger()
                            .info(`Initializing ${tenantName} tenant with database ${databaseName}.`);
                        const dbConn = await this.initializeDatabaseSchema(databaseName, true);
                        await this.seedDatabase(dbConn, admin_user, admin_password, tenantName);
                        await dbConn.withContext(async (sharedContext) => {
                            const tenantDs = new SysTenantDataService({ sharedContext });
                            tenantDs.insertIntoSysTenant({
                                name: tenantName,
                                organization: "Porta Registry Tenant",
                                allow_registration: false,
                                allow_reset_password: true,
                                is_active: true,
                                database: databaseName
                            });
                        });
                    }
                    resolve();
                } else {
                    // we check to see if this tenant exists
                    const sharedContext = dataSourceManager.getDataSource<PostgreSQLDataSource>().createSharedContext();
                    const tenantDs = new SysTenantDataService({ sharedContext });
                    const tenantRecord = await tenantDs.findByNameOrId({ name: tenantName });
                    // create a tenant record and initialize the tenant database
                    if (!tenantRecord) {
                        databaseName = `porta_${databaseName}`;
                        application.getLogger().info(`Initializing ${tenantName} tenant.`);
                        const newTenantRecord = await tenantDs.insertIntoSysTenant({
                            name: tenantName,
                            organization,
                            allow_registration,
                            allow_reset_password,
                            is_active: true,
                            database: databaseName
                        });
                        const dbConn = await this.initializeDatabaseSchema(databaseName, false, newTenantRecord);
                        await this.seedDatabase(dbConn, admin_user, admin_password, tenantName);
                        await dbConn.closeConnection();
                    }
                    (await sharedContext).disposeContext();
                    resolve();
                }
            } catch (err) {
                reject(err);
            }
        });
    }

    public async newRefreshToken(tenant_id: string, access_token_id: string, ttl: number) {
        const { dataSource } = (await this.getTenantDataSource(tenant_id)) || {};
        const refreshTokenDs = new SysRefreshTokenDataService({ dataSource });
        const result = await refreshTokenDs.insertIntoSysRefreshToken({
            access_token_id,
            ttl
        });
        return this.findRefreshTokenByTenant(tenant_id, result.refresh_token);
    }

    /**
     * Fins a refresh_token by tenant
     *
     * @param {string} tenant
     * @param {string} refresh_token
     * @returns {Promise<ISysRefreshTokenView>}
     * @memberof DatabaseUtils
     */
    public async findRefreshTokenByTenant(tenant: string, refresh_token: string): Promise<ISysRefreshTokenView> {
        const { dataSource } = (await this.getTenantDataSource(tenant)) || {};
        const refreshTokenDs = new SysRefreshTokenViewDataService({ dataSource });
        return await refreshTokenDs.findRefreshToken({ refresh_token });
    }

    /**
     * Finds a refresh_token corresponding the access_token
     *
     * @param {string} tenant
     * @param {string} access_token
     * @returns {Promise<ISysRefreshTokenView>}
     * @memberof DatabaseUtils
     */
    public async findRefreshTokenByTenantAndAccessToken(
        tenant: string,
        access_token: string
    ): Promise<ISysRefreshTokenView> {
        const { dataSource } = (await this.getTenantDataSource(tenant)) || {};
        const refreshTokenDs = new SysRefreshTokenViewDataService({ dataSource });
        return await refreshTokenDs.findRefreshTokenByAccessToken({ access_token });
    }

    /**
     * Create a new session or retrieve the existing one for a given user and client
     *
     * @param {string} tenant_id
     * @param {string} client_id
     * @param {string} user_id
     * @returns
     * @memberof DatabaseUtils
     */
    public async createOrGetSession(tenant_id: string, client_id: string, user_id: string) {
        let sessionRecord: ISysSession = undefined;

        const { dataSource } = (await this.getTenantDataSource(tenant_id)) || {};
        const sharedContext = dataSource.createSharedContext();
        const sessionDs = new SysSessionDataService({ sharedContext });
        const sessionViewDs = new SysSessionViewDataService({ sharedContext });

        // calculate the sid that is overlapping all clients
        const session_id = await sha256Hash([tenant_id, user_id].join(""));

        // try finding an existing session
        sessionRecord = await sessionDs.findSysSessionByUserIdAndClientId({
            user_id,
            client_id
        });

        // or create a new session
        sessionRecord =
            sessionRecord ||
            (await sessionDs.insertIntoSysSession({
                client_id,
                user_id,
                session_id
            }));

        // find the record above as view
        const result = await sessionViewDs.findSessionBySessionId({ id: sessionRecord.id });

        await (await sharedContext).disposeContext();
        return result;
    }

    /**
     * Creates new access_token
     *
     * @param {string} tenant_id
     * @param {string} client_id
     * @param {string} user_id
     * @param {string} session_id
     * @param {number} ttl
     * @param {number} refresh_ttl
     * @param {IAuthRequestParams} auth_request_params
     * @returns
     * @memberof DatabaseUtils
     */
    public async newAccessToken(
        tenant_id: string,
        client_id: string,
        user_id: string,
        session_id: string,
        ttl: number,
        refresh_ttl: number,
        auth_request_params: IAuthRequestParams
    ) {
        const { dataSource } = (await this.getTenantDataSource(tenant_id)) || {};
        const accessTokenDs = new SysAccessTokenDataService({ dataSource });
        const result = await accessTokenDs.insertIntoSysAccessToken({
            tenant_id,
            client_id,
            user_id,
            session_id,
            ttl,
            refresh_ttl,
            auth_request_params,
            auth_time: auth_request_params.auth_time || Math.trunc(new Date().getTime() / 1000)
        });
        return this.findAccessTokenByTenant(tenant_id, result.access_token);
    }

    /**
     * TODO: doc
     *
     * @param {string} tenant
     * @param {string} access_token
     * @returns
     * @memberof EndpointController
     */
    public async findAccessTokenByTenant(tenant: string, access_token: string): Promise<IAccessToken> {
        const { dataSource } = (await this.getTenantDataSource(tenant)) || {};
        const accessTokenDs = new SysAccessTokenViewDataService({ dataSource });
        const result = await accessTokenDs.findAccessToken({ access_token });

        // const userGroupDs = new SysUserGroupDataService({ sharedContext });
        // const permissionDs = new SysPermissionDataService({ sharedContext });

        // const userPerms = await permissionDs.findPermissionsByUserId({ user_id: userRecord.id });
        // const userGroups = await userGroupDs.findGroupsByUserId({
        //     user_id: userRecord.id
        // });

        return result
            ? ({
                  ...(result as any),
                  roles: [],
                  permissions: []
              } as IAccessToken)
            : undefined;
    }

    /**
     * TODO: doc
     *
     * @param {string} tenant
     * @returns
     * @memberof EndpointController
     */
    public async getTenantDataSource(tenant: string) {
        const tenantRecord = await this.getTenant(tenant);
        if (tenant) {
            await this.initializeTenantDataSource(tenantRecord);
            return {
                tenantRecord,
                dataSource: dataSourceManager.getDataSource<PostgreSQLDataSource>(
                    this.getTenantDataSourceID(tenantRecord)
                )
            };
        } else {
            return undefined;
        }
    }

    /**
     * Gets a tenant from the registered tenants list
     *
     * @param {string} tenant
     * @returns {Promise<ISysTenant>}
     * @memberof EndPointController
     */
    public async getTenant(tenant: string): Promise<ISysTenant> {
        const tenantDs = new SysTenantDataService();
        return await tenantDs.findByNameOrId({ name: tenant });
    }
}

export const databaseUtils = new DatabaseUtils();
