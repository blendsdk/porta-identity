import { sha256Hash } from "@blendsdk/crypto";
import { dataSourceManager } from "@blendsdk/datakit";
import { PostgreSQLDataSource } from "@blendsdk/postgresql";
import { isString } from "@blendsdk/stdlib";
import { IDatabaseAppSettings } from "@blendsdk/webafx";
import { ISysAuthorizationView, ISysRefreshTokenView, ISysSession, ISysTenant } from "@porta/shared";
import * as jose from "jose";
import { SysAccessTokenDataService } from "../dataservices/SysAccessTokenDataService";
import { SysAccessTokenViewDataService } from "../dataservices/SysAccessTokenViewDataService";
import { SysKeyDataService } from "../dataservices/SysKeyDataService";
import { SysPermissionDataService } from "../dataservices/SysPermissionDataService";
import { SysRefreshTokenDataService } from "../dataservices/SysRefreshTokenDataService";
import { SysRefreshTokenViewDataService } from "../dataservices/SysRefreshTokenViewDataService";
import { SysSessionDataService } from "../dataservices/SysSessionDataService";
import { SysSessionViewDataService } from "../dataservices/SysSessionViewDataService";
import { SysTenantDataService } from "../dataservices/SysTenantDataService";
import { application } from "../modules/application";
import { millisecondsToSeconds } from "../modules/auth/utils";
import { eDatabaseType, eOAuthSigningAlg, IAccessToken, IAuthRequestParams } from "../types";
import { commonUtils } from "./CommonUtils";

