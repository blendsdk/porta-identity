import { IApplicationModule } from "@blendsdk/webafx";
import { AuthenticationModule, IAuthenticationModule, ISessionStorage } from "@blendsdk/webafx-auth";
import { HttpRequest, HttpResponse } from "@blendsdk/webafx-common";
import { IPortaApplicationSetting } from "../../types";

export class IPortaAuthenticationModule {
    PORTA_SSO_COMMON_NAME: string;
}

export class PortaAuthenticationModule extends AuthenticationModule<
    IPortaAuthenticationModule,
    IPortaApplicationSetting
> {
    public constructor(config: IAuthenticationModule & IApplicationModule & IPortaAuthenticationModule) {
        super({ ...config, name: "porta", tokenKeyName: config.PORTA_SSO_COMMON_NAME });
    }

    protected installSessionInformation(sessionStorage: ISessionStorage, req: HttpRequest<{}>): Promise<void> {
        return new Promise((resolve) => {
            req.context.addService("userService", sessionStorage);
            resolve();
        });
    }

    /**
     * Initializes the module
     *
     * @returns {Promise<void>}
     * @memberof BasicAuthenticationModule
     */
    onInitialize(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.createSessionHandler();
                this.createSignOutHandler();
                this.application.addRouter({
                    routes: [
                        {
                            method: "post",
                            url: this.urls.keepAlive,
                            handlers: (req: HttpRequest, res: HttpResponse) => {
                                this.getLogger().debug(`Refreshing the session from ${this.config.name}`);
                                this.responseTokenExtended(true, req, res);
                            }
                        }
                    ]
                });
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }
}
