import { dataSourceManager } from "@blendsdk/datakit";
import { PostgreSQLDataSource } from "@blendsdk/postgresql";
import { deepCopy, isObject } from "@blendsdk/stdlib";
import { TOKEN_KEY_SPLIT } from "@blendsdk/webafx";
import {
    BadRequestResponse,
    Controller,
    IRequestContext,
    ISetValueOptions,
    RedirectResponse,
    SuccessResponse
} from "@blendsdk/webafx-common";
import { IAuthenticationFlowState, ISysAuthorizationView, ISysTenant } from "@porta/shared";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import util from "util";
import { URLSearchParams } from "url";

import { SysAuthorizationViewDataService } from "../../../../dataservices/SysAuthorizationViewDataService";
import { SysPermissionDataService } from "../../../../dataservices/SysPermissionDataService";
import { SysTenantDataService } from "../../../../dataservices/SysTenantDataService";
import { SysUserDataService } from "../../../../dataservices/SysUserDataService";
import { SysUserGroupDataService } from "../../../../dataservices/SysUserGroupDataService";
import { SysUserProfileDataService } from "../../../../dataservices/SysUserProfileDataService";
import {
    eOAuthGrantType,
    eOAuthResponseMode,
    ICachedFlowInformation,
    IErrorResponseParams,
    IPortaApplicationSetting,
    IPortaSessionInfo,
    IPortaSessionStorage
} from "../../../../types";
import { Claims } from "../Claims";
import { formPostTemplate } from "../FormPostTemplate";
import { commonUtils, databaseUtils } from "../../../../utils";

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
     * Gets the oidc claims by scope
     *
     * @protected
     * @param {IPortaSessionInfo} sessionInfo
     * @returns
     * @memberof EndpointController
     */
    protected getClaimsByScope(sessionInfo: IPortaSessionInfo, tenantName: string) {
        const { metaData } = sessionInfo || {};
        const claims = new Claims(sessionInfo, this.getServerUrl(), tenantName);
        return claims.getClaims(metaData || {});
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
     * Hashes a string with the name of this module
     *
     * This method is a duplicate of the auth.ts in webafx auth
     * since we don't use the local.ts login anymore because of the
     * express.js problem of calling a route internally
     *
     * @protected
     * @param {string} key
     * @returns
     * @memberof AuthenticationModule
     */
    protected hashKeyWithName(key: string) {
        const { PORTA_SSO_COMMON_NAME } = this.getSettings<IPortaApplicationSetting>();
        return crypto.createHash("md5").update(`${PORTA_SSO_COMMON_NAME}_${key}`).digest("hex");
    }

    /**
     * Creates a random token key based on the module name.
     *
     * This method is a duplicate of the auth.ts in webafx auth
     * since we don't use the local.ts login anymore because of the
     * express.js problem of calling a route internally
     *
     * @protected
     * @returns
     * @memberof AuthenticationModule
     */
    protected createTokenKey(keyName: string) {
        const token = commonUtils.getUUID();
        return `${token}${TOKEN_KEY_SPLIT}${keyName}`;
    }
    /**
     * Creates session storage for a given user
     *
     * @protected
     * @param {ISysTenant} tenant
     * @param {ISysAuthorizationView} authRecord
     * @param {string} user_id
     * @param {string} ui_locales
     * @returns
     * @memberof SigninEndpointController
     */
    protected async createSessionStorageForUser(
        tenant: ISysTenant,
        authRecord: ISysAuthorizationView,
        user_id: string,
        ui_locales: string,
        scope: string,
        claims: string
    ) {
        const { session_length } = authRecord;
        const ds = dataSourceManager.getDataSource<PostgreSQLDataSource>(databaseUtils.getTenantDataSourceID(tenant));

        const sharedContext = ds.createSharedContext();

        const closeContext = async () => {
            return (await sharedContext).disposeContext();
        };

        const userDs = new SysUserDataService({ sharedContext });
        const profileDs = new SysUserProfileDataService({ sharedContext });
        const userGroupDs = new SysUserGroupDataService({ sharedContext });
        const permissionDs = new SysPermissionDataService({ sharedContext });

        const userRecord = await userDs.findSysUserById({ id: user_id });

        const profile = await profileDs.findUserProfileByUserId({
            user_id: userRecord.id
        });

        const userPerms = await permissionDs.findPermissionsByUserId({ user_id: userRecord.id });

        const userGroups = await userGroupDs.findGroupsByUserId({
            user_id: userRecord.id
        });

        await closeContext();
        const { PORTA_SESSION_LENGTH } = this.getSettings<IPortaApplicationSetting>();
        const session_ttl = (session_length || PORTA_SESSION_LENGTH) * 1000;

        const keyName = this.hashKeyWithName("token");
        const tokenKey = this.createTokenKey(keyName);

        const NOW = Date.now();
        const cacheKey = `tokens:${tokenKey}`;
        const tokenExpireAt = NOW + session_ttl;

        const sessionStorage: IPortaSessionStorage = {
            ttl: session_ttl,
            tokenExpireAt,
            sessionInfo: {
                accountId: userRecord.id,
                user: userRecord,
                rbacRoles: userGroups
                    .filter((r) => {
                        return r.is_active === true;
                    })
                    .map((r) => {
                        return r.name;
                    }),
                profile,
                metaData: {
                    ui_locales,
                    tenant: tenant.id,
                    scope,
                    claims,
                    auth_time: NOW,
                    roles: userGroups,
                    permissions: userPerms
                }
            },
            cacheKey
        };
        await this.getCache().setValue(cacheKey, sessionStorage, { expire: tokenExpireAt });
        return { keyName, tokenKey, tokenExpireAt, session_ttl, sessionStorage };
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
    protected async getTenant(tenant: string): Promise<ISysTenant> {
        const tenantDs = new SysTenantDataService();
        return await tenantDs.findByNameOrId({ name: tenant });
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
