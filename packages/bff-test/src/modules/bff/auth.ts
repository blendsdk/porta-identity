import { CRC32 } from "@blendsdk/stdlib";
import { HttpRequest } from "@blendsdk/webafx-common";
import {
    ILandingURLConfig,
    IPortaAuthenticationResult,
    IPortaHTTPRequestContext,
    PortaMultiTenantAuthenticationTokenModule
} from "@porta/webafx-auth";
import { AuthorizationParameters, BaseClient, ClientMetadata } from "openid-client";

export class BffTokenAuthenticationModule extends PortaMultiTenantAuthenticationTokenModule {
    protected newAccessToken(_req: HttpRequest<{}>): Promise<string> {
        return CRC32(new Date().toString());
    }

    /**
     * @protected
     * @param {HttpRequest<IPortaHTTPRequestContext>} req
     * @param {boolean} [logout]
     * @returns {Promise<ILandingURLConfig>}
     * @memberof BffTokenAuthenticationModule
     */
    protected async getLandingURL(
        req: HttpRequest<IPortaHTTPRequestContext>,
        logout?: boolean
    ): Promise<ILandingURLConfig> {
        const { state, ui_locales, tenant } = req.context.porta;
        return {
            url: `${req.context.getServerURL()}/fe/dashboard/${tenant}/tenant`,
            searchParams: {
                state,
                ui_locales,
                logout: logout ? "Y" : "N"
            }
        };
    }

    /**
     * @protected
     * @param {string} _tenant
     * @param {BaseClient} _client
     * @param {HttpRequest} req
     * @returns {Promise<AuthorizationParameters>}
     * @memberof BffTokenAuthenticationModule
     */
    protected async getAuthorizationParameters(
        _tenant: string,
        _client: BaseClient,
        req: HttpRequest
    ): Promise<AuthorizationParameters> {
        return {
            scope: "openid email profile offline_access",
            state: `hello-${Date.now()}`,
            ui_locales: "nl-NL",
            resource: req.context.getServerURL()
        };
    }

    /**
     * @protected
     * @param {string} _tenant
     * @returns {Promise<ClientMetadata>}
     * @memberof BffTokenAuthenticationModule
     */
    protected async getOIDCClientConfig(_tenant: string): Promise<ClientMetadata> {
        return {
            client_id: "bff",
            client_secret: "secret"
        };
    }

    /**
     * @protected
     * @param {string} _tenant
     * @param {HttpRequest<IPortaHTTPRequestContext>} req
     * @returns {Promise<string>}
     * @memberof BffTokenAuthenticationModule
     */
    protected async getDiscoveryURL(_tenant: string, req: HttpRequest<IPortaHTTPRequestContext>): Promise<string> {
        //return `https://dev.portaidentity.com/registry/oauth2`;
        const { tenant } = req.context.getParameters<{ tenant: string }>();
        return `https://porta.local/${tenant}/oauth2`;
    }

    /**
     * @protected
     * @param {IPortaAuthenticationResult} oidcData
     * @param {HttpRequest<IPortaHTTPRequestContext>} _req
     * @returns {Promise<any>}
     * @memberof BffTokenAuthenticationModule
     */
    protected async findOrCreateUser(
        oidcData: IPortaAuthenticationResult,
        _req: HttpRequest<IPortaHTTPRequestContext>
    ): Promise<any> {
        return {
            user: oidcData.claims.sub,
            username: oidcData.userInfo.preferred_username,
            email: oidcData.userInfo.email || oidcData.userInfo.preferred_username,
            avatar: oidcData.userInfo.picture,
            oidc_access_token: oidcData.tokenSet.access_token,
            oidc_refresh_token: oidcData.tokenSet.refresh_token,
            roles: oidcData.claims["urn:acl:roles"],
            permissions: oidcData.claims["urn:acl:permissions"],
            tenant: oidcData.claims.tenant,
            locale: oidcData.ui_locales,
            first_name: oidcData.userInfo.nickname,
            last_name: oidcData.userInfo.family_name
        };
    }

    protected async getSessionTTLKey(_req: HttpRequest): Promise<string> {
        return "_session";
    }

    protected getKeySignature(_req: HttpRequest): Promise<string> {
        return CRC32("bff-application");
    }
}
