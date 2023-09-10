import { TokenAuthenticationModuleBase, ITokenAuthenticationModuleBase, TGetUserMethod } from "@blendsdk/webafx-auth";
import { HttpRequest, HttpResponse, IRoute, ServerErrorResponse, sendResponse } from "@blendsdk/webafx-common";

import {
    AuthorizationParameters,
    BaseClient,
    ClientMetadata,
    IdTokenClaims,
    Issuer,
    TokenSet,
    UserinfoResponse,
    custom,
    generators
} from "openid-client";
import { IDictionaryOf } from "@blendsdk/stdlib";
import { eJsonSchemaType, eParameterLocation } from "@blendsdk/jsonschema";
import { renderGetRedirect } from "./utils";

// This is global for this application
custom.setHttpOptionsDefaults({
    timeout: 30 * 1000 // (30 seconds)
});

const issuerCache: IDictionaryOf<Issuer<BaseClient>> = {};
const clientCache: IDictionaryOf<BaseClient> = {};

export interface IPortaAuthenticationResult {
    tokenSet: TokenSet;
    claims: IdTokenClaims;
    userInfo: UserinfoResponse;
    ui_locales: string;
    state: string;
    tenant: string;
}

export interface IPortaHTTPRequestContext {
    porta: IPortaAuthenticationResult;
}

export interface IRequestParameters {
    tenant: string;
    state?: string;
    code?: string;
    locale?: string;
}

export interface ILandingURLConfig {
    url: string;
    searchParams?: IDictionaryOf<string>;
}

interface IClientCache {
    code_verifier: string;
    appState: string;
    tenant: string;
    ui_locales: string;
}

export interface PortaMultiTenantClientModule extends ITokenAuthenticationModuleBase {}

/**
 * Porta OIDC client
 *
 * @export
 * @class PortaClientModule
 * @extends {AuthenticationModuleBase}
 */
export abstract class PortaMultiTenantClientModule extends TokenAuthenticationModuleBase<PortaMultiTenantClientModule> {
    protected abstract findOrCreateUser(
        oidcData: IPortaAuthenticationResult,
        req: HttpRequest<IPortaHTTPRequestContext>
    ): Promise<any>;
    /**
     * Gets the landing URL after authentication is complete
     *
     * @protected
     * @abstract
     * @param {HttpRequest<IPortaHTTPRequestContext>} req
     * @returns {Promise<ILandingURLConfig>}
     * @memberof PortaMultiTenantClientModule
     */
    protected abstract getLandingURL(req: HttpRequest<IPortaHTTPRequestContext>): Promise<ILandingURLConfig>;
    /**
     * Provide a discovery URL to use to connect to the Porta OIDC provider
     *
     * @protected
     * @abstract
     * @param {string} tenant
     * @returns {Promise<string>}
     * @memberof PortaMultiTenantClientModule
     */
    protected abstract getDiscoveryURL(tenant: string): Promise<string>;
    /**
     * Provide the Porta OIDC client connection provider
     *
     * @protected
     * @abstract
     * @param {string} tenant
     * @returns {Promise<ClientMetadata>}
     * @memberof PortaMultiTenantClientModule
     */
    protected abstract getOIDCClientConfig(tenant: string): Promise<ClientMetadata>;
    /**
     * Provide the OIDC authorization URL parameters
     *
     * @protected
     * @abstract
     * @param {string} tenant
     * @param {BaseClient} client
     * @param {HttpRequest} req
     * @returns {Promise<AuthorizationParameters>}
     * @memberof PortaMultiTenantClientModule
     */
    protected abstract getAuthorizationParameters(
        tenant: string,
        client: BaseClient,
        req: HttpRequest
    ): Promise<AuthorizationParameters>;

    /**
     * Provide the callback URL to this provider
     *
     * @protected
     * @param {string} tenant
     * @param {HttpRequest} req
     * @returns
     * @memberof PortaMultiTenantClientModule
     */
    protected getRedirectURI(tenant: string, req: HttpRequest) {
        return `${req.context.getServerURL().replace(":443", "")}/oidc/${tenant}/callback`;
    }

