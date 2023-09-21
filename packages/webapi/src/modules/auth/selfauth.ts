import { IDictionaryOf, MD5, isNullOrUndef } from "@blendsdk/stdlib";
import { HttpRequest, IRoute } from "@blendsdk/webafx-common";
import {
    ILandingURLConfig,
    IPortaAuthenticationResult,
    IPortaHTTPRequestContext,
    IPortaMultiTenantClientModule,
    PortaMultiTenantClientModule
} from "@porta/webafx-auth";
import { ClientMetadata, BaseClient, AuthorizationParameters } from "openid-client";
import { databaseUtils } from "../../utils";
import { IAccessToken, IPortaApplicationSetting } from "../../types";
import { eKeySignatureType, portaAuthUtils } from "@porta/shared";
import { TGetUserMethod } from "@blendsdk/webafx-auth";

const KEY_AUTH_TOKEN_TYPE = "_AUTH_TOKEN_TYPE_";

const ANONYMUS_LOGOUT_TOKEN = MD5(Date.now());

enum eTokenType {
    BEARER_TOKEN = "BEARER_TOKEN",
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
     * This method should not be called in this class
     *
     * @protected
     * @param {HttpRequest<{}>} req
     * @returns {Promise<string>}
     * @memberof PortaSelfAuthenticationModule
     */
    protected async getKeySignature(_req: HttpRequest<{}>): Promise<string> {
        throw new Error("Not Implemented");
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
        req: HttpRequest<{}>
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
                const accessTokenStorage = await this.findAccessTokenByTenant(tenant, token);
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
            default:
                return undefined;
        }
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
        const { access_token = undefined } = req.context.getParameters<{ access_token: string }>();

        const bearerToken = this.getBearerToken(req) || undefined;
        const cookieToken = sig ? this.getCookieToken(sig, req) : undefined;
        const anonLogoutToken = this.getAnonymusLogoutURLToken(req);

        if (bearerToken) {
            const { PORTA_API_KEY = undefined } = req.context.getSettings<IPortaApplicationSetting>();
            if (bearerToken === PORTA_API_KEY && !isNullOrUndef(PORTA_API_KEY)) {
                req.context.addService(KEY_AUTH_TOKEN_TYPE, eTokenType.DIRECT_API);
            } else {
                req.context.addService(KEY_AUTH_TOKEN_TYPE, eTokenType.BEARER_TOKEN);
            }
        }

        if (cookieToken) {
            req.context.addService(KEY_AUTH_TOKEN_TYPE, eTokenType.COOKIE_TOKEN);
        }

        if (anonLogoutToken) {
            req.context.addService(KEY_AUTH_TOKEN_TYPE, eTokenType.ANONYMOUS_LOGOUT_TOKEN);
        }

        return access_token || bearerToken || cookieToken || anonLogoutToken;
    }

    protected async createRequestContextGetUserMethod(
        sessionStorage: any,
        _route: IRoute,
        _reg: HttpRequest<{}>
    ): Promise<TGetUserMethod> {
        return () => {
            return { ...sessionStorage, _cacheKey: sessionStorage.cacheKey };
        };
    }

    protected findOrCreateUser(
        _oidcData: IPortaAuthenticationResult,
        _req: HttpRequest<IPortaHTTPRequestContext>
    ): Promise<any> {
        throw new Error("Method not implemented.");
    }
    protected getLandingURL(
        _req: HttpRequest<IPortaHTTPRequestContext>,
        _logout?: boolean
    ): Promise<ILandingURLConfig> {
        throw new Error("Method not implemented.");
    }
    protected getDiscoveryURL(_tenant: string, _req: HttpRequest<IPortaHTTPRequestContext>): Promise<string> {
        throw new Error("Method not implemented.");
    }
    protected getOIDCClientConfig(_tenant: string): Promise<ClientMetadata> {
        throw new Error("Method not implemented.");
    }
    protected getAuthorizationParameters(
        _tenant: string,
        _client: BaseClient,
        _req: HttpRequest<{}>
    ): Promise<AuthorizationParameters> {
        throw new Error("Method not implemented.");
    }

    protected createKeySignatureName(_req: HttpRequest<{}>): string {
        throw new Error("Method not implemented.");
    }
}
