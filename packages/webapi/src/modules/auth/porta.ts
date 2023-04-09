import { IDictionaryOf, MD5 } from "@blendsdk/stdlib";
import { IApplicationModule } from "@blendsdk/webafx";
import { AuthenticationModuleBase, IAuthenticationModule } from "@blendsdk/webafx-auth";
import { HttpRequest } from "@blendsdk/webafx-common";
import { eKeySignatureType, portaAuthUtils } from "@porta/shared";
import { IAccessToken } from "../../types";
import { databaseUtils } from "../../utils";

const ANONYMUS_LOGOUT_TOKEN = MD5(Date.now());

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
        const { address, port } = request.context.getService<{ address: any; port: any }>("serverInfo");
        return `${local ? "http" : request.headers["x-forwarded-proto"] || request.protocol}://${
            local ? address : request.hostname
        }${local ? `:${port}` : ""}`;
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

    protected createSignHandler(): void {
        //noop
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
