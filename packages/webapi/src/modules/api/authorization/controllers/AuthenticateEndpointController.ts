import { verifyStringSync } from "@blendsdk/crypto";
import { isNullOrUndef, MD5 } from "@blendsdk/stdlib";
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
    RESP_FINALIZE,
    RESP_MFA
} from "@porta/shared";
import { SysApplicationDataService } from "../../../../dataservices/SysApplicationDataService";
import { SysProfileDataService } from "../../../../dataservices/SysProfileDataService";
import { SysUserDataService } from "../../../../dataservices/SysUserDataService";
import { Claims, commonUtils, databaseUtils, EmailMFAProvider, EndpointController } from "../../../../services";
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

    public async handleRequest(params: ICheckSetFlowRequest): Promise<Response<ICheckSetFlowResponse>> {
        let flow: IAuthorizationFlow = undefined;
        let next: string = undefined;
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
            username,
            password,
            new_password,
            confirm_new_password,
            mfa_result,
            consent: consent_result,
            ow_consent: ow_consent_result
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

        // Updates
        if (!error) {
            if (update === null) {
                flow.account_state = false;
                // reset all user input there
            }
            if (update === RESP_ACCOUNT) {
                const result = await this.checkUserCredentials(username, password, flow, tenantRecord);
                resp = result.resp;
                error = result.error;
            } else if (update === RESP_MFA) {
                // Check if the sent code is the code registered before!
                flow.mfa_state = mfa_result === flow.mfa_request;
                // check and set the bypass by IP and client_id if possible
                if (flow.mfa_state && flow.authRecord.mfa_bypass_days !== 0) {
                    await this.registerMFABypass(flow, true);
                }
                if (mfa_result !== MFA_RESEND_REQUEST && !flow.mfa_state) {
                    error = true;
                    resp = `invalid_mfa_${mfa_type}`;
                }
                await this.updateFlow(flow);
            } else if (update === MFA_RESEND_REQUEST) {
                await this.createNewMFARequest(flow);
            } else if (update === RESP_CHANGE_PASSWORD) {
                const result = await this.changePasswordAtLogin(
                    flow,
                    password,
                    new_password,
                    confirm_new_password,
                    tenantRecord
                );
                error = result.error;
                resp = result.resp;
            } else if (update === RESP_CONSENT) {
                await this.saveUserConsent(flow, consent_result, ow_consent_result, tenantRecord);
            }
        }

        // Next steps
        if (!error) {
            if (!flow.account_state) {
                next = RESP_ACCOUNT;
            } else {
                // the username and password has been accepted here.

                //next we check the MFA and resend MFA code request
                if (
                    update === MFA_RESEND_REQUEST ||
                    (update !== MFA_RESEND_REQUEST && (await this.checkSendMFARequest(flow, mfa_result)))
                ) {
                    next = RESP_MFA;
                }
                // next we check if a password change is required
                else if (flow.require_change_password || (error === true && update === RESP_CHANGE_PASSWORD)) {
                    next = RESP_CHANGE_PASSWORD;
                }
                // next we check is we need to get a consent from the user
                else if (flow.require_user_consent) {
                    next = RESP_CONSENT;
                    consent_claims = await this.getClaimsList(flow.authRequest);
                    consent_display_name = [flow.profile?.firstname, flow.profile?.middle_name, flow.profile?.lastname]
                        .filter(Boolean)
                        .join(" ");
                    const { roles } = await databaseUtils.getUserRolesAndPermissions(
                        flow.user.id,
                        flow.authRecord.application_id,
                        tenantRecord
                    );
                    ow_consent = roles.filter((r) => r.role === "ADMINISTRATOR").length !== 0;
                }
                // There are no more checks so we can safly finalize the flow
                else {
                    next = RESP_FINALIZE;
                    resp = `${this.getServerURL()}/af/finalize`;
                }
            }
        }

        if (is_conformance_test) {
            return new RedirectResponse({ url: resp });
        } else {
            return new SuccessResponse<ICheckSetFlowResponse>({
                data: {
                    consent_display_name,
                    ow_consent,
                    consent_claims,
                    next,
                    allow_reset_password,
                    application_name,
                    logo,
                    tenant_name,
                    tenant: tenantRecord ? tenantRecord.id : undefined,
                    resp,
                    error,
                    expires_in,
                    mfa_type
                }
            });
        }
    }

    protected async saveUserConsent(
        flow: IAuthorizationFlow,
        consent_result: boolean,
        ow_consent_result: boolean,
        tenantRecord: ISysTenant
    ) {
        flow.require_user_consent = false;

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
    }

    /**
     * @protected
     * @param {IAuthorizationFlow} flow
     * @param {string} password
     * @param {string} new_password
     * @param {string} confirm_new_password
     * @param {ISysTenant} tenantRecord
     * @return {*}
     * @memberof AuthenticateEndpointController
     */
    protected async changePasswordAtLogin(
        flow: IAuthorizationFlow,
        password: string,
        new_password: string,
        confirm_new_password: string,
        tenantRecord: ISysTenant
    ) {
        const userDs = new SysUserDataService({ tenantId: tenantRecord.id });
        const { user } = flow;
        const userRecord = await userDs.findByUsernameNonService({ username: user.username });
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
                flow.require_change_password = false;
                await this.updateFlow(flow);
                return {
                    error: false,
                    resp: undefined
                };
            } else {
                return {
                    error: true,
                    resp: INVALID_PWD_MATCH
                };
            }
        } else {
            return {
                error: true,
                resp: INVALID_PWD
            };
        }
    }

    /**
     * @protected
     * @param {IAuthorizationFlow} flow
     * @param {string} mfa_result
     * @return {*}
     * @memberof AuthenticateEndpointController
     */
    protected async checkSendMFARequest(flow: IAuthorizationFlow, mfa_result: string) {
        await this.checkMFABypass(flow);
        if (flow.mfa_state === false) {
            const alreadySent = (await this.getCache().getValue(this.getMFABypassKey(flow))) == "sent";
            if (mfa_result === MFA_RESEND_REQUEST || flow.mfa_request === undefined || !alreadySent) {
                flow.mfa_request = await this.createMFARequest(flow);
                await this.updateFlow(flow);
            }
            // send mfa code
            return true;
        } else {
            return false;
        }
    }

    /**
     * @protected
     * @param {IAuthorizationFlow} flow
     * @memberof AuthenticateEndpointController
     */
    protected async createNewMFARequest(flow: IAuthorizationFlow) {
        flow.mfa_request = await this.createMFARequest(flow);
        await this.registerMFABypass(flow, "sent"); // just register do not bypass
        await this.updateFlow(flow);
    }

    /**
     * @protected
     * @param {string} username
     * @param {string} password
     * @param {IAuthorizationFlow} flow
     * @param {ISysTenant} tenantRecord
     * @memberof AuthenticateEndpointController
     */
    protected async checkUserCredentials(
        username: string,
        password: string,
        flow: IAuthorizationFlow,
        tenantRecord: ISysTenant
    ) {
        let error: boolean = false;
        let resp: string = undefined;
        const userDs = new SysUserDataService({ tenantId: tenantRecord.id });
        const profileDs = new SysProfileDataService({
            tenantId: tenantRecord.id
        });
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
                flow.require_change_password = flow.user.require_pw_change === true;
                await this.updateFlow(flow);
            } else {
                error = true;
                resp = INVALID_PWD;
            }
        } else {
            error = true;
            resp = INVALID_PWD;
        }
        return { resp, error };
    }

    /**
     * @protected
     * @param {IAuthorizationFlow} flow
     * @return {*}
     * @memberof AuthenticateEndpointController
     */
    protected async registerMFABypass(flow: IAuthorizationFlow, value: any) {
        return await this.getCache().setValue(this.getMFABypassKey(flow), value, {
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
            flow.mfa_state = bypass === "sent" ? false : (bypass as any) !== undefined;
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
                const mailer = new EmailMFAProvider({
                    flow,
                    mailer: this.request.context.getService<IMailer>(KEY_MAILER_SERVICE),
                    settings: this.request.context.getSettings(),
                    trans: ((this as any).context as II18NRequestContext).getTranslator()
                });
                return mailer.send();
            }
            default:
                throw new Error(`No MFA request provider for ${flow.authRecord.mfa}`);
        }
    }
}
