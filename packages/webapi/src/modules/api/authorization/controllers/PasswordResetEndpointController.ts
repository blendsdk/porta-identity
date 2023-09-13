import {
    ICheckPasswordResetRequestRequest,
    ICheckPasswordResetRequestResponse,
    IForgotPasswordFlowInfoRequest,
    IForgotPasswordFlowInfoResponse,
    IForgotPasswordRequestAccountRequest,
    IForgotPasswordRequestAccountResponse,
    IRequestPasswordResetRequest,
    IRequestPasswordResetResponse,
    ISysAuthorizationView,
    ISysTenant
} from "@porta/shared";
import { EndpointController } from "./EndpointControllerBase";
import { BadRequestResponse, Response, ServerErrorResponse, SuccessResponse } from "@blendsdk/webafx-common";
import { IMailer, KEY_MAILER_SERVICE } from "@blendsdk/webafx-mailer";
import { II18NRequestContext } from "@blendsdk/webafx-i18n";
import { SysUserDataService } from "../../../../dataservices/SysUserDataService";
import { databaseUtils } from "../../../../utils";
import { SysUserProfileDataService } from "../../../../dataservices/SysUserProfileDataService";
import { IMfaEmailSettings } from "../EMailMFAProvider";
import { AUTH_FLOW_TTL } from "./constants";
import { errorObjectInfo, isNullOrUndef } from "@blendsdk/stdlib";
import { SysAccessTokenDataService } from "../../../../dataservices/SysAccessTokenDataService";
import { SysSessionDataService } from "../../../../dataservices/SysSessionDataService";

export class PasswordResetEndpointController extends EndpointController {
    protected async getResetPasswordFlow(flow: string, check?: boolean) {
        const cache = this.context.getCache();
        let checkResult: boolean = true;
        const {
            account = undefined,
            authRecord = undefined,
            tenantRecord = undefined
        } = (await cache.getValue<{ account: string; authRecord: ISysAuthorizationView; tenantRecord: ISysTenant }>(
            `reset-password-request:${flow}`
        )) || {};
        if (check) {
            const flowCheck = (await cache.getValue<string>(`reset-password-request-check:${account}`)) || {};
            checkResult = flow === flowCheck;
        } else {
            checkResult = authRecord !== undefined && tenantRecord !== undefined && account !== undefined;
        }
        return {
            check: checkResult,
            authRecord,
            tenantRecord,
            account
        };
    }

    public async requestPasswordReset({
        confirmPassword,
        flow,
        password
    }: IRequestPasswordResetRequest): Promise<Response<IRequestPasswordResetResponse>> {
        try {
            const { account, check, tenantRecord } = await this.getResetPasswordFlow(flow);
            if (check && account) {
                if (!isNullOrUndef(password) && !isNullOrUndef(confirmPassword) && password === confirmPassword) {
                    const userDs = new SysUserDataService({
                        tenantId: databaseUtils.getTenantDataSourceID(tenantRecord)
                    });

                    const accessTokenDs = new SysAccessTokenDataService({
                        tenantId: databaseUtils.getTenantDataSourceID(tenantRecord)
                    });

                    const sessionDs = new SysSessionDataService({
                        tenantId: databaseUtils.getTenantDataSourceID(tenantRecord)
                    });

                    let userRecord = await userDs.findByUsernameNonService({ username: account });

                    userRecord = await userDs.updateSysUserById(
                        {
                            password
                        },
                        {
                            id: userRecord.id
                        }
                    );

                    // delete all access tokens
                    await accessTokenDs.deleteSysAccessTokenByUserId({ user_id: userRecord.id });
                    // delete all sessions
                    await sessionDs.deleteSysSessionByUserId({ user_id: userRecord.id });
                    // delete all local cookies
                    this.deleteAllCookies();

                    return new SuccessResponse<IRequestPasswordResetResponse>({
                        data: {
                            status: true
                        }
                    });
                } else {
                    return new BadRequestResponse(new Error("PASSWORDS_DO_NOT_MATCH"));
                }
            } else {
                return new BadRequestResponse(new Error("INVALID_RESET_PASSWORD_FLOW"));
            }
        } catch (err) {
            return new ServerErrorResponse(err);
        }
    }

    public async checkPasswordResetRequest({
        flow
    }: ICheckPasswordResetRequestRequest): Promise<Response<ICheckPasswordResetRequestResponse>> {
        try {
            const { authRecord, check, tenantRecord } = await this.getResetPasswordFlow(flow);
            // check if this flow is the most recent
            if (check) {
                return new SuccessResponse<ICheckPasswordResetRequestResponse>({
                    data: {
                        logo: authRecord.logo,
                        organization: tenantRecord.organization
                    }
                });
            } else {
                return new BadRequestResponse(new Error("INVALID_MATCHING_FLOW"));
            }
        } catch (err) {
            return new ServerErrorResponse(err);
        }
    }

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
            return new ServerErrorResponse(err);
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
            return new ServerErrorResponse(err);
        }
    }
}
