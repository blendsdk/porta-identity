import { IDictionaryOf, MD5 } from "@blendsdk/stdlib";
import { IApplicationModule, IDatabaseAppSettings } from "@blendsdk/webafx";
import { AuthenticationModuleBase, IAuthenticationModule } from "@blendsdk/webafx-auth";
import { HttpRequest, HttpResponse, NextFunction } from "@blendsdk/webafx-common";
import { eKeySignatureType, portaAuthUtils } from "@porta/shared";
import { IAccessToken, IPortaApplicationSetting, eOAuthPKCECodeChallengeMethod } from "../../types";
import { databaseUtils } from "../../utils";
import { BaseClient, Issuer, custom, generators } from "openid-client";
import { SysClientDataService } from "../../dataservices/SysClientDataService";
import { renderGetRedirect } from "./utils";
import * as crypto from "crypto";

const ANONYMUS_LOGOUT_TOKEN = MD5(Date.now());

custom.setHttpOptionsDefaults({
    timeout: 10000
});

export class IPortaAuthenticationModule {
    PORTA_SSO_COMMON_NAME?: string;
    PORTA_SESSION_LENGTH?: number;
}

export class PortaAuthenticationModule extends AuthenticationModuleBase<IPortaAuthenticationModule> {
    /**
     * KeySignature cache (safe for multiple docker instances)
     *
     * @protected
     * @type {IDictionaryOf<{ tenant: string; sig: string; id: string }>}
     * @memberof PortaAuthenticationModule
     */
    protected tenantKeySignatures: IDictionaryOf<{ tenant: string; sig: string; id: string }>;

    /**
     * Creates an instance of PortaAuthenticationModule.
     * @param {(IPortaAuthenticationModule & IAuthenticationModule & IApplicationModule)} [config]
     * @memberof PortaAuthenticationModule
     */
    public constructor(config?: IPortaAuthenticationModule & IAuthenticationModule & IApplicationModule) {
        super({ ...config, defaultTTL: config.PORTA_SESSION_LENGTH });
        this.tenantKeySignatures = {};
    }

    protected getServerUrl(request: HttpRequest, local?: boolean) {
        let { address, port } = request.context.getService<{ address: any; port: any }>("serverInfo");

        port = (request.headers["x-forwarded-port"] || port).toString();
        port = port === "80" || port === "443" ? undefined : port;

        return `${local ? "http" : request.headers["x-forwarded-proto"] || request.protocol}://${
            local ? address : request.hostname
        }${local && port ? `:${port}` : ""}`;
    }

    /**
     * Create and cache signature to find the access_tokens from Cookies
     *
     * @protected
     * @param {HttpRequest} req
     * @returns
     * @memberof PortaAuthenticationModule
     */
    protected async getKeySignature(req: HttpRequest) {
        const { tenant } = req.context.getParameters<{ tenant: string }>();
        if (!this.tenantKeySignatures[tenant]) {
            const tenantRecord = await databaseUtils.findTenant(tenant);
            if (tenantRecord) {
                this.tenantKeySignatures[tenant] = {
                    id: tenantRecord.id,
                    tenant: tenantRecord.name,
                    sig: portaAuthUtils.getKeySignature(
                        tenantRecord.name,
                        this.getServerUrl(req),
                        eKeySignatureType.access_token
                    )
                };
            }
        }
        return this.tenantKeySignatures[tenant];
    }

