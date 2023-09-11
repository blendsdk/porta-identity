import {
    TokenAuthenticationModuleBase,
    ITokenAuthenticationModuleBase,
    TGetUserMethod,
    SESSION_TTL_KEY
} from "@blendsdk/webafx-auth";
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
    code_verifier?: string;
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
    /**
     * Finds or creates a user
     *
     * @protected
     * @abstract
     * @param {IPortaAuthenticationResult} oidcData
     * @param {HttpRequest<IPortaHTTPRequestContext>} req
     * @returns {Promise<any>}
     * @memberof PortaMultiTenantClientModule
     */
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
     * @param {boolean} [logout]
     * @returns {Promise<ILandingURLConfig>}
     * @memberof PortaMultiTenantClientModule
     */
    protected abstract getLandingURL(
        req: HttpRequest<IPortaHTTPRequestContext>,
        logout?: boolean
    ): Promise<ILandingURLConfig>;
    /**
     * Provide a discovery URL to use to connect to the Porta OIDC provider
     *
     * @protected
     * @abstract
     * @param {string} tenant
     * @param {HttpRequest<IPortaHTTPRequestContext>} req
     * @returns {Promise<string>}
     * @memberof PortaMultiTenantClientModule
     */
    protected abstract getDiscoveryURL(tenant: string, req: HttpRequest<IPortaHTTPRequestContext>): Promise<string>;
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
        const serverURL = req.context.getServerURL().replace(/\:80|\:443/g, "");
        return {
            redirect_uri: `${serverURL}/oidc/${tenant}/signin/callback`,
            post_logout_redirect_uris: [`${serverURL}/oidc/${tenant}/signout/callback`]
        };
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
                ...this.getRedirectURI(tenant, req)
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
                    url: "/oidc/:tenant/signin",
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
                    handlers: (req: HttpRequest<IPortaHTTPRequestContext>, res: HttpResponse) => {
                        const worker = new Promise<string>(async (resolve, reject) => {
                            try {
                                // The original state
                                const { state, locale, tenant } = req.context.getParameters<IRequestParameters>();
                                const cache = req.context.getCache();
                                const discoveryUrl = await this.getDiscoveryURL(tenant, req);
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
                    url: "/oidc/:tenant/signin/callback",
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
                                const { code_verifier, ui_locales, appState } = await cache.getValue<IClientCache>(
                                    `openid-client:${state}`
                                );
                                req.query.state = appState;
                                const discoveryUrl = await this.getDiscoveryURL(tenant, req);
                                const client = await this.getOIDCClient(tenant, discoveryUrl, req);

                                const callbackParameters = client.callbackParams(req);
                                const { redirect_uri } = this.getRedirectURI(tenant, req);
                                const tokenSet = await client.callback(redirect_uri, callbackParameters, {
                                    code_verifier,
                                    state
                                });
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
                                                    if (v) {
                                                        url.searchParams.append(k, v);
                                                    }
                                                });
                                                res.cookie("locale", data.ui_locales);
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
                }
            ]
        });
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
        const data = await this.findOrCreateUser(req.context.porta, req);
        return {
            ...data,
            _sub: req.context.porta.tokenSet.claims().sub,
            _tenant: (req.context.porta.claims.tenant as any).name,
            _ui_locales: req.context.porta.ui_locales
        };
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
    protected createSignOutHandler(): void {
        this.application.addRouter({
            routes: [
                {
                    url: "/oidc/:tenant/signout",
                    method: "get",
                    public: false,
                    request: {
                        properties: {
                            tenant: { type: eJsonSchemaType.string },
                            state: { type: eJsonSchemaType.string, location: eParameterLocation.query }
                        },
                        required: ["tenant"]
                    },
                    handlers: (req: HttpRequest<IPortaHTTPRequestContext>, res: HttpResponse) => {
                        const worker = new Promise<any>(async (resolve, reject) => {
                            try {
                                const { state, locale, tenant } = req.context.getParameters<IRequestParameters>();
                                const cache = req.context.getCache();
                                const discoveryUrl = await this.getDiscoveryURL(tenant, req);
                                const client = await this.getOIDCClient(tenant, discoveryUrl, req);
                                const stateKey = crypto.randomUUID().replace(/\-/gi, "");

                                await cache.setValue<IClientCache>(
                                    `openid-client:${stateKey}`,
                                    {
                                        appState: state,
                                        tenant,
                                        ui_locales: locale
                                    },
                                    {
                                        expire: Date.now() + 60000
                                    }
                                );

                                const { _sub: logout_hint } = req.context.getUser<any>();
                                const { post_logout_redirect_uris } = this.getRedirectURI(tenant, req);

                                const url = client
                                    .endSessionUrl({
                                        state: stateKey,
                                        post_logout_redirect_uri: post_logout_redirect_uris[0],
                                        client_id: client.metadata.client_id,
                                        logout_hint
                                    })
                                    .replace(/\:443|\:80/g, "");
                                resolve(url);
                            } catch (err: any) {
                                if (err.response && err.response.body) {
                                    reject(err.response.body);
                                } else {
                                    reject(err);
                                }
                            }
                        });
                        worker
                            .then((url) => {
                                res.send(renderGetRedirect(url));
                            })
                            .catch((err) => {
                                const resp = new ServerErrorResponse(err);
                                sendResponse(resp, res);
                            });
                    }
                },
                {
                    url: "/oidc/:tenant/signout/callback",
                    method: "get",
                    public: false,
                    request: {
                        properties: {
                            tenant: { type: eJsonSchemaType.string },
                            state: { type: eJsonSchemaType.string, location: eParameterLocation.query }
                        },
                        required: ["tenant"]
                    },
                    handlers: (req: HttpRequest<IPortaHTTPRequestContext>, res: HttpResponse) => {
                        const worker = new Promise<string>(async (resolve, reject) => {
                            try {
                                const { state, tenant } = req.context.getParameters<IRequestParameters>();
                                const cache = req.context.getCache();
                                const { _cacheKey } = req.context.getUser<any>();
                                const expTTL = new Date(Date.now() - 100000);
                                const { ui_locales, appState } = await cache.getValue<IClientCache>(
                                    `openid-client:${state}`
                                );
                                req.context.porta = {
                                    tenant,
                                    ui_locales,
                                    state: appState,
                                    tokenSet: undefined,
                                    claims: undefined,
                                    userInfo: undefined
                                };

                                const { url, searchParams } = await this.getLandingURL(req, true);
                                const respUrl = new URL(url);
                                Object.entries(searchParams || {}).forEach(([k, v]) => {
                                    if (v) {
                                        respUrl.searchParams.append(k, v);
                                    }
                                });

                                await cache.deleteValue(_cacheKey);
                                res.cookie(this.getKeySignature(req), "", {
                                    httpOnly: true,
                                    expires: expTTL,
                                    signed: true,
                                    secure: req.protocol !== "http"
                                });
                                // the session cookie
                                res.cookie(SESSION_TTL_KEY, -1, {
                                    expires: expTTL
                                });
                                resolve(respUrl.toString());
                            } catch (err: any) {
                                if (err.response && err.response.body) {
                                    reject(err.response.body);
                                } else {
                                    reject(err);
                                }
                            }
                        });
                        worker
                            .then(async (url) => {
                                res.send(renderGetRedirect(url));
                            })
                            .catch((err) => {
                                const resp = new ServerErrorResponse(err);
                                sendResponse(resp, res);
                            });
                    }
                }
            ]
        });
    }

    /**
     * @protected
     * @memberof PortaMultiTenantClientModule
     */
    protected createSessionRefreshHandler(): void {
        this.application.addRouter({
            routes: [
                {
                    url: "/oidc/:tenant/refresh",
                    method: "post",
                    public: false,
                    request: {
                        properties: {
                            tenant: { type: eJsonSchemaType.string }
                        },
                        required: ["tenant"]
                    },
                    handlers: (req: HttpRequest<IPortaHTTPRequestContext>, res: HttpResponse) => {
                        const worker = new Promise<any>(async (resolve, reject) => {
                            try {
                                const { tenant } = req.context.getParameters<IRequestParameters>();
                                const discoveryUrl = await this.getDiscoveryURL(tenant, req);
                                const client = await this.getOIDCClient(tenant, discoveryUrl, req);
                                const { oidc_refresh_token, _ui_locales: ui_locales } = req.context.getUser<any>();

                                const tokenSet = await client.refresh(oidc_refresh_token);

                                resolve({
                                    tokenSet,
                                    claims: tokenSet.claims(),
                                    userInfo: await client.userinfo(tokenSet.access_token),
                                    ui_locales,
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
                            .then((data) => {
                                req.context.porta = data;
                                this.authenticateUser(req)
                                    .then((user) => {
                                        if (user) {
                                            const worker = this.createResponseAuthorized({
                                                user,
                                                req,
                                                res
                                            });
                                            worker.then(async (data) => {
                                                res.json({ user, data });
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
                    url: "/oidc/:tenant/signout/callback",
                    method: "get",
                    public: false,
                    request: {
                        properties: {
                            tenant: { type: eJsonSchemaType.string },
                            state: { type: eJsonSchemaType.string, location: eParameterLocation.query }
                        },
                        required: ["tenant"]
                    },
                    handlers: (req: HttpRequest<IPortaHTTPRequestContext>, res: HttpResponse) => {
                        const worker = new Promise<string>(async (resolve, reject) => {
                            try {
                                const { state, tenant } = req.context.getParameters<IRequestParameters>();
                                const cache = req.context.getCache();
                                const { _cacheKey } = req.context.getUser<any>();
                                const expTTL = new Date(Date.now() - 100000);
                                const { ui_locales, appState } = await cache.getValue<IClientCache>(
                                    `openid-client:${state}`
                                );
                                req.context.porta = {
                                    tenant,
                                    ui_locales,
                                    state: appState,
                                    tokenSet: undefined,
                                    claims: undefined,
                                    userInfo: undefined
                                };

                                const { url, searchParams } = await this.getLandingURL(req, true);
                                const respUrl = new URL(url);
                                Object.entries(searchParams || {}).forEach(([k, v]) => {
                                    if (v) {
                                        respUrl.searchParams.append(k, v);
                                    }
                                });

                                await cache.deleteValue(_cacheKey);
                                res.cookie(this.getKeySignature(req), "", {
                                    httpOnly: true,
                                    expires: expTTL,
                                    signed: true,
                                    secure: req.protocol !== "http"
                                });
                                // the session cookie
                                res.cookie(SESSION_TTL_KEY, -1, {
                                    expires: expTTL
                                });
                                resolve(respUrl.toString());
                            } catch (err: any) {
                                if (err.response && err.response.body) {
                                    reject(err.response.body);
                                } else {
                                    reject(err);
                                }
                            }
                        });
                        worker
                            .then(async (url) => {
                                res.send(renderGetRedirect(url));
                            })
                            .catch((err) => {
                                const resp = new ServerErrorResponse(err);
                                sendResponse(resp, res);
                            });
                    }
                }
            ]
        });
    }

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
            return { ...sessionStorage.user, _cacheKey: sessionStorage.cacheKey };
        };
    }
}
