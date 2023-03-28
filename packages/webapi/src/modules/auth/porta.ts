import { IDictionaryOf } from "@blendsdk/stdlib";
import { IApplicationModule } from "@blendsdk/webafx";
import { AuthenticationModuleBase, IAuthenticationModule } from "@blendsdk/webafx-auth";
import { HttpRequest } from "@blendsdk/webafx-common";
import { databaseUtils } from "../../utils";
import { eKeySignatureType, portaAuthUtils } from "./utils";

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
                        tenantRecord,
                        this.config.PORTA_SSO_COMMON_NAME,
                        eKeySignatureType.access_token
                    )
                };
            }
        }
        return this.tenantKeySignatures[tenant];
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
        return access_token || this.getBearerToken(req) || (sig ? this.getCookieToken(sig, req) : undefined);
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
