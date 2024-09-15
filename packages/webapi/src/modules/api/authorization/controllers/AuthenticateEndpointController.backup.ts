import { generateRandomUUID, verifyStringSync } from "@blendsdk/crypto";
import { errorObjectInfo, isNullOrUndef, MD5 } from "@blendsdk/stdlib";
import { RedirectResponse, Response, SuccessResponse } from "@blendsdk/webafx-common";
import { II18NRequestContext } from "@blendsdk/webafx-i18n";
import { IMailer, KEY_MAILER_SERVICE } from "@blendsdk/webafx-mailer";
import {
    COOKIE_AUTH_FLOW,
    COOKIE_TENANT,
    FLOW_ERROR_INVALID,
    IAuthorizeRequest,
    ICheckSetFlowRequest,
    ICheckSetFlowResponse,
    INVALID_PWD,
    INVALID_PWD_MATCH,
    ISysTenant,
    MFA_RESEND_REQUEST,
    RESP_ACCOUNT,
    RESP_CHANGE_PASSWORD,
    RESP_CONSENT,
    RESP_FORGOT_PASSWORD,
    RESP_FORGOT_PASSWORD_REQUEST,
    RESP_MFA
} from "@porta/shared";
import { SysApplicationDataService } from "../../../../dataservices/SysApplicationDataService";
import { SysProfileDataService } from "../../../../dataservices/SysProfileDataService";
import { SysUserDataService } from "../../../../dataservices/SysUserDataService";
import { AuthEmailProvider, Claims, commonUtils, databaseUtils, EndpointController } from "../../../../services";
import { EMailForgotPasswordProvider } from "../../../../services/EMailForgotPasswordProvider";
import { CONST_DAY_IN_SECONDS, IAuthorizationFlow, MFA_TYPE_PORTAMAIL } from "../../../../types";

export class AuthenticateEndpointController extends EndpointController {
    /**
     * @protected
     * @param {IAuthorizeRequest} auth_request_params
     * @return {*}
     * @memberof AuthenticateEndpointController
     */
    protected async getClaimsList(auth_request_params: IAuthorizeRequest) {
        const claims = new Claims({ auth_request_params } as any);
        return claims.getClaimsList();
    }

