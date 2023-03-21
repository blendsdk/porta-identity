import { IDictionaryOf } from "@blendsdk/stdlib";
import { IApplicationModule } from "@blendsdk/webafx";
import { AuthenticationModuleBase, IAuthenticationModule } from "@blendsdk/webafx-auth";
import { HttpRequest } from "@blendsdk/webafx-common";
import { IPortaSessionStorage } from "../../types";
import { databaseUtils } from "../../utils";
import { portaAuthUtils } from "./utils";

export class IPortaAuthenticationModule {
    PORTA_SSO_COMMON_NAME?: string;
    PORTA_SESSION_LENGTH?: number;
}

export class PortaAuthenticationModule extends AuthenticationModuleBase<IPortaAuthenticationModule> {
    protected tenantKeySignatures: IDictionaryOf<{ id: string; sig: string }>;

    /**
     * Creates an instance of PortaAuthenticationModule.
     * @param {(IPortaAuthenticationModule & IAuthenticationModule & IApplicationModule)} [config]
     * @memberof PortaAuthenticationModule
     */
    public constructor(config?: IPortaAuthenticationModule & IAuthenticationModule & IApplicationModule) {
        super({ ...config, defaultTTL: config.PORTA_SESSION_LENGTH });
        this.tenantKeySignatures = {};
    }

    protected async getKeySignature(req: HttpRequest) {
        const { tenant } = req.context.getParameters<{ tenant: string }>();
        if (!this.tenantKeySignatures[tenant]) {
            const tenantRecord = await databaseUtils.findTenant(tenant);
            if (tenantRecord) {
                this.tenantKeySignatures[tenant] = {
                    id: tenantRecord.id,
                    sig: portaAuthUtils.getKeySignature(tenantRecord, this.config.PORTA_SSO_COMMON_NAME)
                };
            }
        }
        return this.tenantKeySignatures[tenant];
    }

    protected async getSessionTokenFromRequest(req: HttpRequest): Promise<string> {
        const { sig = undefined } = await this.getKeySignature(req);
        const { access_token = undefined } = req.context.getParameters<{ access_token: string }>();
        return access_token || (sig ? this.getCookieToken(sig, req) : undefined) || this.getBearerToken(req);
    }

    protected async findUserByToken<UserType = any>(token: string, req: HttpRequest): Promise<UserType> {
        const { sig = undefined, id = undefined } = await this.getKeySignature(req);
        if (sig && id && token) {
            const cacheKey = ["tokens", sig, token].join(":");
            const storage = await req.context.getCache().getValue<IPortaSessionStorage>(cacheKey);
            return storage.tenant.id === id ? (storage as any) : undefined;
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
