import { dataSourceManager } from "@blendsdk/datakit";
import { PostgreSQLDataSource } from "@blendsdk/postgresql";
import { base64Decode, deepCopy, isObject } from "@blendsdk/stdlib";
import {
    BadRequestResponse,
    Controller,
    IRequestContext,
    ISetValueOptions,
    RedirectResponse,
    SuccessResponse
} from "@blendsdk/webafx-common";
import {
    IAuthenticationFlowState,
    IPortaUtilsGetKeySignature,
    ISysAuthorizationView,
    ISysRefreshTokenView,
    ISysSession,
    ISysTenant,
    eKeySignatureType,
    portaAuthUtils
} from "@porta/shared";
import fs from "fs";
import * as jwt from "jsonwebtoken";
import path from "path";
import { URLSearchParams } from "url";
import util from "util";
import { SysAccessTokenDataService } from "../../../../dataservices/SysAccessTokenDataService";
import { SysAuthorizationViewDataService } from "../../../../dataservices/SysAuthorizationViewDataService";
import { SysClientDataService } from "../../../../dataservices/SysClientDataService";
import { SysKeyDataService } from "../../../../dataservices/SysKeyDataService";
import { SysRefreshTokenDataService } from "../../../../dataservices/SysRefreshTokenDataService";
import { SysSessionDataService } from "../../../../dataservices/SysSessionDataService";
import { SysUserDataService } from "../../../../dataservices/SysUserDataService";
import { SysUserProfileDataService } from "../../../../dataservices/SysUserProfileDataService";
import {
    IAccessToken,
    IAuthRequestParams,
    ICachedFlowInformation,
    IErrorResponseParams,
    ILogoutFlowStorage,
    IPortaApplicationSetting,
    eOAuthGrantType,
    eOAuthResponseMode
} from "../../../../types";
import { commonUtils, databaseUtils, eCookie } from "../../../../utils";
import { Claims } from "../Claims";
import { formPostTemplate } from "../FormPostTemplate";

/**
 * Enum describing flow parts
 *
 * @export
 * @enum {number}
 */
export enum eFlow {
    state = "state",
    user = "user",
    access_token = "access_token",
    info = "info",
    mfa_codes = "mfa_codes"
}

/**
 * Base class for a controller
 *
 * @export
 * @abstract
 * @class EndpointController
 * @extends {Controller<IRequestContext>}
 */
export abstract class EndpointController extends Controller<IRequestContext> {
    /**
     * Redirect to the client with error response
     *
     *
     * @protected
     * @param {IErrorResponseParams} { error, error_description, state, redirect_url, error_uri }
     * @returns
     * @memberof EndpointController
     */
    protected responseWithError(
        { error, error_description, state, redirect_uri, error_uri, response_mode }: IErrorResponseParams,
        toUserAgent?: boolean
    ) {
        const params = deepCopy({
            error,
            error_description: isObject(error_description)
                ? encodeURIComponent(JSON.stringify(error_description))
                : (error_description as string),
            error_uri,
            state
        });

        this.getLogger().error(error, params);

        if (toUserAgent) {
            return new BadRequestResponse({
                message: error,
                cause: params
            });
        } else if (response_mode === eOAuthResponseMode.form_post) {
            return new SuccessResponse(formPostTemplate({ redirect_uri, data: params }));
        } else {
            return new RedirectResponse({
                url: `${redirect_uri}?${new URLSearchParams(params).toString()}`
            });
        }
    }

    /**
     * Gets the OIDC claims by scope
     *
     * @protected
     * @param {IAccessToken} accessTokenStorage
     * @param {string} tenantName
     * @returns
     * @memberof EndpointController
     */
    protected getClaimsByScope(accessTokenStorage: IAccessToken, tenantName: string) {
        const claims = new Claims(accessTokenStorage, this.getServerURL(), tenantName);
        return claims.getClaims();
    }

    /**
     * Get flow information part
     * @param flow
     * @param flowId
     * @param value
     * @param _options
     * @returns
     */
    protected setFlow<ValueType = any>(flow: eFlow, flowId: string, value: ValueType, options?: ISetValueOptions) {
        return this.getCache().setValue(`${flowId}:${flow}`, value, options);
    }

