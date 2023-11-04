import { sha256Hash } from "@blendsdk/crypto";
import { CRC32 } from "@blendsdk/stdlib";
import { INewAccessOrRefreshToken, SESSION_KEY } from "@blendsdk/webafx-auth";
import {
    IGetRefreshTokenFromUserCache,
    ILandingURLConfig,
    IOpenIDAuthenticationResult,
    IOpenIDHTTPRequestContext,
    MultiTenantOpenIDTokenAuthenticationModule
} from "@blendsdk/webafx-auth-oidc";
import { HttpRequest } from "@blendsdk/webafx-common";
import { AuthorizationParameters, BaseClient, ClientMetadata } from "openid-client";
import { getKeySignature } from "./common";

export class CliTokenAuth extends MultiTenantOpenIDTokenAuthenticationModule {
    /**
     *
     *
     * @protected
     * @param {string} tenant
     * @param {HttpRequest<{}>} req
     * @return {*}  {Promise<IGetRefreshTokenFromUserCache>}
     * @memberof CliTokenAuth
     */
    protected getRefreshTokenFromUserCache(
        _tenant: string,
        _req: HttpRequest<{}>
    ): Promise<IGetRefreshTokenFromUserCache> {
        throw new Error("Method not implemented.");
    }
    protected async getLandingURL(
        req: HttpRequest<IOpenIDHTTPRequestContext>,
        logout?: boolean | undefined
    ): Promise<ILandingURLConfig> {
        const { state, ui_locales, tenant } = req.context.openid;
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
        req: HttpRequest
    ): Promise<AuthorizationParameters> {
        return {
            prompt: "login",
            scope: "openid email profile offline_access acl",
            state: `hello-${Date.now()}`,
            ui_locales: "nl-NL",
            resource: req.context.getServerURL()
        };
    }
    protected async getOIDCClientConfig(_req: HttpRequest, tenant: string): Promise<ClientMetadata> {
        return {
            client_id: await sha256Hash(`porta_cli_${tenant}`),
            token_endpoint_auth_method: "none"
        };
    }

    protected async getDiscoveryURL(tenant: string, req: HttpRequest<IOpenIDHTTPRequestContext>): Promise<string> {
        const { PORTA_HOST } = req.context.getSettings<{ PORTA_HOST: string }>();
        return `${PORTA_HOST}/${tenant}/oauth2`;
    }

    protected async findOrCreateUser(
        oidcData: IOpenIDAuthenticationResult,
        _req: HttpRequest<IOpenIDHTTPRequestContext>
    ): Promise<any> {
        return oidcData;
    }

    protected async getSessionTTLKey(_req: HttpRequest): Promise<string> {
        return SESSION_KEY;
    }

    protected newAccessToken(_params: INewAccessOrRefreshToken, _req: HttpRequest): Promise<string> {
        return CRC32(new Date().toUTCString());
    }

    protected async getKeySignature(req: HttpRequest): Promise<string> {
        return getKeySignature(req);
    }
}
