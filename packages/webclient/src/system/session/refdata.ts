import { DataStoreBase, makeGlobalStore } from "@blendsdk/react";
import { IFlowInfo } from "@porta/shared";
import { ApplicationApi } from "../api";

class RefData extends DataStoreBase {
    public flowInfo: IFlowInfo | undefined;

    public async getFlowInfo() {
        this.beginFetching();
        const resp = await ApplicationApi.authorization.flowInfo({});
        this.flowInfo = resp.data;
        this.doneFetching();
    }
}

export const useRefData = makeGlobalStore(RefData);
