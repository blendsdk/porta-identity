import { SessionProviderModuleBase, TGetUserMethod } from "@blendsdk/webafx-auth";
import { HttpRequest, IRoute } from "@blendsdk/webafx-common";
import { getKeySignature } from "./common";

export class CliSessionProvider extends SessionProviderModuleBase {
    protected async findSessionStorageByToken<SessionStorageType = any>(
        token: string,
        req: HttpRequest
    ): Promise<SessionStorageType> {
        return req.context.getCache().getValue([await getKeySignature(req), token].join(":"));
    }

    protected async getSessionTokenFromRequest(req: HttpRequest): Promise<string> {
        const cookie_token = this.getCookieToken(await getKeySignature(req), req);
        return cookie_token;
    }

    protected async createRequestContextGetUserMethod(
        sessionStorage: any,
        _route: IRoute,
        _req: HttpRequest
    ): Promise<TGetUserMethod> {
        return () => {
            const { user } = sessionStorage;
            return user;
        };
    }
}
