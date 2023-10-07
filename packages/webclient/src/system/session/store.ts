import { SessionStoreBase, useGlobalSystemError } from "@blendsdk/react";
import Cookies from "js-cookie";
import { eAppRoutes } from "../../application/routing";
import { ApplicationApi } from "../api";

/**
 * @export
 * @class SessionStore
 * @extends {SessionStoreBase}
 */
export class SessionStore extends SessionStoreBase {
    /**
     * @protected
     * @returns {Promise<void>}
     * @memberof SessionStore
     */
    protected onSessionExpired(): Promise<void> {
        return new Promise((resolve) => {
            const router = this.getRouter();
            switch (router.getRouteName()) {
                case eAppRoutes.signin.key:
                case eAppRoutes.signout.key:
                case eAppRoutes.forgotPassword.key:
                case eAppRoutes.resetPassword.key:
                case eAppRoutes.noValidSession.key:
                    this.stopChecking();
                    break;
                default:
                    Cookies.remove("_session");
                    this.getRouter().go(eAppRoutes.noValidSession.key, undefined, true);
            }
            resolve();
        });
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
        return new Promise((resolve) => {
            resolve(this.getTTLFromCookie("_session"));
        });
    }
}
