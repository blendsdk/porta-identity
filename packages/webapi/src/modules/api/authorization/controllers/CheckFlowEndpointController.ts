import { verifyStringSync } from "@blendsdk/crypto";
import { IDictionaryOf, asyncForEach, errorObjectInfo } from "@blendsdk/stdlib";
import { Response, ServerErrorResponse, SuccessResponse } from "@blendsdk/webafx-common";
import { II18NRequestContext } from "@blendsdk/webafx-i18n";
import { IMailer, KEY_MAILER_SERVICE } from "@blendsdk/webafx-mailer";
import {
    IAuthenticationFlowState,
    ICheckFlowRequest,
    ICheckFlowResponse,
    ISysTenant,
    ISysUser,
    ISysUserProfile
} from "@porta/shared";
import { SysTenantDataService } from "../../../../dataservices/SysTenantDataService";
import { SysUserDataService } from "../../../../dataservices/SysUserDataService";
import { SysUserProfileDataService } from "../../../../dataservices/SysUserProfileDataService";
import { ICachedFlowInformation, ICachedUser, IMFACodes } from "../../../../types";
import { databaseUtils } from "../../../../utils";
import { EmailMFAProvider } from "../EMailMFAProvider";
import { EndpointController, eFlow } from "./EndpointControllerBase";

/**
 * Handles the CheckFlow endpoint
 *
 * @export
 * @class CheckFlowEndpointController
 * @extends {EndpointController}
 */
export class CheckFlowEndpointController extends EndpointController {
    /**
     * Gets the provided data from the UI and update the flow information
     *
     * @param {ICheckFlowRequest} { state, options }
     * @returns {Promise<Response<ICheckFlowResponse>>}
     * @memberof AuthorizationController
     */
    public async handleRequest({ state, options }: ICheckFlowRequest): Promise<Response<ICheckFlowResponse>> {
        try {
            let { tenantRecord = undefined } = await this.getCurrentAuthenticationFlow();
            // get the latest tenant record
            const tenantDs = new SysTenantDataService();
            tenantRecord = await tenantDs.findSysTenantById({ id: tenantRecord.id });
            if (state == "check_account") {
                return this.checkAccountFlow(tenantRecord, options);
            } else if (state === "check_pwd") {
                return this.checkPasswordFlow(tenantRecord, options);
            } else if (state == "check_mfa") {
                return this.checkMFAFlow(tenantRecord, options);
            }
        } catch (err) {
            this.getLogger().error(err.message, errorObjectInfo(err));
            return new ServerErrorResponse(err.message);
        }
    }

    /**
     * Checks the MFA flow
     *
     * @protected
     * @param {ISysTenant} tenantRecord
     * @param {string} mfa_input
     * @returns
     * @memberof CheckFlowEndpointController
     */
    protected async checkMFAFlow(tenantRecord: ISysTenant, mfa_input: string) {
        const currentState = await this.getCurrentFlowState();
        const userDs = new SysUserDataService({ tenantId: databaseUtils.getTenantDataSourceID(tenantRecord) });
        const userRecord = await userDs.findByUsernameNonService({ username: currentState.account });
        const mfa_list = await this.getMFAList(userDs, userRecord);
        const mfa_answers = JSON.parse(mfa_input);
        const mfa_codes = await this.getMFACodes();
        let mfa_state: IDictionaryOf<boolean> = {};
        let all_state: number = 0;
        mfa_list.forEach((item) => {
            const key = `mfa_${item}`;
            mfa_state[key] = mfa_answers[key] === mfa_codes[item];
            all_state += mfa_answers[key] === mfa_codes[item] ? 0 : 1;
        });

        if (all_state === 0) {
            await this.saveAuthenticatedUser(tenantRecord, userRecord);
        }

        return new SuccessResponse<ICheckFlowResponse>({
            data: await this.updateCurrentFlowState({
                mfa_state: JSON.stringify(mfa_state)
            })
        });
    }

    /**
     * Checks an account for existence and updates the auth flow
     *
     * @protected
     * @param {ISysTenant} tenantRecord
     * @param {string} username
     * @returns
     * @memberof AuthorizationController
     */
    protected async checkAccountFlow(tenantRecord: ISysTenant, username: string) {
        // get the user from the tenant db
        const userDs = new SysUserDataService({ tenantId: databaseUtils.getTenantDataSourceID(tenantRecord) });
        const userRecord = await userDs.findByUsernameNonService({ username: username?.toLocaleLowerCase() });

        // we are not allowed to login login with a service user
        const mfa_list = userRecord ? await this.getMFAList(userDs, userRecord) : [];

        return new SuccessResponse<ICheckFlowResponse>({
            data: await this.updateCurrentFlowState({
                account: userRecord !== null ? userRecord.username : null,
                account_status: userRecord !== null,
                account_state: tenantRecord.is_active ? userRecord?.is_active || false : false,
                signin_url: this.createFlowUrl("signin"),
                mfa_list: mfa_list
            })
        });
    }