    /**
     * Gets the OIDC client instance
     *
     * @param {string} tenant
     * @param {string} discoveryUrl
     * @param {HttpRequest} req
     * @returns {Promise<BaseClient>}
     * @memberof PortaMultiTenantClientModule
     */
    public async getOIDCClient(tenant: string, discoveryUrl: string, req: HttpRequest): Promise<BaseClient> {
        let issuer = issuerCache[discoveryUrl];
        if (!issuer) {
            issuer = issuerCache[discoveryUrl] = await Issuer.discover(discoveryUrl);
        }
        let clientConfig = await this.getOIDCClientConfig(tenant);
        const cacheKey = JSON.stringify(clientConfig);
        let client = clientCache[cacheKey];
        if (!client) {
            client = clientCache[cacheKey] = new issuer.Client({
                ...clientConfig,
                redirect_uri: this.getRedirectURI(tenant, req)
            });
        }
        return client;
    }

    /**
     * Create the sign-in handler
     *
     * @protected
     * @memberof PortaMultiTenantClientModule
     */
    protected createSignHandler(): void {
        this.application.addRouter({
            routes: [
                {
                    url: "/oidc/:tenant/login",
                    method: "get",
                    public: true,
                    request: {
                        properties: {
                            tenant: { type: eJsonSchemaType.string },
                            locale: { type: eJsonSchemaType.string, location: eParameterLocation.query },
                            state: { type: eJsonSchemaType.string, location: eParameterLocation.query }
                        },
                        required: ["tenant"]
                    },
                    handlers: (req: HttpRequest, res: HttpResponse) => {
                        const worker = new Promise<string>(async (resolve, reject) => {
                            try {
                                // The original state
                                const { state, locale, tenant } = req.context.getParameters<IRequestParameters>();
                                const cache = req.context.getCache();
                                const discoveryUrl = await this.getDiscoveryURL(tenant);
                                const client = await this.getOIDCClient(tenant, discoveryUrl, req);

                                const code_verifier = generators.codeVerifier();
                                const code_challenge = generators.codeChallenge(code_verifier);
                                const stateKey = crypto.randomUUID().replace(/\-/gi, "");
                                const customAuthParams = await this.getAuthorizationParameters(tenant, client, req);
                                const ui_locales = locale || customAuthParams.ui_locales;
                                const appState = state || customAuthParams.state;
                                const authParams: AuthorizationParameters = {
                                    ...customAuthParams,
                                    state: stateKey,
                                    code_challenge,
                                    ui_locales,
                                    code_challenge_method: "S256",
                                    response_types: ["code"]
                                };
                                await cache.setValue<IClientCache>(
                                    `openid-client:${stateKey}`,
                                    {
                                        code_verifier,
                                        appState,
                                        ui_locales,
                                        tenant
                                    },
                                    {
                                        expire: Date.now() + 60000
                                    }
                                );
                                resolve(client.authorizationUrl(authParams));
                            } catch (err: any) {
                                reject(err);
                            }
                        });

                        worker
                            .then((url) => {
                                res.send(renderGetRedirect(url, 1));
                            })
                            .catch((err) => {
                                const resp = new ServerErrorResponse(err);
                                sendResponse(resp, res);
                            });
                    }
                },
                {
                    url: "/oidc/:tenant/callback",
                    method: "get",
                    public: true,
                    request: {
                        properties: {
                            tenant: { type: eJsonSchemaType.string },
                            code: { type: eJsonSchemaType.string, location: eParameterLocation.query },
                            state: { type: eJsonSchemaType.string, location: eParameterLocation.query }
                        },
                        required: ["tenant", "code"]
                    },
                    handlers: (req: HttpRequest<IPortaHTTPRequestContext>, res: HttpResponse) => {
                        const worker = new Promise<any>(async (resolve, reject) => {
                            try {
                                const cache = req.context.getCache();
                                const { state, tenant } = req.context.getParameters<IRequestParameters>();
                                const discoveryUrl = await this.getDiscoveryURL(tenant);
                                const client = await this.getOIDCClient(tenant, discoveryUrl, req);

                                const { code_verifier, ui_locales, appState } = await cache.getValue<IClientCache>(
                                    `openid-client:${state}`
                                );

                                const callbackParameters = client.callbackParams(req);
                                const tokenSet = await client.callback(
                                    this.getRedirectURI(tenant, req),
                                    callbackParameters,
                                    {
                                        code_verifier,
                                        state
                                    }
                                );
                                resolve({
                                    tokenSet,
                                    claims: tokenSet.claims(),
                                    userInfo: await client.userinfo(tokenSet.access_token),
                                    ui_locales,
                                    state: appState,
                                    tenant
                                });
                            } catch (err: any) {
                                if (err.response && err.response.body) {
                                    reject(err.response.body);
                                } else {
                                    reject(err);
                                }
                            }
                        });
                        worker
                            .then((data: IPortaAuthenticationResult) => {
                                req.context.porta = data;
                                this.authenticateUser(req)
                                    .then((user) => {
                                        if (user) {
                                            const worker = this.createResponseAuthorized({
                                                user,
                                                req,
                                                res
                                            });
                                            worker.then(async () => {
                                                const { searchParams, url: landingURL } = await this.getLandingURL(req);
                                                const url = new URL(landingURL);
                                                Object.entries(searchParams || {}).forEach(([k, v]) => {
                                                    url.searchParams.append(k, v);
                                                });
                                                res.send(renderGetRedirect(url.toString(), 1));
                                            });
                                        }
                                    })
                                    .catch((err) => {
                                        const resp = new ServerErrorResponse(err);
                                        sendResponse(resp, res);
                                    });
                            })
                            .catch((err) => {
                                const resp = new ServerErrorResponse(err);
                                sendResponse(resp, res);
                            });
                    }
                },
                {
                    url: "/oidc/:tenant/logout",
                    method: "get",
                    public: true
                }
            ]
        });
    }

