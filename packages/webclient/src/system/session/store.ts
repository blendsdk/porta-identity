import { SessionStoreBase, useGlobalSystemError } from "@blendsdk/react";
import { portaAuthUtils } from "@porta/shared";
import Cookies from "js-cookie";
import { eAppRoutes } from "../../application/routing";
import { ApplicationApi } from "../api";
import { IRouterCommonParams } from "./types";

/**
 * @export
 * @class SessionStore
 * @extends {SessionStoreBase}
 */
export class SessionStore extends SessionStoreBase {
    protected skipSessionCheck() {
        const router = this.getRouter();
        switch (router.getRouteName()) {
            case "fallback":
            case eAppRoutes.signin.key:
                return true;
            default:
                return false;
            // case "fallback":
            // case eAppRoutes.signout.key:
            // case eAppRoutes.signin.key:
            // case eAppRoutes.resetPassword.key:
            // case eAppRoutes.noValidSession.key:
            // case eAppRoutes.forgotPassword.key:
            // case eAppRoutes.signoutComplete.key:
            //     return true;
            // default:
            //     return false;
        }
    }

    protected async onShouldCheckSession(): Promise<boolean> {
        return this.skipSessionCheck() === false;
    }

    /**
     * @protected
     * @returns {Promise<void>}
     * @memberof SessionStore
     */
    protected async onSessionExpired(): Promise<void> {
        if (this.skipSessionCheck()) {
            this.stopChecking();
        } else {
            //TODO maybe change this _session
            Cookies.remove("_session");
            alert("noValidSession");
            //this.getRouter().go(eAppRoutes.noValidSession.key, undefined, true);
        }
    }

    protected onSessionRefresh(): Promise<void> {
        return new Promise((resolve) => {
            ApplicationApi.authentication
                .authenticationKeepAlive()
                .then(() => {
                    setTimeout(() => {
                        resolve();
                    }, 5000);
                })
                .catch((err) => {
                    useGlobalSystemError().setError(err);
                });
        });
    }

    protected onShouldRefreshSession(ttl: number): Promise<boolean> {
        return new Promise((resolve) => {
            resolve(ttl < 60);
        });
    }

    protected onGetSessionTTL(): Promise<number> {
        const { tenant } = this.getRouter().getParameters<IRouterCommonParams>();
        const { sessionTTLKey } = portaAuthUtils.getSessionTTLKeys(tenant);
        if (!sessionTTLKey) {
            throw new Error(`Unable to determine sessionKey for tenant: ${tenant}`);
        }
        return new Promise((resolve) => {
            resolve(this.getTTLFromCookie(sessionTTLKey));
        });
    }
}