    /**
     * Updates the current flow state
     *
     * @protected
     * @param {IAuthenticationFlowState} state
     * @returns {Promise<IAuthenticationFlowState>}
     * @memberof AuthorizationController
     */
    protected async updateCurrentFlowState(state: IAuthenticationFlowState): Promise<IAuthenticationFlowState> {
        const flowId = this.findFlowID();
        const current = await this.getFlow<ICachedFlowInformation>(eFlow.state, flowId);
        state = { ...current, ...state };
        return this.setFlow(eFlow.state, flowId, state);
    }

    /**
     * Gets the MFA list by given user
     *
     * @protected
     * @param {SysUserDataService} userDs
     * @param {ISysUser} userRecord
     * @returns
     * @memberof CheckFlowEndpointController
     */
    protected async getMFAList(userDs: SysUserDataService, userRecord: ISysUser) {
        return (await userDs.findMfaByUserId({ user_id: userRecord.id })).map((item) => {
            return item.mfa_name;
        });
    }

    /**
     * Configures and sends a MFA Email
     *
     * @protected
     * @param {ISysUser} userRecord
     * @param {ISysUserProfile} profileRecord
     * @returns
     * @memberof CheckFlowEndpointController
     */
    protected async sendMFAEmailCode(userRecord: ISysUser, profileRecord: ISysUserProfile) {
        const { authRecord, tenantRecord } = await this.getCurrentAuthenticationFlow();
        const emailMfa = new EmailMFAProvider({
            mailer: this.request.context.getService<IMailer>(KEY_MAILER_SERVICE),
            settings: this.request.context.getSettings(),
            trans: ((this as any).context as II18NRequestContext).getTranslator(),
            flowState: await this.getCurrentFlowState(),
            tenantRecord,
            authRecord,
            userRecord,
            profileRecord
        });
        return emailMfa.send();
    }

    protected async sendMFACodes(tenantRecord: ISysTenant) {
        const currentState = await this.getCurrentFlowState();
        const userDs = new SysUserDataService({ tenantId: databaseUtils.getTenantDataSourceID(tenantRecord) });
        const profileDs = new SysUserProfileDataService({
            tenantId: databaseUtils.getTenantDataSourceID(tenantRecord)
        });
        const userRecord = await userDs.findByUsernameNonService({ username: currentState.account });
        const profileRecord = await profileDs.findUserProfileByUserId({ user_id: userRecord.id });
        const mfa_list = await this.getMFAList(userDs, userRecord);
        const mfa_codes: IDictionaryOf<string> = {};
        if (mfa_list.length !== 0) {
            await asyncForEach(mfa_list, async (item) => {
                switch (item) {
                    case "portamail":
                        mfa_codes[item] = await this.sendMFAEmailCode(userRecord, profileRecord);
                        break;
                    default:
                        throw new Error(`MFA Type ${item} is not implemented`);
                }
            });
        }
        return await this.saveMFACodes(mfa_codes);
    }

    /**
     * Checks a password for a previously given account
     *
     * @protected
     * @param {ISysTenant} tenantRecord
     * @param {string} password
     * @returns
     * @memberof AuthorizationController
     */
    protected async checkPasswordFlow(tenantRecord: ISysTenant, password: string) {
        const currentState = await this.getCurrentFlowState();

        // get the user from the tenant db
        const userDs = new SysUserDataService({ tenantId: databaseUtils.getTenantDataSourceID(tenantRecord) });
        const userRecord = await userDs.findByUsernameNonService({ username: currentState.account });
        const mfa_list = await this.getMFAList(userDs, userRecord);
        const password_state =
            currentState.account_state && currentState.account_status && currentState.account
                ? verifyStringSync(password, userRecord.password)
                : false;

        // if the password_state is true then it means we are basically authenticated except for a
        // final mfa validation. This is a case when there is not mfa for this user
        if (password_state) {
            if (mfa_list.length === 0) {
                await this.saveAuthenticatedUser(tenantRecord, userRecord);
            } else {
                await this.sendMFACodes(tenantRecord);
            }
        }

        return new SuccessResponse<ICheckFlowResponse>({
            data: await this.updateCurrentFlowState({
                password_state,
                mfa_list
            })
        });
    }

    protected async getMFACodes() {
        const flowId = this.findFlowID();
        const { mfa_codes } = await this.getFlow<IMFACodes>(eFlow.mfa_codes, flowId);
        return mfa_codes;
    }

    protected async saveMFACodes(mfa_codes: IDictionaryOf<string>) {
        const flowId = this.findFlowID();
        const { expire = undefined } = await this.getCurrentAuthenticationFlow();
        return this.setFlow<IMFACodes>(
            eFlow.mfa_codes,
            flowId,
            { mfa_codes },
            {
                expire
            }
        );
    }

    /**
     * Saves the authenticated user in the cache
     *
     * @protected
     * @param {ISysTenant} tenant
     * @param {ISysUser} user
     * @returns
     * @memberof AuthorizationController
     */
    protected async saveAuthenticatedUser(tenant: ISysTenant, user: ISysUser) {
        const flowId = this.findFlowID();
        const { expire = undefined } = await this.getCurrentAuthenticationFlow();

        delete user.password;

        return this.setFlow<ICachedUser>(
            eFlow.user,
            flowId,
            {
                tenant,
                user
            },
            {
                expire
            }
        );
    }
}