class DatabaseUtils {
    /**
     * Get a data source id based on a tenant record
     *
     * @param {ISysTenant} tenant
     * @returns
     * @memberof DatabaseUtils
     */
    public getTenantDataSourceID(tenant: ISysTenant) {
        return tenant.name === commonUtils.getPortaRegistryTenant() ? eDatabaseType.registry : tenant.id;
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
        }
        return tenantRecord;
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
     * Creates new JWT access token
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
        tenant: ISysTenant,
        client: ISysAuthorizationView,
        user_id: string,
        session_id: string,
        ttl: number,
        refresh_ttl: number,
        auth_request_params: IAuthRequestParams,
        issuer: string
    ) {
        const { dataSource } = (await this.getTenantDataSource(tenant.id)) || {};
        const accessTokenDs = new SysAccessTokenDataService({ dataSource });

        const { privateKey } = await this.getJWKSigningKeys(tenant);
        const pKey = await jose.importPKCS8(privateKey, eOAuthSigningAlg.RS256);

        const date_created = new Date();

        const access_token = await new jose.SignJWT({
            client_id: client.client_id,
            ten: tenant.id
        }) //
            .setProtectedHeader({ alg: eOAuthSigningAlg.RS256, typ: "at+JWT" })
            .setIssuer(issuer)
            .setExpirationTime(millisecondsToSeconds(date_created.getTime()) + ttl)
            .setAudience(auth_request_params.resource || client.client_id)
            .setSubject(user_id)
            .setJti(session_id)
            .setIssuedAt(millisecondsToSeconds(date_created.getTime()))
            .sign(pKey);

        const result = await accessTokenDs.insertIntoSysAccessToken({
            access_token,
            tenant_id: tenant.id,
            client_id: client.id,
            user_id,
            session_id,
            ttl,
            refresh_ttl,
            auth_request_params,
            auth_time: auth_request_params.auth_time || Math.trunc(new Date().getTime() / 1000),
            date_created: date_created.toISOString()
        });

        return this.findAccessTokenByTenant(tenant.id, result.access_token);
    }

    /**
     * Creates a new JWT refresh token
     *
     * @param {ISysTenant} tenant
     * @param {ISysAuthorizationView} client
     * @param {string} user_id
     * @param {string} session_id
     * @param {number} ttl
     * @param {IAuthRequestParams} auth_request_params
     * @param {string} issuer
     * @param {string} access_token_id
     * @returns
     * @memberof DatabaseUtils
     */
    public async newRefreshToken(
        tenant: ISysTenant,
        client: ISysAuthorizationView,
        user_id: string,
        session_id: string,
        ttl: number,
        auth_request_params: IAuthRequestParams,
        issuer: string,
        access_token_id: string
    ) {
        const { dataSource } = (await this.getTenantDataSource(tenant.id)) || {};
        const refreshTokenDs = new SysRefreshTokenDataService({ dataSource });

        const { privateKey } = await this.getJWKSigningKeys(tenant);
        const pKey = await jose.importPKCS8(privateKey, eOAuthSigningAlg.RS256);

        const date_created = new Date();

        const refresh_token = await new jose.SignJWT({
            client_id: client.client_id,
            ten: tenant.id,
            ati: access_token_id
        }) //
            .setProtectedHeader({ alg: eOAuthSigningAlg.RS256, typ: "rt+JWT" })
            .setIssuer(issuer)
            .setExpirationTime(millisecondsToSeconds(date_created.getTime()) + ttl)
            .setAudience(auth_request_params.resource || client.client_id)
            .setSubject(user_id)
            .setJti(session_id)
            .setIssuedAt(millisecondsToSeconds(date_created.getTime()))
            .sign(pKey);

        const result = await refreshTokenDs.insertIntoSysRefreshToken({
            access_token_id,
            refresh_token,
            ttl,
            date_created: date_created.toISOString()
        });

        return this.findRefreshTokenByTenant(tenant.id, result.refresh_token);
    }

    /**
     * Returns the JWK keys from the keystore
     *
     * @protected
     * @param {ISysTenant} tenant
     * @returns {Promise<{ privateKey: string; publicKey: string }>}
     * @memberof DatabaseUtils
     */
    public async getJWKSigningKeys(tenant: ISysTenant): Promise<{ privateKey: string; publicKey: string }> {
        const keyDs = new SysKeyDataService({ tenantId: databaseUtils.getTenantDataSourceID(tenant) });
        const { data } = (await keyDs.findJwkKeys())[0];
        return JSON.parse(data);
    }

    /**
     * Finds the access token record by tenant and access_token
     *
     * @param {string} tenant
     * @param {string} access_token
     * @returns
     * @memberof EndpointController
     */
    public async findAccessTokenByTenant(tenant: string, access_token: string): Promise<IAccessToken> {
        const { dataSource } = (await this.getTenantDataSource(tenant)) || {};
        const accessTokenDs = new SysAccessTokenViewDataService({ dataSource });
        const accessToken = await accessTokenDs.findAccessToken({ access_token });
        const permissionsDs = new SysPermissionDataService({ dataSource });

        if (accessToken) {
            const permissions = (await permissionsDs.findPermissionsByUserId({ user_id: accessToken.user_id })) || [];
            return {
                ...(accessToken as any),
                roles: permissions
                    .filter((p) => {
                        return p.group_is_active === true;
                    })
                    .map((p) => {
                        const { group_id: id, group_name: name, group_is_active } = p;
                        return {
                            id,
                            name,
                            is_active: group_is_active
                        };
                    }),
                permissions: permissions
                    .filter((p) => {
                        return p.is_active === true;
                    })
                    .map((p) => {
                        const { permission_id, code, is_active } = p;
                        return {
                            permission_id,
                            code,
                            is_active
                        };
                    })
            } as IAccessToken;
        } else {
            return undefined;
        }
    }

    /**
     * @param {string} tenant
     * @returns
     * @memberof EndpointController
     */
    public async getTenantDataSource(tenant: string) {
        const tenantRecord = await this.findTenant(tenant);
        if (tenantRecord) {
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
     * Finds a tenant from the registered tenants list
     *
     * @param {string} tenant
     * @returns {Promise<ISysTenant>}
     * @memberof EndPointController
     */
    public async findTenant(tenant: string): Promise<ISysTenant> {
        const tenantDs = new SysTenantDataService({ tenantId: eDatabaseType.registry });
        return await tenantDs.findByNameOrId({ name: tenant });
    }
}

export const databaseUtils = new DatabaseUtils();
