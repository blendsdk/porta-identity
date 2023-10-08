import { base64Decode } from "@blendsdk/stdlib";
import { INewAccessOrRefreshToken, JWTTokenProvider, SESSION_KEY } from "@blendsdk/webafx-auth";
import {
    ILandingURLConfig,
    IOpenIDAuthenticationResult,
    IOpenIDHTTPRequestContext,
    MultiTenantOpenIDTokenAuthenticationModule
} from "@blendsdk/webafx-auth-oidc";
import { HttpRequest } from "@blendsdk/webafx-common";
import { AuthorizationParameters, BaseClient, ClientMetadata } from "openid-client";
import { databaseUtils } from "../../../utils";
import { keySignatureProvider } from "./keysignature";

export class PortaSelfAuthTokenAuthenticationModule extends MultiTenantOpenIDTokenAuthenticationModule {
    /**
     * @protected
     * @param {INewAccessOrRefreshToken} params
     * @param {HttpRequest<{}>} req
     * @returns {Promise<string>}
     * @memberof PortaSelfAuthTokenAuthenticationModule
     */
    protected async newAccessToken(params: INewAccessOrRefreshToken, req: HttpRequest<{}>): Promise<string> {

        const { expireAt, userStorage } = params || {};
        const { tenant } = req.context.getParameters<{ tenant: string; }>();
        const { tenantRecord } = await databaseUtils.getTenantDataSource(tenant);
        const { publicKey, privateKey } = await databaseUtils.getJWKSigningKeys(tenantRecord);

        const { userInfo, claims, } = (userStorage as IOpenIDAuthenticationResult);

        const tokenProvider = new JWTTokenProvider({ privateKey, publicKey });
        const { access_token } = await tokenProvider.newJWTAccessToken({
            audience: req.context.getServerURL(),
            expirationTime: expireAt,
            subject: userInfo.sub,
            issuer: claims.iss,
            claims: {},
            jti: Date.now().toString()

        });
        return access_token;
    }

    /**
     * @override
     * @param {ICreateResponseAuthorizedParams} _params
     * @returns
     * @memberof PortaSelfAuthenticationModule
     */
    // protected async createResponseAuthorized(_params: ICreateResponseAuthorizedParams) {
    //     // only the SESSION_TTL_KEY was supposed to be passes here but is is being
    //     // takes care of by `installLocalCookies`
    //     return null;
    // }

    /**
     * @override
     * @protected
     * @param {string} tenant
     * @param {HttpRequest} req
     * @returns
     * @memberof PortaSelfAuthenticationModule
     */
    protected getRedirectURI(tenant: string, req: HttpRequest) {
        const serverURL = req.context.getServerURL().replace(/\:80|\:443/g, "");
        const { redirect_uri } = super.getRedirectURI(tenant, req);
        return {
            redirect_uri,
            post_logout_redirect_uris: [`${serverURL}/fe/auth/${tenant}/signout/complete`]
        };
    }

    /**
     * @protected
     * @param {HttpRequest<IPortaHTTPRequestContext>} req
     * @param {boolean} [_logout]
     * @returns {Promise<ILandingURLConfig>}
     * @memberof PortaSelfAuthTokenAuthenticationModule
     */
    protected async getLandingURL(
        req: HttpRequest<IOpenIDHTTPRequestContext>,
        _logout?: boolean
    ): Promise<ILandingURLConfig> {
        const { state } = req.context.getParameters<{ state: string; }>();
        const { location = undefined } = JSON.parse(state ? base64Decode(state) : "{}" || "{}");
        return {
            url: location || req.context.getServerURL()
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
        const { ui_locales, state } = req.context.getParameters<{ ui_locales: string; state: string; }>();
        return {
            scope: "profile address openid email phone acl",
            state,
            ui_locales,
            resource: req.context.getServerURL()
        };
    }

    /**
     * @protected
     * @param {string} tenant
     * @returns {Promise<ClientMetadata>}
     * @memberof PortaSelfAuthTokenAuthenticationModule
     */
    protected getOIDCClientConfig(_req: HttpRequest, tenant: string): Promise<ClientMetadata> {
        return databaseUtils.getOIDCClientConfig(tenant);
    }

    /**
     * @protected
     * @param {string} tenant
     * @param {HttpRequest<IPortaHTTPRequestContext>} req
     * @returns {Promise<string>}
     * @memberof PortaSelfAuthTokenAuthenticationModule
     */
    protected async getDiscoveryURL(tenant: string, req: HttpRequest<IOpenIDHTTPRequestContext>): Promise<string> {
        return `${req.context.getServerURL()}/${tenant}/oauth2`;
    }

    /**
     * @protected
     * @param {IPortaAuthenticationResult} oidcData
     * @param {HttpRequest<IPortaHTTPRequestContext>} _req
     * @returns {Promise<any>}
     * @memberof PortaSelfAuthTokenAuthenticationModule
     */
    protected async findOrCreateUser(
        oidcData: IOpenIDAuthenticationResult,
        _req: HttpRequest<IOpenIDHTTPRequestContext>
    ): Promise<any> {
        return oidcData;
    }

    /**
     * @protected
     * @param {HttpRequest<{}>} req
     * @returns {Promise<string>}
     * @memberof PortaSelfAuthTokenAuthenticationModule
     */
    protected async getSessionTTLKey(_req: HttpRequest<{}>): Promise<string> {
        return SESSION_KEY + "hllo";
    }

    /**
     * @protected
     * @param {HttpRequest<{}>} req
     * @returns {Promise<string>}
     * @memberof PortaSelfAuthTokenAuthenticationModule
     */
    protected async getKeySignature(req: HttpRequest<{}>): Promise<string> {
        const { sig } = await keySignatureProvider.getKeySignature(req);
        return sig;
    }
}