    /**
     * @param {ICheckSetFlowRequest} params
     * @return {*}  {Promise<Response<ICheckSetFlowResponse>>}
     * @memberof AuthenticateEndpointController
     */
    public async handleRequest(params: ICheckSetFlowRequest): Promise<Response<ICheckSetFlowResponse>> {
        let flow: IAuthorizationFlow = undefined;
        let resp: string = undefined;
        let error: boolean = false;
        let tenantRecord: ISysTenant = undefined;
        let logo: string = undefined;
        let tenant_name: string = undefined;
        let application_name: string = undefined;
        let allow_reset_password: boolean = undefined;
        let expires_in: number = 0;
        let mfa_type: string = undefined;
        let consent_claims: string[] = [];
        let consent_display_name = undefined;
        let ow_consent = undefined;

        let {
            update,
            password,
            mfa_result,
            username,
            consent: consent_result,
            ow_consent: ow_consent_result,
            new_password,
            confirm_new_password,
            locale
        } = params;

        const is_conformance_test = update === "conformance";
        update = is_conformance_test ? RESP_ACCOUNT : update;

        const tenant = this.getCookie(COOKIE_TENANT);
        const flowId = this.getCookie(COOKIE_AUTH_FLOW);

        // read the flow first
        flow = await this.getAuthenticationFlow(flowId);
        if (!flow) {
            resp = FLOW_ERROR_INVALID;
            error = true;
        }

        // if we have a flow the check the tenant
        if (!error) {
            tenantRecord = await commonUtils.getTenantRecord(tenant, this.request);

            expires_in = flow.expire - Date.now();

            if (!tenantRecord) {
                resp = FLOW_ERROR_INVALID;
                error = true;
            } else {
                tenant_name = tenantRecord.organization;
                application_name = flow.authRecord.application_name;
                mfa_type = flow.authRecord.mfa;
                logo = flow.authRecord.logo;
                allow_reset_password = true;
            }
        }

        // if we have a flow and a tenant
        if (!error) {
            const userDs = new SysUserDataService({ tenantId: tenantRecord.id });
            const profileDs = new SysProfileDataService({
                tenantId: tenantRecord.id
            });

            if (update === RESP_ACCOUNT) {
                const userRecord = await userDs.findByUsernameNonService({
                    username
                });

                if (userRecord) {
                    const isPasswordValid = verifyStringSync(password, userRecord.password);
                    if (isPasswordValid) {
                        flow.account_state = true;
                        flow.user = userRecord;
                        flow.profile = await profileDs.findProfileByUserId({
                            user_id: userRecord.id
                        });
                        // we need to ask the consent state here since we need a valid user
                        flow.require_user_consent = await this.isUserConsentRequired({
                            authRecord: flow.authRecord,
                            authRequest: flow.authRequest,
                            user: userRecord,
                            tenantRecord
                        });
                        flow.require_change_password = !(flow.user.require_pw_change === true);
                        await this.updateFlow(flow);
                    } else {
                        error = true;
                        resp = INVALID_PWD;
                    }
                } else {
                    error = true;
                    resp = INVALID_PWD;
                }
            } else if (update === RESP_FORGOT_PASSWORD) {
                flow.forgot_password_state = true;
                await this.updateFlow(flow);
            } else if (update === RESP_MFA) {
                flow.mfa_state = mfa_result === flow.mfa_request;

                // check and set the bypass by IP and client_id if possible
                if (flow.mfa_state && flow.authRecord.mfa_bypass_days !== 0) {
                    await this.registerMFABypass(flow);
                }

                if (mfa_result !== MFA_RESEND_REQUEST && !flow.mfa_state) {
                    error = true;
                    resp = `invalid_mfa_${mfa_type}`;
                }
                await this.updateFlow(flow);
            } else if (update === RESP_CONSENT) {
                flow.require_user_consent = true;

                // save the consent for this user
                await databaseUtils.saveUserConsent(
                    {
                        application_id: flow.authRecord.application_id,
                        user_id: flow.user.id,
                        is_consent: consent_result,
                        // the requested scope for this application is saved
                        // here so we can extract it later when Claims are read
                        scope: flow.authRequest.scope
                    },
                    tenantRecord
                );

                // we save the consent for the entire organization for this application
                if (ow_consent_result === true) {
                    const applicationDs = new SysApplicationDataService({
                        tenantId: tenantRecord.id
                    });
                    await applicationDs.updateSysApplicationById(
                        {
                            ow_consent: ow_consent_result
                        },
                        { id: flow.authRecord.application_id }
                    );
                }

                await this.updateFlow(flow);
            } else if (update === RESP_CHANGE_PASSWORD) {
                const userRecord = await userDs.findByUsernameNonService({
                    username
                });
                if (userRecord) {
                    const isPasswordValid = verifyStringSync(password, userRecord.password);
                    const isNewPassword = new_password === confirm_new_password && !isNullOrUndef(new_password);
                    if (isPasswordValid && isNewPassword && userRecord.require_pw_change === true) {
                        await userDs.updateSysUserById(
                            {
                                password: new_password,
                                date_modified: new Date().toISOString(),
                                require_pw_change: false
                            },
                            { id: userRecord.id }
                        );
                        flow.require_change_password = true;
                        await this.updateFlow(flow);
                    } else {
                        error = true;
                        resp = INVALID_PWD_MATCH;
                    }
                } else {
                    error = true;
                    resp = INVALID_PWD;
                }
            } else if (update === RESP_FORGOT_PASSWORD_REQUEST) {
                const userRecord = await userDs.findByUsernameNonService({ username });
                if (userRecord) {
                    const profileRecord = await profileDs.findProfileByUserId({
                        user_id: userRecord.id
                    });
                    if (profileRecord) {
                        try {
                            const ttl_minutes = 10;
                            const fpFlow = generateRandomUUID();
                            const url = `${this.getServerURL()}/fp/${fpFlow}`;
                            const mailer = new EMailForgotPasswordProvider({
                                mailer: this.request.context.getService<IMailer>(KEY_MAILER_SERVICE),
                                settings: this.request.context.getSettings(),
                                trans: ((this as any).context as II18NRequestContext).getTranslator(),
                                user: userRecord,
                                profile: profileRecord,
                                authRecord: flow.authRecord,
                                tenantRecord: tenantRecord,
                                locale,
                                ttl: ttl_minutes,
                                url
                            });
                            await mailer.send();
                            await this.getCache().setValue(
                                `forgot:${fpFlow}`,
                                {
                                    userRecord,
                                    profileRecord,
                                    locale,
                                    authRecord: flow.authRecord,
                                    tenantRecord
                                },
                                {
                                    expire: commonUtils.expireSecondsFromNow(ttl_minutes * 60) // minutes
                                }
                            );
                        } catch (err) {
                            this.getLogger().error(errorObjectInfo(err));
                        }
                    }
                }
            }

            if (!error) {
                if (flow.forgot_password_state === true) {
                    resp = RESP_FORGOT_PASSWORD;
                } else if (flow.account_state === false) {
                    resp = RESP_ACCOUNT;
                } else {
                    // account state is true here
                    await this.checkMFABypass(flow);
                    if (flow.mfa_state === false) {
                        if (mfa_result === MFA_RESEND_REQUEST || flow.mfa_request === undefined) {
                            flow.mfa_request = await this.createMFARequest(flow);
                            await this.updateFlow(flow);
                        }
                        // send mfa code
                        resp = RESP_MFA;
                    } else if (flow.require_user_consent === false) {
                        resp = RESP_CONSENT;
                        consent_claims = await this.getClaimsList(flow.authRequest);
                        consent_display_name = [
                            flow.profile?.firstname,
                            flow.profile?.middle_name,
                            flow.profile?.lastname
                        ]
                            .filter(Boolean)
                            .join(" ");
                        const { roles } = await databaseUtils.getUserRolesAndPermissions(
                            flow.user.id,
                            flow.authRecord.application_id,
                            tenantRecord
                        );
                        ow_consent = roles.filter((r) => r.role === "ADMINISTRATOR").length !== 0;
                    } else if (flow.require_change_password === false) {
                        resp = RESP_CHANGE_PASSWORD;
                    } else {
                        // mfa state is true
                        // here is the authentication complete
                        flow.complete = true;
                        await this.updateFlow(flow);
                        resp = `${this.getServerURL()}/af/finalize`;
                    }
                }
            }
        }

        if (is_conformance_test) {
            return new RedirectResponse({ url: resp });
        } else {
            return new SuccessResponse<ICheckSetFlowResponse>({
                data: {
                    next: "",
                    consent_display_name,
                    ow_consent,
                    allow_reset_password,
                    application_name,
                    logo,
                    tenant_name,
                    tenant: tenantRecord.id,
                    consent_claims,
                    resp,
                    error,
                    expires_in,
                    mfa_type
                }
            });
        }
    }

