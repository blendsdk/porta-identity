import { generateRandomUUID } from "@blendsdk/crypto";
import { expireSecondsFromNow, renderGetRedirect } from "@blendsdk/webafx-auth-oidc";
import { Response, SuccessResponse } from "@blendsdk/webafx-common";
import {
    COOKIE_RESET_PASSWORD_FLOW,
    IResetPasswordRedirectRequest,
    IResetPasswordRedirectResponse
} from "@porta/shared";
import { EndpointController } from "../../../../services";
import { TTL_PASSWORD_RESET_VALIDITY } from "../../../../types";

export class ResetPasswordController extends EndpointController {
    public async handleRequest(
        params: IResetPasswordRedirectRequest
    ): Promise<Response<IResetPasswordRedirectResponse>> {
        const { flow } = params;
        const cacheKey = "reset_password_flow";
        const currentKey = `${cacheKey}:${flow}`;

        let url = `${this.getServerURL()}/fe/auth/reset-password`;
        const flowData = await this.getCache().getValue(currentKey);

        this.removeAllCookies();

        if (flowData) {
            const expire = expireSecondsFromNow(TTL_PASSWORD_RESET_VALIDITY * 60);

            // new id
            const newFlowId = generateRandomUUID();

            // set the new cookie with its expire
            this.setCookie(COOKIE_RESET_PASSWORD_FLOW, newFlowId, {
                expires: new Date(expire),
                secure: true,
                httpOnly: true,
                signed: true,
                sameSite: "strict"
            });

            // set the new cache with its expire
            await this.getCache().setValue(`${cacheKey}:${newFlowId}`, flowData, {
                expire
            });

            // delete the old url
            await this.getCache().deleteValue(currentKey);
        }

        return new SuccessResponse(renderGetRedirect(url));
    }
}
