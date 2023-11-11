import { sha256Hash } from "@blendsdk/crypto";
import { dataSourceManager, expression } from "@blendsdk/datakit";
import { PostgreSQLDataSource } from "@blendsdk/postgresql";
import { IDictionaryOf, isString } from "@blendsdk/stdlib";
import { IDatabaseAppSettings } from "@blendsdk/webafx";
import { ISysAuthorizationView, ISysClient, ISysRefreshTokenView, ISysSession, ISysTenant } from "@porta/shared";
import * as jose from "jose";
import { ClientMetadata } from "openid-client";
import { SysAccessTokenDataService } from "../dataservices/SysAccessTokenDataService";
import { SysAccessTokenViewDataService } from "../dataservices/SysAccessTokenViewDataService";
import { SysClientDataService } from "../dataservices/SysClientDataService";
import { SysKeyDataService } from "../dataservices/SysKeyDataService";
import { SysPermissionDataService } from "../dataservices/SysPermissionDataService";
import { SysRefreshTokenDataService } from "../dataservices/SysRefreshTokenDataService";
import { SysRefreshTokenViewDataService } from "../dataservices/SysRefreshTokenViewDataService";
import { SysSessionDataService } from "../dataservices/SysSessionDataService";
import { SysSessionViewDataService } from "../dataservices/SysSessionViewDataService";
import { SysTenantDataService } from "../dataservices/SysTenantDataService";
import { SysUserDataService } from "../dataservices/SysUserDataService";
import { SysUserProfileDataService } from "../dataservices/SysUserProfileDataService";
import { application } from "../modules/application";
import { millisecondsToSeconds } from "../modules/auth/utils";
import { IAccessToken, IAuthRequestParams, eDatabaseType, eOAuthSigningAlg } from "../types";
import { commonUtils } from "./CommonUtils";
import { eDefaultClients } from "./DatabaseSeed";

export interface IFindAccessTokenByTenant {
    tenant: string;
    access_token: string;
    token_reference?: boolean;
    check_validity?: boolean; // defaults to true
}

export interface IFindRefreshTokenByTenantAndAccessToken extends Omit<IFindAccessTokenByTenant, "token_reference"> {}