    /**
     * Get the flow information part
     *
     * @protected
     * @template ValueType
     * @param {eFlow} flow
     * @param {string} flowId
     * @returns
     * @memberof EndpointController
     */
    protected getFlow<ValueType>(flow: eFlow, flowId: string) {
        return this.getCache().getValue<ValueType>(`${flowId}:${flow}`);
    }

    /**
     * Creates an issuer
     *
     * @protected
     * @param {string} tenant
     * @returns
     * @memberof EndpointController
     */
    protected getIssuer(tenant: string) {
        return `${this.getServerURL()}/${tenant}/oauth2`;
    }

    /**
     * Revokes and destroys aal access tokens for a given user and client
     *
     * @protected
     * @param {ISysTenant} tenantRecord
     * @param {string} client_id
     * @param {*} user_id
     * @memberof EndpointController
     */
    protected async destroySessionAndAllTokens(tenantRecord: ISysTenant, client_id: string, user_id: string) {
        const accessTokenDs = new SysAccessTokenDataService({
            tenantId: databaseUtils.getTenantDataSourceID(tenantRecord)
        });

        const sessionDs = new SysSessionDataService({
            tenantId: databaseUtils.getTenantDataSourceID(tenantRecord)
        });

        const clientDs = new SysClientDataService({
            tenantId: databaseUtils.getTenantDataSourceID(tenantRecord)
        });

        const clientRecord = await clientDs.findSysClientById({ id: client_id });

        await sessionDs.deleteSysSessionByUserIdAndClientId({ user_id, client_id: clientRecord.id });
        await accessTokenDs.deleteSysAccessTokenByUserIdAndClientId({ user_id, client_id: clientRecord.id });
        //TODO: this is duplicate, delete it
        await sessionDs.deleteSysSessionByUserIdAndClientId({ user_id, client_id: clientRecord.id });
    }

    /**
     * Revokes a given access token
     *
     * @protected
     * @param {ISysTenant} tenantRecord
     * @param {string} access_token
     * @memberof EndpointController
     */
    protected async revokeAccessToken(tenantRecord: ISysTenant, access_token: string) {
        const { dataSource } = await databaseUtils.getTenantDataSource(tenantRecord.id);
        if (dataSource) {
            const accessTokenDs = new SysAccessTokenDataService({ dataSource });
            await accessTokenDs.deleteSysAccessTokenByAccessToken({ access_token });
        }
    }

    /**
     * Revokes a given refresh token
     *
     * @protected
     * @param {ISysTenant} tenantRecord
     * @param {ISysRefreshTokenView} refreshTokenStorage
     * @memberof EndpointController
     */
    protected async revokeRefreshToken(tenantRecord: ISysTenant, refreshTokenStorage: ISysRefreshTokenView) {
        const { dataSource } = await databaseUtils.getTenantDataSource(tenantRecord.id);
        this.revokeAccessToken(tenantRecord, refreshTokenStorage.access_token);
        if (dataSource) {
            const refreshTokenDs = new SysRefreshTokenDataService({ dataSource });
            await refreshTokenDs.deleteSysRefreshTokenById({ id: refreshTokenStorage.id });
        }
    }

