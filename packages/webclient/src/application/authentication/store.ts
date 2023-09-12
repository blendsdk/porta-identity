import { DataStoreBase, makeGlobalStore } from "@blendsdk/react";
import { IAuthenticationFlowState, ICheckFlowRequest } from "@porta/shared";
import { ApplicationApi } from "../../system/api";

export class CheckFlow extends DataStoreBase implements IAuthenticationFlowState {
    public mfa_list?: string[] | undefined;
    public account?: string | undefined;
    public account_state?: boolean | undefined;
    public account_status?: boolean | undefined;
    public password_state?: boolean | undefined;
    public mfa_state_obj?: string | undefined;
    public signin_url?: string | undefined;

    public constructor() {
        super();
        this.mfa_list = [];
        this.reset();
    }

    public reset() {
        this.account = undefined; // this must be set to undefined to make the validation work!
        this.account_state = undefined;
        this.account_status = undefined;
        this.password_state = undefined;
        this.mfa_state_obj = undefined;
        this.signin_url = undefined;
    }

    public async requestResetPassword(account: string) {
        this.beginFetching();
        await ApplicationApi.authorization.forgotPasswordRequestAccount({ account });
        this.doneFetching();
    }

    public async check(params: ICheckFlowRequest) {
        this.beginFetching();
        const { data = undefined } = await ApplicationApi.authorization.checkFlow(params);
        Object.entries(data || {}).forEach(([k, v]) => {
            if (k === "mfa_state") {
                v = JSON.parse(v);
                k = "mfa_state_obj";
            }
            (this as any)[k] = v;
        });
        this.doneFetching();
    }
}

export const useCheckFlowStore = makeGlobalStore(CheckFlow);