export interface IFindRefreshTokenByTenant {
    tenant: string;
    refresh_token: string;
    check_validity?: boolean; // defaults to true
}

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
     * Finds a user by given userid
     *
     * @param {string} user_id
     * @param {string} tenant
     * @returns
     * @memberof DatabaseUtils
     */
    public async findUserByUserId(user_id: string, tenant: string) {
        const { dataSource } = (await this.getTenantDataSource(tenant)) || {};
        const userDs = new SysUserDataService({ dataSource });
        const profileDs = new SysUserProfileDataService({ dataSource });
        const user = await userDs.findSysUserById({ id: user_id });
        const profile = user ? await profileDs.findUserProfileByUserId({ user_id }) : undefined;
        return {
            user,
            profile
        };
    }

    /**
     * Fins a refresh_token by tenant
     *
     * @param {string} tenant
     * @param {string} refresh_token
     * @returns {Promise<ISysRefreshTokenView>}
     * @memberof DatabaseUtils
     */
    public async findRefreshTokenByTenant(params: IFindRefreshTokenByTenant): Promise<ISysRefreshTokenView> {
        let { tenant, check_validity, refresh_token } = params;
        check_validity = check_validity === false ? false : true;
        const { dataSource } = (await this.getTenantDataSource(tenant)) || {};
        const refreshTokenDs = new SysRefreshTokenViewDataService({ dataSource });
        const refreshToken = await refreshTokenDs.findRefreshToken({ refresh_token });
        const isValid = check_validity === true ? !refreshToken.is_expired : true;
        return isValid ? refreshToken : undefined;
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
        params: IFindRefreshTokenByTenantAndAccessToken
    ): Promise<ISysRefreshTokenView> {
        const { tenant, access_token, check_validity } = params;
        const { dataSource } = (await this.getTenantDataSource(tenant)) || {};
        const refreshTokenDs = new SysRefreshTokenViewDataService({ dataSource });
        const refreshToken = await refreshTokenDs.findRefreshTokenByAccessToken({ access_token });
        const isValid = check_validity === true ? !refreshToken.is_expired : true;
        return isValid ? refreshToken : undefined;
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
        //TODO: This should be changed to user_id and tenant
        sessionRecord = await sessionDs.findSysSessionByUserIdAndClientId({
            user_id,
            client_id
        });

        // A session is per use and tenant! remove the client!
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
        issuer: string,
        claims: IDictionaryOf<any>
    ) {
        const { dataSource } = (await this.getTenantDataSource(tenant.id)) || {};
        const accessTokenDs = new SysAccessTokenDataService({ dataSource });

        const { privateKey } = await this.getJWKSigningKeys(tenant);
        const pKey = await jose.importPKCS8(privateKey, eOAuthSigningAlg.RS256);

        const date_created = new Date();

        const access_token = await new jose.SignJWT({
            client_id: client.client_id,
            ten: tenant.id,
            ...claims
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

        return this.findAccessTokenByTenant({ tenant: tenant.id, access_token: result.access_token });
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

        return this.findRefreshTokenByTenant({ tenant: tenant.id, refresh_token: result.refresh_token });
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
    public async findAccessTokenByTenant(params: IFindAccessTokenByTenant): Promise<IAccessToken> {
        let { access_token, tenant, check_validity, token_reference } = params;

        // make true by default
        (check_validity == check_validity) === false ? false : true;

        const { dataSource } = (await this.getTenantDataSource(tenant)) || {};
        const accessTokenDs = new SysAccessTokenViewDataService({ dataSource });
        const accessToken = token_reference
            ? await accessTokenDs.findAccessTokenByReference({ token_reference: access_token })
            : await accessTokenDs.findAccessToken({ access_token });
        const permissionsDs = new SysPermissionDataService({ dataSource });

        if (accessToken) {
            //TODO: Should be type fixed
            const clientRecord = accessToken.client as any as ISysClient;

            const isValid = check_validity === true ? !accessToken.is_expired : true;
            const permissions =
                (await permissionsDs.findPermissionsByUserIdAndClientId({
                    user_id: accessToken.user_id,
                    client_id: clientRecord.id
                })) || [];
            const result = {
                ...(accessToken as any),
                roles: permissions
                    .filter((p) => {
                        return p.role_is_active === true;
                    })
                    .map((p) => {
                        const { role_id: id, role, role_is_active } = p;
                        return {
                            id,
                            role,
                            is_active: role_is_active
                        };
                    }),
                permissions: permissions
                    .filter((p) => {
                        return p.is_active === true;
                    })
                    .map((p) => {
                        const { permission_id, permission, is_active } = p;
                        return {
                            permission_id,
                            permission,
                            is_active
                        };
                    })
            } as IAccessToken;
            return isValid ? result : undefined;
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

    public async listTenants(): Promise<ISysTenant[]> {
        const tenantDs = new SysTenantDataService({ tenantId: eDatabaseType.registry });
        const e = expression();
        return await tenantDs.listSysTenantByExpression(e.createRenderer());
    }

    /**
     * @param {string} tenant
     * @returns {Promise<ClientMetadata>}
     * @memberof PortaSelfAuthenticationModule
     */
    public async getOIDCClientConfig(tenant: string): Promise<ClientMetadata> {
        const { tenantRecord } = await databaseUtils.getTenantDataSource(tenant);
        const clientDs = new SysClientDataService({ tenantId: databaseUtils.getTenantDataSourceID(tenantRecord) });
        const client = await clientDs.findSysClientById({ id: eDefaultClients.UI_CLIENT.id });

        return {
            client_id: client.client_id,
            client_secret: client.secret
        };
    }
}

export const databaseUtils = new DatabaseUtils();