    /**
     * Install the browser cookies
     *
     * @protected
     * @param {{
     *         tenant: string;
     *         accessTokenStorage: IAccessToken;
     *         accessTokenKeySignature: string;
     *         refreshTokenStorage: ISysRefreshTokenView;
     *         refreshTokenKeySignature: string;
     *         sessionKeySignature: string;
     *         sessionStorage: ISysSession;
     *     }} {
     *         tenant,
     *         accessTokenStorage,
     *         accessTokenKeySignature,
     *         refreshTokenStorage,
     *         refreshTokenKeySignature,
     *         sessionKeySignature,
     *         sessionStorage
     *     }
     * @memberof EndpointController
     */
    protected async installLocalCookies({
        tenant,
        accessTokenStorage,
        accessTokenKeySignature,
        refreshTokenStorage,
        refreshTokenKeySignature,
        sessionKeySignature,
        sessionStorage
    }: {
        tenant: string;
        accessTokenStorage: IAccessToken;
        accessTokenKeySignature: string;
        refreshTokenStorage: ISysRefreshTokenView;
        refreshTokenKeySignature: string;
        sessionKeySignature: string;
        sessionStorage: ISysSession;
    }) {
        const { access_token, expire_at } = accessTokenStorage;

        //TODO Cleanup this method!!
        if (Date.now() === 1) {
            console.log({ tenant, refreshTokenStorage, refreshTokenKeySignature, sessionKeySignature, sessionStorage });
        }

        // also readable from the UI
        // this.setCookie(sessionKeySignature, sessionStorage.session_id, {
        //     expires: new Date(expire_at),
        //     signed: true,
        //     httpOnly: true,
        //     secure: this.request.protocol !== "http",
        //     sameSite: "lax" // only send to this endpoint
        // });

        const { sessionKey, sessionTTLKey } = portaAuthUtils.getSessionTTLKeys(tenant);

        // readable from client
        this.setCookie(sessionTTLKey, new Date(expire_at).getTime(), {
            signed: false,
            httpOnly: false,
            secure: false,
            sameSite: "lax"
        });

        // this is the reference to the key of the access token
        // to be read by self auth
        this.setCookie(sessionKey, accessTokenKeySignature, {
            expires: new Date(expire_at),
            signed: true,
            secure: this.request.protocol !== "http",
            sameSite: "lax", // only send to this endpoint
            httpOnly: true
        });

        // set the token cookie
        this.setCookie(accessTokenKeySignature, access_token, {
            expires: new Date(expire_at),
            signed: true,
            secure: this.request.protocol !== "http",
            sameSite: "lax", // only send to this endpoint
            httpOnly: true
        });

        // session length info for the ui
        // this.setCookie(
        //     portaAuthUtils.getKeySignature({
        //         tenant,
        //         client: accessTokenStorage.client.client_id,
        //         system: this.getServerURL(),
        //         type: eKeySignatureType.session
        //     }),
        //     new Date(expire_at).getTime(),
        //     {
        //         expires: new Date(expire_at)
        //     }
        // );

        // if (refreshTokenKeySignature && refreshTokenStorage) {
        //     const { refresh_token, expire_at } = refreshTokenStorage || {};

        //     this.setCookie(refreshTokenKeySignature, refresh_token, {
        //         expires: new Date(expire_at),
        //         signed: true,
        //         secure: this.request.protocol !== "http",
        //         sameSite: "lax", // only send to this endpoint
        //         httpOnly: true
        //     });

        //     this.setCookie(
        //         portaAuthUtils.getKeySignature({
        //             tenant,
        //             client: accessTokenStorage.client.client_id,
        //             system: this.getServerURL(),
        //             type: eKeySignatureType.refresh_session
        //         }),
        //         new Date(expire_at).getTime(),
        //         {
        //             expires: new Date(expire_at)
        //         }
        //     );
        // }
    }

