import { IDictionaryOf, MD5, base64Decode, isNullOrUndef } from "@blendsdk/stdlib";
import { ICreateResponseAuthorizedParams, TGetUserMethod } from "@blendsdk/webafx-auth";
import { HttpRequest, IRequestContext, IRoute } from "@blendsdk/webafx-common";
import { eKeySignatureType, portaAuthUtils } from "@porta/shared";
import {
    ILandingURLConfig,
    IPortaAuthenticationResult,
    IPortaHTTPRequestContext,
    IPortaMultiTenantClientModule,
    PortaMultiTenantClientModule
} from "@porta/webafx-auth";
import { AuthorizationParameters, BaseClient, ClientMetadata } from "openid-client";
import { SysClientDataService } from "../../dataservices/SysClientDataService";
import { IAccessToken, IPortaApplicationSetting, eOAuthGrantType } from "../../types";
import { databaseUtils } from "../../utils";
import { eDefaultClients } from "../../utils/DatabaseSeed";
import { TokenEndpointController } from "../api/authorization/controllers/TokenEndpointController";

const KEY_AUTH_TOKEN_TYPE = "_AUTH_TOKEN_TYPE_";

const ANONYMUS_LOGOUT_TOKEN = MD5(Date.now());

enum eTokenType {
    BEARER_TOKEN = "BEARER_TOKEN",
    CLIENT_CREDENTIALS = "CLIENT_CREDENTIALS",
    COOKIE_TOKEN = "COOKIE_TOKEN",
    ANONYMOUS_LOGOUT_TOKEN = "ANONYMOUS_LOGOUT_TOKEN",
    DIRECT_API = "ANONYMOUS_LOGOUT_TOKEN"
}

export interface IPortaSelfAuthenticationModule {
    PORTA_SSO_COMMON_NAME?: string;
    PORTA_SESSION_LENGTH?: number;
}

export class PortaSelfAuthenticationModule extends PortaMultiTenantClientModule {
    /**
     * KeySignature cache (safe for multiple docker instances)
     *
     * @protected
     * @type {IDictionaryOf<{ tenant: string; sig: string; id: string }>}
     * @memberof PortaSelfAuthenticationModule
     */
    protected tenantKeySignatures: IDictionaryOf<{ tenant: string; sig: string; id: string }>;

    /**
     * Creates an instance of PortaSelfAuthenticationModule.
     * @param {(IPortaSelfAuthenticationModule & IPortaMultiTenantClientModule)} [config]
     * @memberof PortaSelfAuthenticationModule
     */
    public constructor(config?: IPortaSelfAuthenticationModule & IPortaMultiTenantClientModule) {
        super({ ...config });
        this.tenantKeySignatures = {};
    }

    /**
     * @protected
     * @param {string} tenant
     * @param {string} token
     * @returns
     * @memberof PortaSelfAuthenticationModule
     */
    protected async findAccessTokenByTenant(tenant: string, token: string) {
        const accessTokenStorage = await databaseUtils.findAccessTokenByTenant(tenant, token);
        return isNullOrUndef(accessTokenStorage) ? undefined : accessTokenStorage;
    }

    /**
     * Get the tenant from request
     *
     * @protected
     * @param {HttpRequest} req
     * @returns
     * @memberof PortaSelfAuthenticationModule
     */
    protected getTenantFromRequest(req: HttpRequest) {
        const { tenant = undefined } = req.context.getParameters<{ tenant: string }>() || {};
        //TODO: Also add from the cookie
        return tenant;
    }

    /**
     * Checks if the tenant exists
     *
     * @protected
     * @param {string} tenant
     * @returns
     * @memberof PortaSelfAuthenticationModule
     */
    protected async validateTenant(tenant: string) {
        return !isNullOrUndef(await databaseUtils.findTenant(tenant));
    }

    /**
     * Create and cache signature to find the access_tokens from Cookies
     *
     * @protected
     * @param {HttpRequest} req
     * @returns
     * @memberof PortaSelfAuthenticationModule
     */
    protected async getKeySignatureCustom(req: HttpRequest) {
        const tenant = this.getTenantFromRequest(req);
        if (tenant && !this.tenantKeySignatures[tenant]) {
            const tenantRecord = await databaseUtils.findTenant(tenant);
            if (tenantRecord) {
                this.tenantKeySignatures[tenant] = {
                    id: tenantRecord.id,
                    tenant: tenantRecord.name,
                    sig: portaAuthUtils.getKeySignature(
                        tenantRecord.name,
                        req.context.getServerURL(),
                        eKeySignatureType.access_token
                    )
                };
            }
        }
        return tenant ? this.tenantKeySignatures[tenant] : (undefined as any);
    }

