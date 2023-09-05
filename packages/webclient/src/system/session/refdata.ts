import { DataStoreBase, makeGlobalStore } from "@blendsdk/react";
import { ApplicationApi } from "../api";
import { IFlowInfo } from "@porta/shared";

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
