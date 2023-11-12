import { DataStoreBase } from "@blendsdk/react";
import { ApplicationApi } from "../../../system/api";
import { ITenantOverviewDataGridItem } from "./TenantOverviewDataGridModel";

export class TenantOverviewDataGridStore extends DataStoreBase {
    public records: ITenantOverviewDataGridItem[] = [];

    public loadAll() {
        this.beginFetching();
        return ApplicationApi.openIdTenant.listOpenIdTenant({ tenant: undefined }).then(({ data }) => {
            this.records = data.map(({ id, name, organization, is_active }) => {
                return {
                    id,
                    name,
                    organization,
                    is_active
                };
            });
            this.doneFetching();
        });
    }
}

export const tenantOverviewDataGridStore = new TenantOverviewDataGridStore();
