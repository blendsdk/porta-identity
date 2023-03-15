import { verifyStringSync } from "@blendsdk/crypto";
import { createErrorObject } from "@blendsdk/stdlib";
import { Response, ServerErrorResponse, SuccessResponse } from "@blendsdk/webafx-common";
import { IAuthenticationFlowState, ICheckFlowRequest, ICheckFlowResponse, ISysTenant, ISysUser } from "@porta/shared";
import { SysTenantDataService } from "../../../../dataservices/SysTenantDataService";
import { SysUserDataService } from "../../../../dataservices/SysUserDataService";
import { ICachedFlowInformation, ICachedUser } from "../../../../types";
import { databaseUtils } from "../../../../utils";
import { eFlow, EndpointController } from "./EndpointControllerBase";

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
            let { tenantRecord = undefined } = await this.getCurrentAuthenticationFlow(); // TODO refactore try.catch
            // get the latest tenant record
            const tenantDs = new SysTenantDataService();
            tenantRecord = await tenantDs.findSysTenantById({ id: tenantRecord.id });
            if (state == "check_account") {
                return this.checkAccountFlow(tenantRecord, options);
            } else if (state === "check_pwd") {
                return this.checkPasswordFlow(tenantRecord, options);
            } else if (state == "check_mfa") {
                return new ServerErrorResponse(createErrorObject("NOT IMPLEMENTED !"));
            }
        } catch (err) {
            return new ServerErrorResponse(err.message);
        }
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

        return new SuccessResponse<ICheckFlowResponse>({
            data: await this.updateCurrentFlowState({
                account: userRecord !== null ? userRecord.username : null,
                account_status: userRecord !== null,
                account_state: tenantRecord.is_active ? userRecord?.is_active || false : false,
                signin_url: this.createFlowUrl("signin")
            })
        });

        // if (userRecord) {
        //     return new SuccessResponse<ICheckFlowResponse>({
        //         data: await this.updateCurrentFlowState({
        //             account: userRecord !== null ? userRecord.username : null,
        //             account_status: userRecord !== null,
        //             account_state: tenantRecord.is_active ? userRecord?.is_active || false : false,
        //             signin_url: this.createFlowUrl("signin")
        //         })
        //     });
        // } else {
        //     return new ServerErrorResponse({
        //         message: "INVALID_OR_MISSING_USERNAME"
        //     });
        // }
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
        const mfa_list = (await userDs.findMfaByUserId({ user_id: userRecord.id })).map((item) => {
            return item.mfa_name;
        });
        const password_state =
            currentState.account_state && currentState.account_status && currentState.account
                ? verifyStringSync(password, userRecord.password)
                : false;

        const mfa_state = mfa_list.length == 0 ? true : null; // if there is no mfa then pretend mfa auth is also ok.

        // if the password_state is true then it means we are basically authenticated except for a
        // final mfa validation. This is a case when there is not mfa for this user
        if (password_state && mfa_state) {
            await this.saveAuthenticatedUser(tenantRecord, userRecord);
        }

        return new SuccessResponse<ICheckFlowResponse>({
            data: await this.updateCurrentFlowState({
                password_state,
                mfa_list,
                mfa_state
            })
        });
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
