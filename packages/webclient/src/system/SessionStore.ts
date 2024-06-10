import { SessionStoreBase, useGlobalSystemError } from "@blendsdk/react";
import Cookies from "js-cookie";
import { eSystemRoutes } from "./routing";
import { ApplicationApi } from "./api";
import { getTenant } from "./lib";

/**
 * @export
 * @class SessionStore
 * @extends {SessionStoreBase}
 */
export class SessionStore extends SessionStoreBase {
    /**
     * @protected
     * @return {*}
     * @memberof SessionStore
     */
    protected skipSessionCheck() {
        const router = this.getRouter();
        switch (router.getRouteName()) {
            case "fallback":
            case eSystemRoutes.login.key:
            case eSystemRoutes.logout.key:
                return true;
            default:
                return false;
        }
    }

    /**
     * @protected
     * @return {*}  {Promise<boolean>}
     * @memberof SessionStore
     */
    protected async onShouldCheckSession(): Promise<boolean> {
        return this.skipSessionCheck() === false;
    }

    /**
     * @protected
     * @return {*}  {Promise<void>}
     * @memberof SessionStore
     */
    protected async onSessionExpired(): Promise<void> {
        if (this.skipSessionCheck()) {
            this.stopChecking();
        } else {
            Cookies.remove("_session");
            this.getRouter().go(eSystemRoutes.login.path, undefined, true);
        }
    }

    /**
     * @protected
     * @return {*}  {Promise<void>}
     * @memberof SessionStore
     */
    protected onSessionRefresh(): Promise<void> {
        return new Promise(async (resolve) => {
            try {
                await ApplicationApi.authentication.oidcKeepAlive({
                    ...getTenant()
                });
                // We wait 3 seconds for refresh effect
                setTimeout(() => {
                    resolve();
                }, 3000);
            } catch (err) {
                useGlobalSystemError().setError(err);
            }
        });
    }

    /**
     * @protected
     * @param {number} ttl
     * @return {*}  {Promise<boolean>}
     * @memberof SessionStore
     */
    protected onShouldRefreshSession(ttl: number): Promise<boolean> {
        return new Promise((resolve) => {
            resolve(ttl < 60);
        });
    }

    /**
     * @protected
     * @return {*}  {Promise<number>}
     * @memberof SessionStore
     */
    protected onGetSessionTTL(): Promise<number> {
        return new Promise((resolve) => {
            resolve(this.getTTLFromCookie("_session"));
        });
    }
}
