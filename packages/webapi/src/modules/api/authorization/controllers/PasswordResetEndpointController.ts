import { errorObjectInfo, isNullOrUndef } from "@blendsdk/stdlib";
import { BadRequestResponse, Response, ServerErrorResponse, SuccessResponse } from "@blendsdk/webafx-common";
import { II18NRequestContext } from "@blendsdk/webafx-i18n";
import { IMailer, KEY_MAILER_SERVICE } from "@blendsdk/webafx-mailer";
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
import { SysUserDataService } from "../../../../dataservices/SysUserDataService";
import { SysUserProfileDataService } from "../../../../dataservices/SysUserProfileDataService";
import { IPortaApplicationSetting } from "../../../../types";
import { databaseUtils } from "../../../../utils";
import { EndpointController } from "./EndpointControllerBase";
import { AUTH_FLOW_TTL } from "./constants";

/**
 * @export
 * @class PasswordResetEndpointController
 * @extends {EndpointController}
 */
export class PasswordResetEndpointController extends EndpointController {
    /**
     * @protected
     * @param {string} flow
     * @param {boolean} [check]
     * @returns
     * @memberof PasswordResetEndpointController
     */
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

    /**
     * @param {IRequestPasswordResetRequest} {
     *         confirmPassword,
     *         flow,
     *         password
     *     }
     * @returns {Promise<Response<IRequestPasswordResetResponse>>}
     * @memberof PasswordResetEndpointController
     */
    public async requestPasswordReset({
        confirmPassword,
        flow,
        password
    }: IRequestPasswordResetRequest): Promise<Response<IRequestPasswordResetResponse>> {
        try {
            const { account, check, tenantRecord, authRecord } = await this.getResetPasswordFlow(flow);
            if (check && account) {
                if (!isNullOrUndef(password) && !isNullOrUndef(confirmPassword) && password === confirmPassword) {
                    const cache = this.context.getCache();

                    const userDs = new SysUserDataService({
                        tenantId: databaseUtils.getTenantDataSourceID(tenantRecord)
                    });

                    let userRecord = await userDs.findByUsernameNonService({ username: account });
                    userRecord = await userDs.updateSysUserById({ password }, { id: userRecord.id });

                    await cache.deleteValue(`reset-password-request-check:${account}`);
                    await cache.deleteValue(`reset-password-request:${flow}`);

                    // Removes all token assigned to this user spanning by client_id.
                    // This will "logout" the given user in all access tokens for a given client
                    await this.destroySessionAndAllTokens(tenantRecord, authRecord.id, userRecord.id);
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

    /**
     * @param {ICheckPasswordResetRequestRequest} {
     *         flow
     *     }
     * @returns {Promise<Response<ICheckPasswordResetRequestResponse>>}
     * @memberof PasswordResetEndpointController
     */
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

    /**
     * @param {IForgotPasswordFlowInfoRequest} _params
     * @returns {Promise<Response<IForgotPasswordFlowInfoResponse>>}
     * @memberof PasswordResetEndpointController
     */
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

    /**
     * @param {IForgotPasswordRequestAccountRequest} {
     *         account
     *     }
     * @returns {Promise<Response<IForgotPasswordRequestAccountResponse>>}
     * @memberof PasswordResetEndpointController
     */
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
                    const { MFA_EMAIL_FROM } = this.context.getSettings<IPortaApplicationSetting>();
                    const mailService = this.request.context.getService<IMailer>(KEY_MAILER_SERVICE);
                    const trans = ((this as any).context as II18NRequestContext).getTranslator();

                    await mailService.sendMail({
                        from: MFA_EMAIL_FROM,
                        to: profileRecord.email || userRecord.username,
                        subject: trans.translate("mail_reset_password_subject", { ...profileRecord, ...tenantRecord }),
                        html: trans.translate("mail_reset_password_body", {
                            ...profileRecord,
                            ...tenantRecord,
                            url: `${this.getServerURL()}/fe/reset-password/${stateKey}/t`,
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
