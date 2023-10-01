import { SessionProviderModuleBase, TGetUserMethod } from "@blendsdk/webafx-auth";
import { HttpRequest, IRoute } from "@blendsdk/webafx-common";
import { getCommonKeySignature } from "./common";

export class BffSessionProviderModule extends SessionProviderModuleBase {
    protected async findSessionStorageByToken<SessionStorageType = any>(
        token: string,
        req: HttpRequest<{}>
    ): Promise<SessionStorageType> {
        return req.context.getCache().getValue([await getCommonKeySignature(), token].join(":"));
    }

    protected async getSessionTokenFromRequest(req: HttpRequest<{}>): Promise<string> {
        const sig = await getCommonKeySignature();
        const cookie_token = this.getCookieToken(sig, req);
        return cookie_token;
    }

    /**
     * @protected
     * @param {*} sessionStorage
     * @param {IRoute} route
     * @param {HttpRequest<{}>} reg
     * @returns {Promise<TGetUserMethod>}
     * @memberof BffSessionProviderModule
     */
    protected async createRequestContextGetUserMethod(
        sessionStorage: any,
        _route: IRoute,
        _req: HttpRequest<{}>
    ): Promise<TGetUserMethod> {
        return () => {
            const { user } = sessionStorage;
            return user;
        };
    }
}
