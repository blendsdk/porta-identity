import { SessionProviderModuleBase, TGetUserMethod } from "@blendsdk/webafx-auth";
import { HttpRequest, IRoute } from "@blendsdk/webafx-common";
import { IPortaApplicationSetting } from "../types";

const KEY_AUTH_TOKEN_TYPE = "_AUTH_TOKEN_TYPE_";

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
 * @class PortaAuthSessionProviderModule
 * @extends {SessionProviderModuleBase}
 */
export class PortaAuthSessionProviderModule extends SessionProviderModuleBase {
    /**
     * @protected
     * @template SessionStorageType
     * @param {string} _token
     * @param {HttpRequest} req
     * @return {*}  {Promise<SessionStorageType>}
     * @memberof PortaAuthSessionProviderModule
     */
    protected async findSessionStorageByToken<SessionStorageType = any>(_token: string, req: HttpRequest): Promise<SessionStorageType> {
        const tokenType = req.context.getService<eTokenType>(KEY_AUTH_TOKEN_TYPE);
        switch (tokenType) {
            case eTokenType.DIRECT_API: {
                return {
                    direct_api: true,
                    user: {},
                    cacheKey: null
                } as SessionStorageType;
            }
            default:
                req.context.getLogger().error("INVALID_TOKEN_TYPE", { tokenType });
                return undefined;
        }
    }

    /**
     * @protected
     * @param {HttpRequest} req
     * @return {*}  {Promise<string>}
     * @memberof PortaAuthSessionProviderModule
     */
    protected async getSessionTokenFromRequest(req: HttpRequest): Promise<string> {

        const bearerToken = this.getBearerToken(req) || undefined;

        if (bearerToken) {
            const { PORTA_API_KEY = Math.random().toString() } = req.context.getSettings<IPortaApplicationSetting>();
            req.context.addService(KEY_AUTH_TOKEN_TYPE, PORTA_API_KEY === bearerToken ? eTokenType.DIRECT_API : eTokenType.BEARER_TOKEN);
            return bearerToken;
        }

    }

    /**
     * @protected
     * @param {*} _sessionStorage
     * @param {IRoute} _route
     * @param {HttpRequest} _req
     * @return {*}  {Promise<TGetUserMethod>}
     * @memberof PortaAuthSessionProviderModule
     */
    protected async createRequestContextGetUserMethod(sessionStorage: any, _route: IRoute, _req: HttpRequest): Promise<TGetUserMethod> {
        return () => {
            return { ...sessionStorage, _cacheKey: sessionStorage.cacheKey, _sub: sessionStorage.user_id };
        };

    }
}