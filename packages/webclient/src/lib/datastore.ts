import { makeGlobalStore } from "@blendsdk/react";
import { ApplicationApi } from "../system/api";
import { StoreBase } from "./storebase";

export class ReferenceDataStore extends StoreBase {
    //TODO: type this
    public userProfile: any;

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
        const data = (await ApplicationApi.authorization.userInfoPost({
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