    /**
     * Create the cookie key signature name
     *
     * @protected
     * @param {HttpRequest<IPortaHTTPRequestContext>} req
     * @returns {string}
     * @memberof PortaMultiTenantClientModule
     */
    protected createKeySignatureName(req: HttpRequest<IPortaHTTPRequestContext>): string {
        const tenant: any = req.context.porta.claims["tenant"];
        return tenant.id;
    }

    /**
     * Authenticates the user by passing the OIDC data to the implementing class
     *
     * @protected
     * @param {HttpRequest<IPortaHTTPRequestContext>} req
     * @returns {Promise<any>}
     * @memberof PortaMultiTenantClientModule
     */
    protected async authenticateUser(req: HttpRequest<IPortaHTTPRequestContext>): Promise<any> {
        return this.findOrCreateUser(req.context.porta, req);
    }

    /**
     * @protected
     * @param {HttpRequest<IPortaHTTPRequestContext>} req
     * @returns {number}
     * @memberof PortaMultiTenantClientModule
     */
    protected getTokenTTL(req: HttpRequest<IPortaHTTPRequestContext>): number {
        return req.context.porta.tokenSet.expires_in * 1000;
    }

    /**
     * @protected
     * @memberof PortaMultiTenantClientModule
     */
    protected createSignOutHandler(): void {}

    /**
     * @protected
     * @memberof PortaMultiTenantClientModule
     */
    protected createSessionRefreshHandler(): void {}

    /**
     * @protected
     * @param {*} sessionStorage
     * @param {IRoute} _route
     * @param {HttpRequest<{}>} _reg
     * @returns {Promise<TGetUserMethod>}
     * @memberof PortaMultiTenantClientModule
     */
    protected async createRequestContextGetUserMethod(
        sessionStorage: any,
        _route: IRoute,
        _reg: HttpRequest<{}>
    ): Promise<TGetUserMethod> {
        return () => {
            return sessionStorage.user;
        };
    }
}