    /**
     * Creates session storage for a given user
     *
     * @protected
     * @param {{
     *         tenant: ISysTenant;
     *         authRecord: ISysAuthorizationView;
     *         user_id: string;
     *         auth_request_params: IAuthRequestParams;
     *     }} {
     *         tenant,
     *         authRecord,
     *         user_id,
     *         auth_request_params
     *     }
     * @returns
     * @memberof EndpointController
     */
    protected async createSessionStorageForUser({
        tenant,
        authRecord,
        user_id,
        auth_request_params
    }: {
        tenant: ISysTenant;
        authRecord: ISysAuthorizationView;
        user_id: string;
        auth_request_params: IAuthRequestParams;
    }) {
        let { access_token_ttl, refresh_token_ttl } = authRecord;
        const { scope } = auth_request_params;

        const { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } = this.getSettings<IPortaApplicationSetting>();

        const accessTokenKeySignature = portaAuthUtils.getKeySignature({
            tenant: tenant.name,
            client: authRecord.client_id,
            system: this.getServerURL(),
            type: eKeySignatureType.access_token
        });

        const sessionStorage = await databaseUtils.createOrGetSession(tenant.id, authRecord.id, user_id);
        const sessionKeySignature = portaAuthUtils.getKeySignature({
            tenant: tenant.name,
            //TODO: Replace client_id with user_id since the session is per user and tenant
            client: authRecord.client_id,
            system: this.getServerURL(),
            type: eKeySignatureType.session_id
        });

        // checking the offline access grant
        const { offline_access = false } = commonUtils.parseSeparatedTokens(scope) || {};

        // Need to convert this to string and back since the default values are provide
        // from the config files and possibly from process.env
        access_token_ttl = parseFloat((access_token_ttl || ACCESS_TOKEN_TTL).toString());
        refresh_token_ttl = parseFloat((refresh_token_ttl || REFRESH_TOKEN_TTL).toString());

        const { user, profile } = await databaseUtils.findUserByUserId(user_id, tenant.name);

        const accessTokenStorage = await databaseUtils.newAccessToken(
            tenant,
            authRecord,
            user_id,
            sessionStorage.id,
            access_token_ttl,
            offline_access === true ? refresh_token_ttl : access_token_ttl, // if there is no offline_access then this token will be revoked at access_token_ttl,
            auth_request_params,
            this.getIssuer(tenant.name),
            {
                ...(user ? { udc: new Date(user.date_changed).getTime() } : {}),
                ...(profile ? { pdc: new Date(profile.date_changed).getTime() } : {})
            }
        );

        // empty variables for refresh token
        let refreshTokenStorage: ISysRefreshTokenView = undefined;

        let refreshTokenKeySignature = undefined;

        // creating the refresh tokens
        if (offline_access) {
            refreshTokenStorage = await databaseUtils.newRefreshToken(
                tenant,
                authRecord,
                user_id,
                sessionStorage.id,
                refresh_token_ttl,
                auth_request_params,
                this.getIssuer(tenant.name),
                accessTokenStorage.id
            );
            refreshTokenKeySignature = portaAuthUtils.getKeySignature({
                tenant: tenant.name,
                client: authRecord.client_id,
                system: this.getServerURL(),
                type: eKeySignatureType.refresh_token
            });
        }

        return {
            accessTokenKeySignature,
            refreshTokenKeySignature,
            accessTokenStorage,
            refreshTokenStorage,
            sessionKeySignature,
            sessionStorage
        };
    }

    /**
     * Find the flow id either based on a cookie or request parameter
     *
     * @protected
     * @returns {string}
     * @memberof EndpointController
     */
    protected findFlowID(): string {
        return (
            this.getCookie(eCookie.AUTHORIZATION_FLOW, true) ||
            this.request.context.getParameters<{ af: string }>().af ||
            undefined
        );
    }

    /**
     * Find the logout flow id either based on a cookie or request parameter
     *
     * @protected
     * @returns {string}
     * @memberof EndpointController
     */
    protected findLogoutFlowID(): string {
        return this.getCookie("_lf", true) || this.request.context.getParameters<{ lf: string }>().lf || undefined;
    }

    /**
     * Gets the current authentication flow either from the cookie or the `flow` which is also
     * the ota code
     *
     * @protected
     * @param {string} [flowId]
     * @returns {Promise<ICachedFlowInformation>}
     * @memberof EndpointController
     */
    protected async getCurrentAuthenticationFlow(flowId?: string): Promise<ICachedFlowInformation> {
        return this.getFlow<ICachedFlowInformation>(eFlow.info, flowId || this.findFlowID());
    }

    /**
     * Delete all cookies
     *
     * @protected
     * @memberof EndSessionController
     */
    protected async deleteAllCookies(params?: IPortaUtilsGetKeySignature) {
        const { client, system, tenant } = params || {};
        const cookies = this.request.cookies;
        const signedCookies = this.request.signedCookies;
        const skip = ["lang", "locale", "ui_locales"];
        const { sessionKey, sessionTTLKey } = await portaAuthUtils.getSessionTTLKeys(tenant);
        const deleteKeys: string[] = ["_l", "_t", "_ls", "_lf", sessionKey, sessionTTLKey];

        Object.entries(eKeySignatureType).forEach(([_k, type]) => {
            deleteKeys.push(
                portaAuthUtils.getKeySignature({
                    client,
                    system,
                    tenant,
                    type
                })
            );
        });

        for (const cookieName in cookies) {
            if (!skip.includes(cookieName) && deleteKeys.includes(cookieName)) {
                this.response.cookie(cookieName, "", { expires: new Date(0) });
            }
        }

        for (const cookieName in signedCookies) {
            if (!skip.includes(cookieName) && deleteKeys.includes(cookieName)) {
                this.response.cookie(cookieName, "", { expires: new Date(0) });
            }
        }
    }

