import { DataStoreBase, makeGlobalStore } from "@blendsdk/react";
import Cookies from "js-cookie";
import { ApplicationApi } from "../system/api";

export class ReferenceDataStore extends DataStoreBase {
    //TODO: type this
    public userProfile: any;

    public constructor() {
        super();
    }

    public getManageTenant() {
        // the _t is available at logout
        return Cookies.get("_manage") || Cookies.get("_t") ||"";
    }

    protected async loadUserProfile() {
        const data = (await ApplicationApi.authorization.userInfoPost({
            tenant: this.getManageTenant()
        })) as any;
        this.userProfile = data;
    }

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
