import { makeGlobalStore } from "@blendsdk/react";
import { ISysPermission, ISysRole, ISysTenant, ISysUser, ISysUserProfile } from "@porta/shared";
import { ApplicationApi } from "../system/api";
import { StoreBase } from "./storebase";

export class ReferenceDataStore extends StoreBase {
    //TODO: type this
    public userProfile: {
        user: ISysUser;
        profile: ISysUserProfile;
        roles: ISysRole[];
        permissions: ISysPermission[];
        signout_url: string;
        tenant: ISysTenant;
    };

    /**
     * Creates an instance of ReferenceDataStore.
     * @memberof ReferenceDataStore
     */
    public constructor() {
        super();
    }

    /**
     * Loads the use profile
     *
     * @protected
     * @memberof ReferenceDataStore
     */
    protected async loadUserProfile() {
        const data = (await ApplicationApi.application.getUserProfile({
            tenant: this.getCurrentTenant()
        })) as any;
        this.userProfile = data;
    }

    /**
     * Load all reference data
     *
     * @return {*}
     * @memberof ReferenceDataStore
     */
    public async load() {
        this.beginFetching();
        return new Promise<void>(async (resolve, reject) => {
            try {
                await this.loadUserProfile();
                this.doneFetching();
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }
}

export const useReferenceData = makeGlobalStore(ReferenceDataStore);