    /**
     * Gets the cache key for the logout flow
     *
     * @protected
     * @param {string} flowId
     * @returns
     * @memberof EndpointController
     */
    protected getLogoutFlowCacheKey(flowId: string) {
        return ["logout_flow", flowId].join(":");
    }

    /**
     * Gets the current authentication flow either from the cookie or the `flow` which is also
     * the ota code
     *
     * @protected
     * @param {string} [flow]
     * @returns {Promise<ICachedFlowInformation>}
     * @memberof EndPointController
     */
    protected async getCurrentLogoutFlow(): Promise<ILogoutFlowStorage> {
        return this.getCache().getValue<ILogoutFlowStorage>(this.getLogoutFlowCacheKey(this.findLogoutFlowID()));
    }

    /**
     * Clears the current authentication flow. If the `flow`
     * is not provided then only clear the client-side cookie
     *
     * @param {string} [flowId]
     * @memberof AuthorizationController
     */
    public async clearAuthenticationFlow(flowId?: string) {
        if (flowId) {
            await this.getCache().deleteValue(`${flowId}:info`);
            await this.getCache().deleteValue(`${flowId}:state`);
            await this.getCache().deleteValue(`${flowId}:user`);
            await this.getCache().deleteValue(`${flowId}:access_token`);
        } else {
            this.setCookie(eCookie.AUTHORIZATION_FLOW, "", { maxAge: -1 });
        }
    }

    /**
     * Gets the current authentication flow state
     *
     * @protected
     * @returns {Promise<IAuthenticationFlowState>}
     * @memberof AuthorizationController
     */
    protected async getCurrentFlowState(flowId?: string): Promise<IAuthenticationFlowState> {
        return this.getFlow<IAuthenticationFlowState>(eFlow.state, flowId || this.findFlowID());
    }

    /**
     * Gets the authorization record for a given
     * client and redirect uri
     *
     * @protected
     * @param {string} tenant_id
     * @param {string} client_id
     * @param {string} redirect_uri
     * @returns
     * @memberof EndpointController
     */
    protected async getAuthorizationRecord(tenant: ISysTenant, client_id: string, redirect_uri: string) {
        const dataSource = dataSourceManager.getDataSource<PostgreSQLDataSource>(
            databaseUtils.getTenantDataSourceID(tenant)
        );

        const authViewDs = new SysAuthorizationViewDataService({ dataSource });
        if (redirect_uri === eOAuthGrantType.client_credentials) {
            return authViewDs.findByClientIdOnly({ client_id });
        } else {
            // Internally the redirect_uri is saved as JSON array. so we need to parse it
            // to check if it is conforming. Another implementation fo this would have
            // been to normalize the redirect_uris as a separate DB table. This was
            // a lot of work and required yet another refactoring, so the decision is made
            // to implement it this way.
            const authRecord = await authViewDs.findByClientIdAndRedirectUri({ client_id });

            // check if there is an auth record with the given client_id
            if (authRecord) {
                const uris = commonUtils.parseToArray(authRecord?.redirect_uri);
                authRecord.redirect_uri = uris.find((u) => {
                    return u == redirect_uri;
                });
            }
            return authRecord?.redirect_uri ? authRecord : undefined;
        }
    }

    /**
     * Creates a sign in URL
     *
     * @protected
     * @returns
     * @memberof EndPointController
     */
    protected createFlowUrl(action: string, flow?: string) {
        const url = new URL(`${this.getServerURL()}/af/${action}`);
        flow = flow || this.findFlowID();
        if (flow) {
            url.searchParams.append("af", flow);
        }
        return url.toString();
    }

