import { sha256Hash } from "@blendsdk/crypto";
import { CRC32 } from "@blendsdk/stdlib";
import { HttpRequest } from "@blendsdk/webafx-common";
import {
    ILandingURLConfig,
    IPortaAuthenticationResult,
    IPortaHTTPRequestContext,
    PortaMultiTenantAuthenticationTokenModule
} from "@porta/webafx-auth";
import { AuthorizationParameters, BaseClient, ClientMetadata } from "openid-client";
import { getKeySignature } from "./common";

export class CliTokenAuth extends PortaMultiTenantAuthenticationTokenModule {
    protected async getLandingURL(
        req: HttpRequest<IPortaHTTPRequestContext>,
        logout?: boolean | undefined
    ): Promise<ILandingURLConfig> {
        const { state, ui_locales, tenant } = req.context.porta;
        return {
            url: `${req.context.getServerURL()}/${tenant}/complete`,
            searchParams: {
                state,
                ui_locales,
                logout: logout ? "Y" : "N"
            }
        };
    }

    protected async getAuthorizationParameters(
        _tenant: string,
        _client: BaseClient,
        req: HttpRequest<{}>
    ): Promise<AuthorizationParameters> {
        return {
            prompt: "login",
            scope: "openid email profile offline_access acl",
            state: `hello-${Date.now()}`,
            ui_locales: "nl-NL",
            resource: req.context.getServerURL()
        };
    }
    protected async getOIDCClientConfig(tenant: string): Promise<ClientMetadata> {
        return {
            client_id: await sha256Hash(`porta_cli_${tenant}`),
            token_endpoint_auth_method: "none"
        };
    }

    protected async getDiscoveryURL(tenant: string, req: HttpRequest<IPortaHTTPRequestContext>): Promise<string> {
        const { PORTA_HOST } = req.context.getSettings<{ PORTA_HOST: string }>();
        return `${PORTA_HOST}/${tenant}/oauth2`;
    }

    protected async findOrCreateUser(
        oidcData: IPortaAuthenticationResult,
        _req: HttpRequest<IPortaHTTPRequestContext>
    ): Promise<any> {
        return oidcData;
    }

    protected async getSessionTTLKey(_req: HttpRequest<{}>): Promise<string> {
        return "_session";
    }

    protected newAccessToken(_req: HttpRequest<{}>): Promise<string> {
        return CRC32(new Date().toUTCString());
    }

    protected async getKeySignature(req: HttpRequest<{}>): Promise<string> {
        return getKeySignature(req);
    }
}
