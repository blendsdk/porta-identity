import { HttpRequest } from "@blendsdk/webafx-common";
import {
    ILandingURLConfig,
    IPortaAuthenticationResult,
    IPortaHTTPRequestContext,
    PortaMultiTenantClientModule
} from "@porta/webafx-auth";
import { ClientMetadata, BaseClient, AuthorizationParameters } from "openid-client";

export class PortaClient extends PortaMultiTenantClientModule {
    protected createKeySignatureName(_req: HttpRequest<{}>): string {
        return "bff-application";
    }

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

    protected async getDiscoveryURL(_tenant: string, _req: HttpRequest<IPortaHTTPRequestContext>): Promise<string> {
        return `https://dev.portaidentity.com/porta/oauth2`;
    }

    protected async getOIDCClientConfig(_tenant: string): Promise<ClientMetadata> {
        return {
            client_id: "porta1",
            client_secret: "secret1"
        };
    }
    protected async getAuthorizationParameters(
        _tenant: string,
        _client: BaseClient,
        _req: HttpRequest<{}>
    ): Promise<AuthorizationParameters> {
        return {
            scope: "openid email profile offline_access",
            state: `hello-${Date.now()}`,
            ui_locales: "nl-NL"
        };
    }
}
