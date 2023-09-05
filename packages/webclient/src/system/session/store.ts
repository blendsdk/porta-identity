import { SessionStoreBase, useGlobalSystemError } from "@blendsdk/react";
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
            this.stopChecking();
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