    /**
     * Allow to pass the token authorization for the logout endpoint
     *
     * @protected
     * @param {HttpRequest} req
     * @returns
     * @memberof PortaAuthenticationModule
     */
    protected getAnonymusLogoutToken(req: HttpRequest) {
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
     * @memberof PortaAuthenticationModule
     */
    protected async getSessionTokenFromRequest(req: HttpRequest): Promise<string> {
        const { sig = undefined } = (await this.getKeySignature(req)) || {};
        const { access_token = undefined } = req.context.getParameters<{ access_token: string }>();
        return (
            access_token ||
            this.getBearerToken(req) ||
            (sig ? this.getCookieToken(sig, req) : undefined) ||
            this.getAnonymusLogoutToken(req)
        );
    }

    /**
     * Find a user given an access token
     *
     * @protected
     * @template UserType
     * @param {string} token
     * @param {HttpRequest} req
     * @returns {Promise<UserType>}
     * @memberof PortaAuthenticationModule
     */
    protected async findUserByToken<UserType = any>(token: string, req: HttpRequest): Promise<UserType> {
        const { sig = undefined, tenant = undefined, id = undefined } = (await this.getKeySignature(req)) || {};
        if (sig && tenant && token && id) {
            if (token === ANONYMUS_LOGOUT_TOKEN) {
                return {
                    anonymus_logout: true,
                    user: {}
                } as Partial<IAccessToken> as UserType;
            } else {
                let accessTokenStorage = await databaseUtils.findAccessTokenByTenant(tenant, token);

                // check if the access token has expired
                if (accessTokenStorage && accessTokenStorage.is_expired) {
                    accessTokenStorage = undefined;
                    this.getLogger().warn("AccessToken was expired", accessTokenStorage);
                }

                return accessTokenStorage
                    ? accessTokenStorage.tenant.id === id
                        ? (accessTokenStorage as any)
                        : undefined
                    : undefined;
            }
        } else {
            return undefined;
        }
    }

    protected oidcIssuer: Issuer<BaseClient>;
    protected oidcClient: BaseClient;

    protected async getOidcClient(req: HttpRequest): Promise<BaseClient> {
        if (!this.oidcIssuer) {
            const { PORTA_ADMIN, PORTA_PASSWORD } = this.application.getSettings<
                IPortaApplicationSetting & IDatabaseAppSettings
            >();

            const client_id = MD5([PORTA_ADMIN, PORTA_PASSWORD].join(""));
            const clientDs = new SysClientDataService();
            const clientRecord = await clientDs.findSysClientByClientId({
                client_id
            });

            this.oidcIssuer = await Issuer.discover(`${this.getServerUrl(req)}/porta/oauth2`);
            this.oidcClient = new this.oidcIssuer.Client({
                client_id: clientRecord.client_id,
                client_secret: clientRecord.secret,
                redirect_uris: [clientRecord.redirect_uri],
                response_types: ["code"]
            });
        }
        return this.oidcClient;
    }

    protected async getOidcIssuer(req: HttpRequest): Promise<Issuer<BaseClient>> {
        if (!this.oidcIssuer) {
            this.oidcIssuer = await Issuer.discover(`${this.getServerUrl(req)}/porta/oauth2`);
        }
        return this.oidcIssuer;
    }

    protected createSignHandler(): void {
        //noop
        this.application.addRouter({
            routes: [
                {
                    method: "get",
                    url: "/login",
                    public: true,
                    handlers: (req: HttpRequest, res: HttpResponse, next: NextFunction) => {
                        const worker = new Promise<any>(async (resolve, reject) => {
                            try {
                                const state = crypto.randomUUID();
                                const code_verifier = generators.codeVerifier();

                                const oidcClient = await this.getOidcClient(req);

                                const redirectTo = oidcClient.authorizationUrl({
                                    scope: "openid email profile",
                                    code_challenge: generators.codeChallenge(code_verifier),
                                    code_challenge_method: eOAuthPKCECodeChallengeMethod.S256
                                });

                                await req.context.getCache().setValue(state, {
                                    code_verifier
                                });

                                resolve(redirectTo);
                            } catch (err) {
                                reject(err);
                            }
                        });

                        worker
                            .then((url) => {
                                res.send(renderGetRedirect(url, 1000));
                            })
                            .catch((err) => {
                                next(err);
                            });
                    }
                }
            ]
        });
        return;
    }

    protected createSignOutHandler(): void {
        //noop
        return;
    }

    protected createSessionRefreshHandler(): void {
        //noop
        return;
    }
}