    /**
     * Is local environment
     *
     * @protected
     * @returns
     * @memberof EndPointController
     */
    protected isLocalEnv() {
        return this.request.hostname.indexOf("local") !== -1;
    }

    /**
     * Gets a tenant from the registered tenants list
     *
     * @protected
     * @param {string} tenant
     * @returns {Promise<ISysTenant>}
     * @memberof EndPointController
     */
    protected getTenant(tenant: string): Promise<ISysTenant> {
        return databaseUtils.findTenant(tenant);
    }

    /**
     * Initialized a tenant's data source and optionally creating the
     * database schema a initial records
     *
     * @protected
     * @param {ISysTenant} tenant
     * @memberof EndPointController
     */
    protected async initializeTenantDataSource(tenant: ISysTenant) {
        try {
            return await databaseUtils.initializeTenantDataSource(tenant);
        } catch (err: any) {
            this.getLogger().error(err.message, { err });
            return undefined;
        }
    }

    /**
     * Create a new database for a given tenant
     *
     * @protected
     * @param {string} tenantDatabase
     * @param {string} owner
     * @param {ISysTenant} tenant
     * @memberof EndPointController
     */
    protected async createTenantDatabase(tenantDatabase: string, owner: string, tenant: ISysTenant) {
        const defaultDataSource = dataSourceManager.getDataSource<PostgreSQLDataSource>();
        await defaultDataSource.withContext(async (asyncContext) => {
            const ctx = await asyncContext;
            await ctx.executeQuery(`CREATE DATABASE ${tenantDatabase};`);
            await ctx.executeQuery(`GRANT ALL PRIVILEGES ON DATABASE ${tenantDatabase} TO ${owner};`);
        });

        const tenantDataSource = dataSourceManager.getDataSource<PostgreSQLDataSource>(tenant.id);
        await tenantDataSource.withContext(async (asyncContext) => {
            const readFileAsync = util.promisify(fs.readFile);

            const dbSchema = (
                await readFileAsync(path.join(__dirname, "..", "..", "..", "..", "resources", "database", "schema.sql"))
            ).toString();

            const ctx = await asyncContext;
            await ctx.executeQuery(dbSchema);
            await ctx.executeQuery("DROP TABLE sys_tenant CASCADE;");
        });
    }

    /**
     * Initializes tenant's database
     *
     * @protected
     * @param {ISysTenant} tenant
     * @memberof EndPointController
     */
    protected async initializeTenantDatabase(tenant: ISysTenant) {
        const dataSource = dataSourceManager.getDataSource<PostgreSQLDataSource>(tenant.id);
        await dataSource.withContext(async (sharedContext) => {
            const userDs = new SysUserDataService({ sharedContext });
            const profileDs = new SysUserProfileDataService({ sharedContext });

            const adminUser = await userDs.insertIntoSysUser({
                username: "admin",
                password: "secret"
            });

            await profileDs.insertIntoSysUserProfile({
                user_id: adminUser.id,
                firstname: tenant.name,
                lastname: "Administrator"
            });
        });
    }

    protected getBasicAuthCredentialsFromRequestHeader() {
        const [type, data] = (this.request.headers.authorization || "").split(" ");
        if (data && type && type.toLocaleLowerCase() === "basic") {
            const [client_id, client_secret] = base64Decode(data).split(":");
            return {
                client_id,
                client_secret
            };
        }
        return {
            client_id: undefined,
            client_secret: undefined
        };
    }

    protected async getJWKKey(tenant: string): Promise<{ publicKey: string; privateKey: string }> {
        const { dataSource } = await databaseUtils.getTenantDataSource(tenant);
        const keyDs = new SysKeyDataService({ dataSource });
        const { data } = (await keyDs.findJwkKeys())[0];
        return JSON.parse(data);
    }

    protected verifyGetJWT(payLoad: string, publicKey: string, options?: jwt.VerifyOptions) {
        try {
            return {
                jwt: jwt.verify(payLoad, publicKey, options),
                error: undefined
            };
        } catch (err) {
            return {
                jwt: undefined,
                error: err.message
            };
        }
    }
}