    /**
     * Finds the session storage based on the key signature from thr incoming request
     *
     * @protected
     * @template SessionStorageType
     * @param {string} token
     * @param {HttpRequest<{}>} req
     * @returns {Promise<SessionStorageType>}
     * @memberof PortaSelfAuthenticationModule
     */
    protected async findSessionStorageByToken<SessionStorageType = any>(
        token: string,
        req: HttpRequest<IRequestContext>
    ): Promise<SessionStorageType> {
        const tokenType = req.context.getService<eTokenType>(KEY_AUTH_TOKEN_TYPE);

        switch (tokenType) {
            case eTokenType.ANONYMOUS_LOGOUT_TOKEN:
                return {
                    anonymus_logout: true,
                    user: {}
                } as Partial<IAccessToken> as SessionStorageType;
            case eTokenType.BEARER_TOKEN: {
                const tenant = this.getTenantFromRequest(req);
                const accessTokenStorage = (await this.validateTenant(tenant))
                    ? await this.findAccessTokenByTenant(tenant, token)
                    : undefined;
                return accessTokenStorage
                    ? accessTokenStorage.tenant.name === tenant
                        ? (accessTokenStorage as SessionStorageType)
                        : undefined
                    : undefined;
            }
            case eTokenType.COOKIE_TOKEN: {
                const {
                    sig = undefined,
                    tenant = undefined,
                    id = undefined
                } = (await this.getKeySignatureCustom(req)) || {};
                if (sig && tenant && token && id) {
                    const accessTokenStorage = await this.findAccessTokenByTenant(tenant, token);
                    return accessTokenStorage
                        ? accessTokenStorage.tenant.id === id
                            ? (accessTokenStorage as SessionStorageType)
                            : undefined
                        : undefined;
                } else {
                    return undefined;
                }
            }
            case eTokenType.DIRECT_API: {
                return {
                    direct_api: true,
                    user: {}
                } as SessionStorageType;
            }
            case eTokenType.CLIENT_CREDENTIALS: {
                const { client_id, client_secret } = token || ({} as any);
                const tenant = this.getTenantFromRequest(req);
                if (await this.validateTenant(tenant)) {
                    const controller = new TokenEndpointController({ request: req, response: undefined });
                    const { token: newToken } = await controller.getTokenByClientCredentials({
                        grant_type: eOAuthGrantType.client_credentials,
                        tenant,
                        client_id,
                        client_secret,
                        scope: "email profile acl"
                    });
                    return newToken && newToken.access_token
                        ? ((await this.findAccessTokenByTenant(tenant, newToken.access_token)) as SessionStorageType)
                        : undefined;
                } else {
                    return undefined;
                }
            }
            default:
                return undefined;
        }
    }

    /**
     * @protected
     * @param {ICreateResponseAuthorizedParams} _params
     * @returns
     * @memberof PortaSelfAuthenticationModule
     */
    protected async createResponseAuthorized(_params: ICreateResponseAuthorizedParams) {
        // only the SESSION_TTL_KEY was supposed to be passes here but is is being
        // takes care of by `installLocalCookies`
        return null;
    }

    /**
     * Allow to pass the token authorization for the logout endpoint
     *
     * @protected
     * @param {HttpRequest} req
     * @returns
     * @memberof PortaSelfAuthenticationModule
     */
    protected getAnonymusLogoutURLToken(req: HttpRequest) {
        const { tenant = undefined } = req.context.getParameters<{ tenant: string }>();
        const logoutUri = `/${tenant}/oauth2/logout`;
        return logoutUri === req.path ? ANONYMUS_LOGOUT_TOKEN : undefined;
    }

