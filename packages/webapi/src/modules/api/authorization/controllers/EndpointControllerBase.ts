import { dataSourceManager } from "@blendsdk/datakit";
import { PostgreSQLDataSource } from "@blendsdk/postgresql";
import { deepCopy, isObject } from "@blendsdk/stdlib";
import {
    BadRequestResponse,
    Controller,
    IRequestContext,
    ISetValueOptions,
    RedirectResponse,
    SuccessResponse
} from "@blendsdk/webafx-common";
import { IAuthenticationFlowState, ISysAuthorizationView, ISysRefreshTokenView, ISysTenant } from "@porta/shared";
import fs from "fs";
import path from "path";
import util from "util";
import { URLSearchParams } from "url";

import { SysAuthorizationViewDataService } from "../../../../dataservices/SysAuthorizationViewDataService";
import { SysUserDataService } from "../../../../dataservices/SysUserDataService";
import { SysUserProfileDataService } from "../../../../dataservices/SysUserProfileDataService";
import {
    eOAuthGrantType,
    eOAuthResponseMode,
    IAccessToken,
    IAuthRequestParams,
    ICachedFlowInformation,
    IErrorResponseParams,
    IPortaApplicationSetting
} from "../../../../types";
import { Claims } from "../Claims";
import { formPostTemplate } from "../FormPostTemplate";
import { commonUtils, databaseUtils } from "../../../../utils";
import { eKeySignatureType, portaAuthUtils } from "../../../auth/utils";
import { SysAccessTokenDataService } from "../../../../dataservices/SysAccessTokenDataService";
import { SysRefreshTokenDataService } from "../../../../dataservices/SysRefreshTokenDataService";
import { encodeBase64Key } from "@blendsdk/crypto";

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
    info = "info"
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
        const claims = new Claims(accessTokenStorage, this.getServerUrl(), tenantName);
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
        return `${this.getServerUrl()}/${tenant}/oauth2`;
    }

    /**
     * Revokes a given access token
     *
     * @protected
     * @param {string} accessToken
     * @memberof EndpointController
     */
    protected async revokeAccessToken(tenantRecord: ISysTenant, access_token: string) {
        const { dataSource } = await databaseUtils.getTenantDataSource(tenantRecord.id);
        if (dataSource) {
            const accessTokenDs = new SysAccessTokenDataService({ dataSource });
            await accessTokenDs.deleteSysAccessTokenByAccessToken({ access_token });
        }
    }

    protected async revokeRefreshToken(tenantRecord: ISysTenant, refreshTokenStorage: ISysRefreshTokenView) {
        const { dataSource } = await databaseUtils.getTenantDataSource(tenantRecord.id);
        this.revokeAccessToken(tenantRecord, refreshTokenStorage.access_token);
        if (dataSource) {
            const refreshTokenDs = new SysRefreshTokenDataService({ dataSource });
            await refreshTokenDs.deleteSysRefreshTokenById({ id: refreshTokenStorage.id });
        }
    }

    protected installLocalCookies(
        tenant_id: string,
        accessTokenStorage: IAccessToken,
        accessTokenKeySignature: string,
        refreshTokenStorage: ISysRefreshTokenView,
        refreshTokenKeySignature: string
    ) {
        const { access_token, expire_at } = accessTokenStorage;

        // set the token cookie
        this.setCookie(accessTokenKeySignature, access_token, {
            expires: new Date(expire_at),
            signed: true,
            secure: this.request.protocol !== "http",
            sameSite: "lax", // only send to this endpoint
            httpOnly: true
        });

        // session length info for the ui
        this.setCookie(encodeBase64Key({ type: "session", tenant: tenant_id }), new Date(expire_at).getTime(), {
            expires: new Date(expire_at)
        });

        if (refreshTokenKeySignature && refreshTokenStorage) {
            const { refresh_token, expire_at } = refreshTokenStorage || {};

            this.setCookie(refreshTokenKeySignature, refresh_token, {
                expires: new Date(expire_at),
                signed: true,
                secure: this.request.protocol !== "http",
                sameSite: "lax", // only send to this endpoint
                httpOnly: true
            });
            this.setCookie(
                encodeBase64Key({ type: "refresh_session", tenant: tenant_id }),
                new Date(expire_at).getTime(),
                {
                    expires: new Date(expire_at)
                }
            );
        }
    }

    /**
     * Creates session storage for a given user
     *
     * @protected
     * @param {ISysTenant} tenant
     * @param {ISysAuthorizationView} authRecord
     * @param {string} user_id
     * @param {*} ui_locales
     * @param {string} scope
     * @param {string} claims
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

        const { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, PORTA_SSO_COMMON_NAME } =
            this.getSettings<IPortaApplicationSetting>();

        const accessTokenKeySignature = portaAuthUtils.getKeySignature(
            tenant,
            PORTA_SSO_COMMON_NAME,
            eKeySignatureType.access_token
        );

        // checking the offline access grant
        const { offline_access = false } = commonUtils.parseSeparatedTokens(scope) || {};

        access_token_ttl = access_token_ttl || ACCESS_TOKEN_TTL;
        refresh_token_ttl = refresh_token_ttl || REFRESH_TOKEN_TTL;

        const accessTokenStorage = await databaseUtils.newAccessToken(
            tenant.id,
            authRecord.id,
            user_id,
            access_token_ttl,
            offline_access === true ? refresh_token_ttl : access_token_ttl, // if there is no offline_access then this token will be revoked at access_token_ttl,
            auth_request_params
        );

        // empty variables for refresh token
        let refreshTokenStorage: ISysRefreshTokenView = undefined;

        let refreshTokenKeySignature = undefined;

        // creating the refresh tokens
        if (offline_access) {
            refreshTokenStorage = await databaseUtils.newRefreshToken(
                tenant.id,
                accessTokenStorage.id,
                refresh_token_ttl
            );
            refreshTokenKeySignature = portaAuthUtils.getKeySignature(
                tenant,
                PORTA_SSO_COMMON_NAME,
                eKeySignatureType.refresh_token
            );
        }

        return {
            accessTokenKeySignature,
            refreshTokenKeySignature,
            accessTokenStorage,
            refreshTokenStorage
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
        return this.getCookie("_af", true) || this.request.context.getParameters<{ af: string }>().af || undefined;
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
    protected async getCurrentAuthenticationFlow(flowId?: string): Promise<ICachedFlowInformation> {
        return this.getFlow<ICachedFlowInformation>(eFlow.info, flowId || this.findFlowID());
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
            this.setCookie("_af", "", { maxAge: -1 });
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
    protected getAuthorizationRecord(tenant: ISysTenant, client_id: string, redirect_uri: string) {
        const dataSource = dataSourceManager.getDataSource<PostgreSQLDataSource>(
            databaseUtils.getTenantDataSourceID(tenant)
        );
        const authViewDs = new SysAuthorizationViewDataService({ dataSource });
        if (redirect_uri === eOAuthGrantType.client_credentials) {
            return authViewDs.findByClientIdOnly({ client_id });
        } else {
            return authViewDs.findByClientIdAndRedirectUri({ client_id, redirect_uri });
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
        const { protocol, hostname, socket } = this.request;
        return `${protocol}://${hostname}${this.isLocalEnv() ? `:${socket.localPort}` : ""}/af/${action}?af=${
            flow || this.findFlowID()
        }`;
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
        return databaseUtils.getTenant(tenant);
    }

    /**
     * Initialized a tenant's data source and optionally creating the
     * database schema a initial records
     *
     * @protected
     * @param {ISysTenant} tenant
     * @memberof EndPointController
     */
    protected initializeTenantDataSource(tenant: ISysTenant) {
        return databaseUtils.initializeTenantDataSource(tenant);
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
}