    /**
     * @protected
     * @param {IAuthorizationFlow} flow
     * @return {*}
     * @memberof AuthenticateEndpointController
     */
    protected async registerMFABypass(flow: IAuthorizationFlow) {
        return await this.getCache().setValue(this.getMFABypassKey(flow), true, {
            expire: commonUtils.expireSecondsFromNow(CONST_DAY_IN_SECONDS * flow.authRecord.mfa_bypass_days)
        });
    }

    /**
     * @protected
     * @param {IAuthorizationFlow} flow
     * @memberof AuthenticateEndpointController
     */
    protected async checkMFABypass(flow: IAuthorizationFlow) {
        if (flow.mfa_state === false) {
            const bypass = await this.getCache().getValue(this.getMFABypassKey(flow));
            flow.mfa_state = bypass !== undefined;
        }
    }

    /**
     * @protected
     * @param {IAuthorizationFlow} flow
     * @return {*}
     * @memberof AuthenticateEndpointController
     */
    protected getMFABypassKey(flow: IAuthorizationFlow) {
        const { authRecord, user } = flow;
        return `auth_mfa_bypass:${MD5([authRecord.client_id, commonUtils.getRemoteIP(this.request), user.id].join(""))}`;
    }

    /**
     * @protected
     * @param {IAuthorizationFlow} flow
     * @return {*}
     * @memberof FlowEndpointController
     */
    protected createMFARequest(flow: IAuthorizationFlow) {
        switch (flow.authRecord.mfa) {
            case MFA_TYPE_PORTAMAIL: {
                const mailer = new AuthEmailProvider({
                    flow,
                    mailer: this.request.context.getService<IMailer>(KEY_MAILER_SERVICE),
                    settings: this.request.context.getSettings(),
                    trans: ((this as any).context as II18NRequestContext).getTranslator()
                });
                return mailer.sendMFAEmail();
            }
            default:
                throw new Error(`No MFA request provider for ${flow.authRecord.mfa}`);
        }
    }
}