    /**
     * Gets/finds a session from cookie, body or header
     *
     * @protected
     * @param {HttpRequest} req
     * @returns {Promise<string>}
     * @memberof PortaSelfAuthenticationModule
     */
    protected async getSessionTokenFromRequest(req: HttpRequest): Promise<string> {
        const { sig = undefined } = (await this.getKeySignatureCustom(req)) || {};
        const {
            access_token = undefined,
            client_id = undefined,
            client_secret = undefined
        } = req.context.getParameters<{ access_token: string; client_id: string; client_secret: string }>();

        const bearerToken = this.getBearerToken(req) || undefined;
        const cookieToken = sig ? this.getCookieToken(sig, req) : undefined;
        const anonLogoutToken = this.getAnonymusLogoutURLToken(req);
        const { account: basic_account, password: basic_password } = this.getBasicAuthCredentials(req);
        let clientSecretParams =
            !isNullOrUndef(client_id) && !isNullOrUndef(client_secret) ? { client_id, client_secret } : undefined;

        if (bearerToken || access_token) {
            const { PORTA_API_KEY = undefined } = req.context.getSettings<IPortaApplicationSetting>();
            if (bearerToken === PORTA_API_KEY && !isNullOrUndef(PORTA_API_KEY)) {
                req.context.addService(KEY_AUTH_TOKEN_TYPE, eTokenType.DIRECT_API);
            } else {
                req.context.addService(KEY_AUTH_TOKEN_TYPE, eTokenType.BEARER_TOKEN);
            }
        }

        if (!isNullOrUndef(basic_account) && !isNullOrUndef(basic_password)) {
            clientSecretParams = {
                client_id: basic_account,
                client_secret: basic_password
            };
        }

        if (clientSecretParams) {
            req.context.addService(KEY_AUTH_TOKEN_TYPE, eTokenType.CLIENT_CREDENTIALS);
        }

        if (cookieToken) {
            req.context.addService(KEY_AUTH_TOKEN_TYPE, eTokenType.COOKIE_TOKEN);
        }

        if (anonLogoutToken) {
            req.context.addService(KEY_AUTH_TOKEN_TYPE, eTokenType.ANONYMOUS_LOGOUT_TOKEN);
        }

        return access_token || bearerToken || cookieToken || clientSecretParams || anonLogoutToken;
    }

    /**
     * @protected
     * @param {*} sessionStorage
     * @param {IRoute} _route
     * @param {HttpRequest<{}>} _reg
     * @returns {Promise<TGetUserMethod>}
     * @memberof PortaSelfAuthenticationModule
     */
    protected async createRequestContextGetUserMethod(
        sessionStorage: any,
        _route: IRoute,
        _req: HttpRequest<{}>
    ): Promise<TGetUserMethod> {
        return () => {
            return { ...sessionStorage, _cacheKey: sessionStorage.cacheKey };
        };
    }

    protected async findOrCreateUser(
        oidcData: IPortaAuthenticationResult,
        _req: HttpRequest<IPortaHTTPRequestContext>
    ): Promise<any> {
        return oidcData;
    }

    protected async getLandingURL(
        req: HttpRequest<IPortaHTTPRequestContext>,
        _logout?: boolean
    ): Promise<ILandingURLConfig> {
        const { state } = req.context.getParameters<{ state: string }>();
        const { location = undefined } = JSON.parse(state ? base64Decode(state) : "{}" || "{}");
        return {
            url: location || req.context.getServerURL()
        };
    }

    /**
     * @protected
     * @param {string} tenant
     * @param {HttpRequest<IPortaHTTPRequestContext>} req
     * @returns {Promise<string>}
     * @memberof PortaSelfAuthenticationModule
     */
    protected async getDiscoveryURL(tenant: string, req: HttpRequest<IPortaHTTPRequestContext>): Promise<string> {
        return `${req.context.getServerURL()}/${tenant}/oauth2`;
    }

    /**
     * @protected
     * @param {string} tenant
     * @returns {Promise<ClientMetadata>}
     * @memberof PortaSelfAuthenticationModule
     */
    protected async getOIDCClientConfig(tenant: string): Promise<ClientMetadata> {
        const { tenantRecord } = await databaseUtils.getTenantDataSource(tenant);
        const clientDs = new SysClientDataService({ tenantId: databaseUtils.getTenantDataSourceID(tenantRecord) });
        const client = await clientDs.findSysClientById({ id: eDefaultClients.UI_CLIENT.id });

        return {
            client_id: client.client_id,
            client_secret: client.secret
        };
    }

    /**
     * @protected
     * @param {string} _tenant
     * @param {BaseClient} _client
     * @param {HttpRequest<{}>} req
     * @returns {Promise<AuthorizationParameters>}
     * @memberof PortaSelfAuthenticationModule
     */
    protected async getAuthorizationParameters(
        _tenant: string,
        _client: BaseClient,
        req: HttpRequest<{}>
    ): Promise<AuthorizationParameters> {
        const { ui_locales, state } = req.context.getParameters<{ ui_locales: string; state: string }>();
        return {
            scope: "openid email profile offline_access",
            state,
            ui_locales,
            resource: req.context.getServerURL()
        };
    }

    protected createKeySignatureName(_req: HttpRequest<{}>): string {
        throw new Error("Method not implemented.");
    }

    /**
     * This method should not be called in this class
     *
     * @protected
     * @param {HttpRequest<{}>} _req
     * @returns {Promise<string>}
     * @memberof PortaSelfAuthenticationModule
     */
    protected async getKeySignature(req: HttpRequest<{}>): Promise<string> {
        const { sig } = await this.getKeySignatureCustom(req);
        return sig;
    }
}
