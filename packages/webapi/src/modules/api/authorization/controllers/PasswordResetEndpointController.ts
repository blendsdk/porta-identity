import {
    IForgotPasswordFlowInfoRequest,
    IForgotPasswordFlowInfoResponse,
    IForgotPasswordRequestAccountRequest,
    IForgotPasswordRequestAccountResponse
} from "@porta/shared";
import { EndpointController } from "./EndpointControllerBase";
import { BadRequestResponse, Response, SuccessResponse } from "@blendsdk/webafx-common";
import { IMailer, KEY_MAILER_SERVICE } from "@blendsdk/webafx-mailer";
import { II18NRequestContext } from "@blendsdk/webafx-i18n";
import { SysUserDataService } from "../../../../dataservices/SysUserDataService";
import { databaseUtils } from "../../../../utils";
import { SysUserProfileDataService } from "../../../../dataservices/SysUserProfileDataService";
import { IMfaEmailSettings } from "../EMailMFAProvider";
import { AUTH_FLOW_TTL } from "./constants";
import { errorObjectInfo } from "@blendsdk/stdlib";

export class PasswordResetEndpointController extends EndpointController {
    public async forgotPasswordFlowInfo(
        _params: IForgotPasswordFlowInfoRequest
    ): Promise<Response<IForgotPasswordFlowInfoResponse>> {
        try {
            const { authRecord = undefined, tenantRecord = undefined } = await this.getCurrentAuthenticationFlow();
            if (authRecord && tenantRecord) {
                return new SuccessResponse<IForgotPasswordFlowInfoResponse>({
                    data: {
                        logo: authRecord.logo,
                        organization: tenantRecord.organization
                    }
                });
            } else {
                return new BadRequestResponse(new Error("INVALID_REQUEST_NO_FLOW"));
            }
        } catch (err) {
            return new BadRequestResponse(err);
        }
    }

    public async forgotPasswordRequestAccount({
        account
    }: IForgotPasswordRequestAccountRequest): Promise<Response<IForgotPasswordRequestAccountResponse>> {
        try {
            const { authRecord = undefined, tenantRecord = undefined } = await this.getCurrentAuthenticationFlow();
            if (authRecord && tenantRecord && account) {
                try {
                    const stateKey = crypto.randomUUID().replace(/\-/gi, "");

                    const userDs = new SysUserDataService({
                        tenantId: databaseUtils.getTenantDataSourceID(tenantRecord)
                    });
                    const profileDs = new SysUserProfileDataService({
                        tenantId: databaseUtils.getTenantDataSourceID(tenantRecord)
                    });
                    const userRecord = await userDs.findByUsernameNonService({ username: account });
                    const profileRecord = await profileDs.findUserProfileByUserId({ user_id: userRecord.id });
                    const { MFA_EMAIL_FROM } = this.context.getSettings<IMfaEmailSettings>();
                    const mailService = this.request.context.getService<IMailer>(KEY_MAILER_SERVICE);
                    const trans = ((this as any).context as II18NRequestContext).getTranslator();

                    await mailService.sendMail({
                        from: MFA_EMAIL_FROM,
                        to: profileRecord.email || userRecord.username,
                        subject: trans.translate("mail_reset_password_subject", { ...profileRecord, ...tenantRecord }),
                        html: trans.translate("mail_reset_password_body", {
                            ...profileRecord,
                            ...tenantRecord,
                            url: `${this.getServerUrl()}/fe/reset-password/${stateKey}/t`,
                            ttl: Math.trunc(AUTH_FLOW_TTL / 60)
                        })
                    });

                    const expire = Date.now() + AUTH_FLOW_TTL * 1000;

                    this.getCache().setValue(`reset-password-request-check:${account}`, stateKey, {
                        expire
                    });

                    this.getCache().setValue(
                        `reset-password-request:${stateKey}`,
                        {
                            account,
                            tenantRecord,
                            authRecord
                        },
                        {
                            expire
                        }
                    );
                } catch (err) {
                    this.context.getLogger().error(err.message, errorObjectInfo(err));
                }
                return new SuccessResponse<IForgotPasswordRequestAccountResponse>({ data: {} });
            } else {
                return new BadRequestResponse(new Error("INVALID_REQUEST_NO_FLOW"));
            }
        } catch (err) {
            return new BadRequestResponse(err);
        }
    }
}
