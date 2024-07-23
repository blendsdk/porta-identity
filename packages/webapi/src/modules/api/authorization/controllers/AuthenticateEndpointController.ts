import { verifyStringSync } from "@blendsdk/crypto";
import { MD5 } from "@blendsdk/stdlib";
import { RedirectResponse, Response, SuccessResponse } from "@blendsdk/webafx-common";
import { II18NRequestContext } from "@blendsdk/webafx-i18n";
import { IMailer, KEY_MAILER_SERVICE } from "@blendsdk/webafx-mailer";
import { COOKIE_AUTH_FLOW, COOKIE_TENANT, FLOW_ERROR_INVALID, ICheckSetFlowRequest, ICheckSetFlowResponse, ISysTenant, MFA_RESEND_REQUEST } from "@porta/shared";
import { SysProfileDataService } from "../../../../dataservices/SysProfileDataService";
import { SysUserDataService } from "../../../../dataservices/SysUserDataService";
import { EmailMFAProvider, EndpointController, commonUtils } from "../../../../services";
import { CONST_DAY_IN_SECONDS, IAuthorizationFlow, MFA_TYPE_PORTAMAIL } from "../../../../types";

export class AuthenticateEndpointController extends EndpointController {

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

        let { update, password, mfa_result, username } = params;

        const is_conformance_test = update === "conformance";
        update = is_conformance_test ? "account" : update;

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
            if (update === "account") {
                const userDs = new SysUserDataService({ tenantId: tenantRecord.id });
                const profileDs = new SysProfileDataService({ tenantId: tenantRecord.id });

                const userRecord = await userDs.findByUsernameNonService({
                    username
                });

                if (userRecord) {
                    const isPasswordValid = verifyStringSync(password, userRecord.password);
                    if (isPasswordValid) {
                        flow.account_state = true;
                        flow.user = userRecord;
                        flow.profile = await profileDs.findProfileByUserId({ user_id: userRecord.id });
                        await this.updateFlow(flow);
                    } else {
                        error = true;
                        resp = "invalid_username_or_password";
                    }
                } else {
                    error = true;
                    resp = "invalid_username_or_password";
                }

            } else if (update === "mfa") {
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
            }

            if (!error) {
                if (flow.account_state === false) {
                    resp = "account";
                } else {
                    // account state is true here
                    await this.checkMFABypass(flow);
                    if (flow.mfa_state === false) {
                        if (mfa_result === MFA_RESEND_REQUEST || flow.mfa_request === undefined) {
                            flow.mfa_request = await this.createMFARequest(flow);
                            await this.updateFlow(flow);
                        }
                        // send mfa code
                        resp = "mfa";
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
                    allow_reset_password,
                    application_name,
                    logo,
                    tenant_name,
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
                const mailer = new EmailMFAProvider({
                    flow,
                    mailer: this.request.context.getService<IMailer>(KEY_MAILER_SERVICE),
                    settings: this.request.context.getSettings(),
                    trans: ((this as any).context as II18NRequestContext).getTranslator(),
                });
                return mailer.send();
            }
            default:
                throw new Error(`No MFA request provider for ${flow.authRecord.mfa}`);
        }
    }
}