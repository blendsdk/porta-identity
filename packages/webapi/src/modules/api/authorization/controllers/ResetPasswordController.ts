import { generateRandomUUID } from "@blendsdk/crypto";
import { isNullOrUndef } from "@blendsdk/stdlib";
import { expireSecondsFromNow, renderGetRedirect } from "@blendsdk/webafx-auth-oidc";
import { Response, SuccessResponse } from "@blendsdk/webafx-common";
import { II18NRequestContext } from "@blendsdk/webafx-i18n";
import { IMailer, KEY_MAILER_SERVICE } from "@blendsdk/webafx-mailer";
import {
    COOKIE_AUTH_FLOW_TTL,
    COOKIE_RESET_PASSWORD_FLOW,
    IResetAuthRequest,
    IResetAuthResponse,
    IResetPasswordFlowInfoRequest,
    IResetPasswordFlowInfoResponse,
    IResetPasswordRedirectRequest,
    IResetPasswordRedirectResponse,
    RESET_COMPLETE,
    RESET_PASSWOPRD_INVALID_CAPTCHA,
    RESET_PASSWORD_INVALID_FLOW,
    RESET_PASSWORD_INVALID_PASSWORD
} from "@porta/shared";
import { captcha } from "a-captcha";
import { SysUserDataService } from "../../../../dataservices/SysUserDataService";
import { AuthEmailProvider, commonUtils, EndpointController } from "../../../../services";
import { IResetPasswordFlow, TTL_PASSWORD_RESET_VALIDITY } from "../../../../types";

export class ResetPasswordController extends EndpointController {
    /**
     * @param {IResetAuthRequest} params
     * @return {*}  {Promise<Response<IResetAuthResponse>>}
     * @memberof ResetPasswordController
     */
    public async resetAuth(params: IResetAuthRequest): Promise<Response<IResetAuthResponse>> {
        const { flowData, currentKey } = await this.getFlowData();
        let error: boolean = true;
        let resp: string = undefined;

        if (flowData) {
            const { captcha, confirm, password } = params;
            if (isNullOrUndef(password) || isNullOrUndef(confirm) || confirm !== password) {
                resp = RESET_PASSWORD_INVALID_PASSWORD;
            } else if (isNullOrUndef(captcha) || captcha !== flowData.captchaText) {
                resp = RESET_PASSWOPRD_INVALID_CAPTCHA;
            } else {
                let { tenantRecord, userRecord, authRecord, profileRecord } = flowData;
                tenantRecord = await commonUtils.getTenantRecord(tenantRecord.id, this.request);
                const userDs = new SysUserDataService({ tenantId: tenantRecord.id });
                await userDs.updateSysUserById(
                    {
                        date_modified: new Date().toISOString(),
                        password
                    },
                    {
                        id: userRecord.id
                    }
                );

                // make sure we MFA on next login
                await this.getCache().deleteValue(this.getMFABypassKey(userRecord, authRecord));

                // now we send an email to the user informing the password change
                const mailer = new AuthEmailProvider({
                    flow: { authRecord: authRecord, tenantRecord } as any,
                    mailer: this.request.context.getService<IMailer>(KEY_MAILER_SERVICE),
                    settings: this.request.context.getSettings(),
                    trans: ((this as any).context as II18NRequestContext).getTranslator()
                });
                await mailer.sendPasswordChangedEmail(userRecord, profileRecord);

                // mow we remove the flow
                await this.getCache().deleteValue(currentKey);

                error = false;
                resp = RESET_COMPLETE;
            }
        } else {
            resp = RESET_PASSWORD_INVALID_FLOW;
            this.removeAllCookies();
        }

        return new SuccessResponse({
            data: {
                error,
                resp
            }
        });
    }

    /**
     * @protected
     * @return {*}
     * @memberof ResetPasswordController
     */
    protected async getFlowData() {
        const flowId = this.getCookie(COOKIE_RESET_PASSWORD_FLOW, true);
        const flowTTL = this.getCookie(COOKIE_AUTH_FLOW_TTL);

        const cacheKey = "reset_password_flow";
        const currentKey = `${cacheKey}:${flowId}`;
        const flowData = await this.getCache().getValue<IResetPasswordFlow>(currentKey);
        return {
            currentKey,
            flowData: flowData && flowTTL && flowId ? flowData : undefined
        };
    }

    /**
     * @param {IResetPasswordFlowInfoRequest} params
     * @return {*}  {Promise<Response<IResetPasswordFlowInfoResponse>>}
     * @memberof ResetPasswordController
     */
    public async resetPasswordFlowInfo(
        _params: IResetPasswordFlowInfoRequest
    ): Promise<Response<IResetPasswordFlowInfoResponse>> {
        let error: boolean = undefined;
        let application_name = undefined;
        let logo = undefined;
        let organization = undefined;
        let captchaImg = undefined;

        const { flowData, currentKey } = await this.getFlowData();

        if (flowData) {
            const { tenantRecord, authRecord } = flowData;
            organization = tenantRecord.organization;
            application_name = authRecord.application_name;
            logo = authRecord.logo;

            // create and save the captcha. tis call can be repeated for a new captcha
            const { text, buffer } = await captcha({ length: 6, sw: 2 });
            captchaImg = `data:image/png;base64,${buffer.toString("base64")}`;
            flowData.captchaText = text;
            await this.getCache().setValue(currentKey, flowData, { expire: flowData.expire });
        } else {
            error = true;
            this.removeAllCookies();
        }

        return new SuccessResponse({
            data: {
                error,
                application_name,
                logo,
                organization,
                captcha: captchaImg
            }
        });
    }

    /**
     * @param {IResetPasswordRedirectRequest} params
     * @return {*}  {Promise<Response<IResetPasswordRedirectResponse>>}
     * @memberof ResetPasswordController
     */
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

            this.setCookie(COOKIE_AUTH_FLOW_TTL, expire, {
                expires: new Date(expire)
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
