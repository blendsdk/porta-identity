import { MD5, isNullOrUndef } from "@blendsdk/stdlib";
import { SessionProviderModuleBase, TGetUserMethod } from "@blendsdk/webafx-auth";
import { HttpRequest, IRequestContext, IRoute } from "@blendsdk/webafx-common";
import { IAccessToken, IPortaApplicationSetting, eOAuthGrantType } from "../../../types";
import { databaseUtils } from "../../../utils";
import { TokenEndpointController } from "../../api/authorization/controllers/TokenEndpointController";
import { keySignatureProvider } from "./keysignature";

const KEY_AUTH_TOKEN_TYPE = "_AUTH_TOKEN_TYPE_";

const ANONYMUS_LOGOUT_TOKEN = MD5(Date.now());

enum eTokenType {
    BEARER_TOKEN = "BEARER_TOKEN",
    CLIENT_CREDENTIALS = "CLIENT_CREDENTIALS",
    COOKIE_TOKEN = "COOKIE_TOKEN",
    ANONYMOUS_LOGOUT_TOKEN = "ANONYMOUS_LOGOUT_TOKEN",
    DIRECT_API = "ANONYMOUS_LOGOUT_TOKEN"
}

/**
 * Implements a session provider
 *
 * @export
 * @class PortaSelfAuthSessionProviderModule
 * @extends {SessionProviderModuleBase}
 */
export class PortaSelfAuthSessionProviderModule extends SessionProviderModuleBase {
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
     * @protected
     * @param {string} tenant
     * @param {string} token
     * @returns
     * @memberof PortaSelfAuthenticationModule
     */
    protected async findAccessTokenByTenant(tenant: string, token: string, token_reference?: boolean) {
        const accessTokenStorage = await databaseUtils.findAccessTokenByTenant(tenant, token, token_reference);
        return isNullOrUndef(accessTokenStorage) ? undefined : accessTokenStorage;
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
                } = (await keySignatureProvider.getKeySignature(req)) || {};
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

                    const token_reference = MD5([client_id, client_secret, req.context.getRoute().url].join(""));
                    const existing_access_token = await databaseUtils.findAccessTokenByTenant(
                        tenant,
                        token_reference,
                        true
                    );

                    if (existing_access_token) {
                        return existing_access_token as SessionStorageType;
                    } else {
                        const { token: newToken } = await controller.getTokenByClientCredentials({
                            grant_type: eOAuthGrantType.client_credentials,
                            tenant,
                            client_id,
                            client_secret,
                            scope: "email profile acl"
                        });
                        return newToken && newToken.access_token
                            ? ((await this.findAccessTokenByTenant(
                                  tenant,
                                  newToken.access_token
                              )) as SessionStorageType)
                            : undefined;
                    }
                } else {
                    return undefined;
                }
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
        const { sig = undefined } = (await keySignatureProvider.getKeySignature(req)) || {};
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
            return { ...sessionStorage, _cacheKey: sessionStorage.cacheKey, _sub: sessionStorage.user_id };
        };
    }
}
