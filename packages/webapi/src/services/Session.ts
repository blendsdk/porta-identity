import { SessionProviderModuleBase, TGetUserMethod } from "@blendsdk/webafx-auth";
import { HttpRequest, IRequestContext, IRoute } from "@blendsdk/webafx-common";
import { IPortaAccount, ISysTenant } from "@porta/shared";
import { TokenEndpointController } from "../modules/api/authorization/controllers/TokenEndpointController";
import { eOAuthGrantType, IPortaApplicationSetting } from "../types";
import { commonUtils } from "./CommonUtils";
import { databaseUtils } from "./DatabaseUtils";

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
     * Get the tenant from request
     *
     * @protected
     * @param {HttpRequest} req
     * @returns
     * @memberof PortaSelfAuthenticationModule
     */
    protected getTenantFromRequest(req: HttpRequest) {
        const { tenant = undefined } = req.context.getParameters<{ tenant: string; }>() || {};
        return tenant;
    }

    protected async createSessionStorageByAccessToken(token: string, tenantRecord: ISysTenant, use_reference: boolean) {
        const { accessToken = undefined, roles = undefined, permissions = undefined, application } =
            await databaseUtils.findAccessTokenByTenantAndToken(token, tenantRecord, use_reference) || {};
        if (accessToken) {
            const { profile, tenant, user, client, auth_request_params } = accessToken;
            return {
                profile,
                tenant,
                user,
                roles,
                permissions,
                application,
                client,
                auth_request_params
            } as IPortaAccount as any;
        }
        return undefined;
    }

    /**
     * @protected
     * @template SessionStorageType
     * @param {string} _token
     * @param {HttpRequest} req
     * @return {*}  {Promise<SessionStorageType>}
     * @memberof PortaAuthSessionProviderModule
     */
    protected async findSessionStorageByToken<SessionStorageType = any>(token: string, req: HttpRequest<IRequestContext>): Promise<SessionStorageType> {
        const tokenType = req.context.getService<eTokenType>(KEY_AUTH_TOKEN_TYPE);
        switch (tokenType) {
            case eTokenType.DIRECT_API: {
                return {
                    direct_api: true,
                    user: {},
                    cacheKey: null
                } as SessionStorageType;
            }
            case eTokenType.BEARER_TOKEN: {
                const tenantRecord = await commonUtils.getTenantRecord(this.getTenantFromRequest(req), req);
                if (tenantRecord) {
                    return await this.createSessionStorageByAccessToken(token, tenantRecord, false);
                }
                return undefined;
            }
            case eTokenType.CLIENT_CREDENTIALS: {
                const { client_id, client_secret } = JSON.parse(token) || ({} as any);
                const tenantRecord = await commonUtils.getTenantRecord(this.getTenantFromRequest(req), req);
                if (tenantRecord) {
                    const token_reference = commonUtils.createTokenReference(client_id, client_id, req);
                    const result = await this.createSessionStorageByAccessToken(token_reference, tenantRecord, true);
                    if (result) {
                        return result;
                    } else {
                        const controller = new TokenEndpointController({ request: req, response: undefined });
                        const { token: newToken, errors } = await controller.getTokenByClientCredentials({
                            grant_type: eOAuthGrantType.client_credentials,
                            tenant: tenantRecord.id,
                            client_id,
                            client_secret,
                            scope: "openid email userinfo profile acl"
                        }, tenantRecord);
                        return errors.length === 0 ? await this.createSessionStorageByAccessToken(newToken.access_token, tenantRecord, false) : undefined;
                    }
                }
                return undefined;
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

        const {
            access_token = undefined,
            client_id = undefined,
            client_secret = undefined
        } = req.context.getParameters<{ access_token: string; client_id: string; client_secret: string; }>();

        console.log(req.context.getParameters());

        if (access_token) {
            req.context.addService(KEY_AUTH_TOKEN_TYPE, eTokenType.BEARER_TOKEN);
            return access_token;
        }

        if (bearerToken) {
            const { PORTA_API_KEY = Math.random().toString() } = req.context.getSettings<IPortaApplicationSetting>();
            req.context.addService(KEY_AUTH_TOKEN_TYPE, PORTA_API_KEY === bearerToken ? eTokenType.DIRECT_API : eTokenType.BEARER_TOKEN);
            return bearerToken;
        }

        if (client_id && client_secret) {
            req.context.addService(KEY_AUTH_TOKEN_TYPE, eTokenType.CLIENT_CREDENTIALS);
            return JSON.stringify({ client_id, client_secret });
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