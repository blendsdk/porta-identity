import { verifyStringSync } from "@blendsdk/crypto";
import { Response, SuccessResponse } from "@blendsdk/webafx-common";
import { II18NRequestContext } from "@blendsdk/webafx-i18n";
import { IMailer, KEY_MAILER_SERVICE } from "@blendsdk/webafx-mailer";
import { COOKIE_AUTH_FLOW, COOKIE_TENANT, FLOW_ERROR_INVALID, ICheckSetFlowRequest, ICheckSetFlowResponse, ISysTenant, MFA_RESEND_REQUEST } from "@porta/shared";
import { SysProfileDataService } from "../../../../dataservices/SysProfileDataService";
import { SysUserDataService } from "../../../../dataservices/SysUserDataService";
import { EmailMFAProvider, EndpointController } from "../../../../services";
import { IAuthorizationFlow, MFA_TYPE_PORTAMAIL } from "../../../../types";

export class FlowEndpointController extends EndpointController {

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

        const { update, password, mfa_result, username } = params;

        const tenant = this.getCookie(COOKIE_TENANT);
        const flowId = this.getCookie(COOKIE_AUTH_FLOW);
        const flowCacheKey = `auth_flow:${flowId}`;

        // read the flow first
        flow = await this.getCache().getValue<IAuthorizationFlow>(flowCacheKey);
        if (!flow) {
            resp = FLOW_ERROR_INVALID;
            error = true;
        }

        // if we have a flow the check the tenant
        if (!error) {
            tenantRecord = await this.getTenantRecord(tenant);

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
                        await this.getCache().setValue(flowCacheKey, flow);
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
                if (mfa_result !== MFA_RESEND_REQUEST && !flow.mfa_state) {
                    error = true;
                    resp = `invalid_mfa_${mfa_type}`;
                }
                await this.getCache().setValue(flowCacheKey, flow);
            }

            if (!error) {
                if (flow.account_state === false) {
                    resp = "account";
                } else {
                    // account state is true here            
                    if (flow.mfa_state === false) {
                        if (mfa_result === MFA_RESEND_REQUEST || flow.mfa_request === undefined) {
                            flow.mfa_request = await this.createMFARequest(flow);
                            await this.getCache().setValue(flowCacheKey, flow);
                        }
                        // send mfa code
                        resp = "mfa";
                    } else {
                        // mfa state is true
                        this.clearAuthenticationFlowCookies();
                        resp = `${this.getServerURL()}/api/finalize`;
                    }
                }
            }
        }

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