import { makeGlobalStore } from "@blendsdk/react";
import { base64Decode, base64Encode } from "@blendsdk/stdlib";
import { IGetReferenceData, IPortaAccount } from "@porta/shared";
import { ApplicationApi, getTenant } from "../../system";
import { StoreBase } from "./StoreBase";

export interface ICurrentCasting {
    project_id: string;
    role_id: string;
}

export interface IUserState {
}

/**
 * @export
 * @class ApplicationDataStore
 * @extends {StoreBase}
 */
export class ApplicationDataStore extends StoreBase {

    public userState: Partial<IUserState> = {};
    public userData: IPortaAccount;

    public refs: IGetReferenceData = {
    };

    /**
     * Loads the use profile
     *
     * @protected
     * @memberof ReferenceDataStore
     */
    protected async loadUserProfile() {
        const { data: userData } = await ApplicationApi.profile.getUserProfile({
            ...getTenant()
        });
        const { data: userStateData } = await ApplicationApi.profile.getUserState({
            ...getTenant()
        });
        this.userData = userData;
        this.userState = JSON.parse(base64Decode(userStateData.user_state));
    }

    public saveUserState(state: Partial<IUserState>) {
        return ApplicationApi.profile
            .saveUserState({
                ...getTenant(),
                user_state: base64Encode(JSON.stringify({ ...this.userState, ...state }))
            })
            .then(() => {
                this.userState = { ...this.userState, ...state };
                this.react();
            });
    }

    protected async loadMasterData() {
        const { data } = await ApplicationApi.referenceData.getReferenceData({
            ...getTenant()
        });
        this.refs = data;
    }

    /**
     * Load all reference data
     *
     * @memberof ReferenceDataStore
     */
    public async load() {
        this.beginFetching();
        await this.loadUserProfile();
        await this.loadMasterData();
        this.doneFetching();
    }
}

export const useApplication = makeGlobalStore(ApplicationDataStore);
