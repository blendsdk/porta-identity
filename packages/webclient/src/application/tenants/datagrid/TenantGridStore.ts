import { DataStoreBase, makeGlobalStore } from "@blendsdk/react";
import { ApplicationApi } from "../../../system/api";
import { ITenantEditorModel } from "../editor/TenantEditorForm";
import { ITenantGridItem } from "./TenantGridModel";

export class TenantGridStore extends DataStoreBase {
    /**
     * @type {ITenantGridItem[]}
     * @memberof TenantGridStore
     */
    public records: ITenantGridItem[] = [];

    /**
     * @param {string} id
     * @return {*}
     * @memberof TenantGridStore
     */
    public findLocalItem(id: string) {
        return this.records.filter((item) => {
            return item.id === id;
        })[0];
    }

    public async deleteTenant(id: string) {
        this.beginFetching();
        await ApplicationApi.openIdTenant.deleteOpenIdTenant({
            id,
            tenant: undefined
        });
        await this.loadAll();
        this.doneFetching();
    }

    public async createTenant(values: ITenantEditorModel, isNew: boolean) {
        this.beginFetching();
        if (isNew) {
            await ApplicationApi.openIdTenant.createOpenIdTenant({
                tenant: undefined,
                allow_registration: values.allow_registration,
                allow_reset_password: values.allow_reset_password,
                email: values.email,
                name: values.name,
                organization: values.organization,
                password: values.password
            });
        }
        await this.loadAll();
        this.doneFetching();
    }

    public async loadAll() {
        this.beginFetching();
        const { data } = await ApplicationApi.openIdTenant.listOpenIdTenant({ tenant: undefined });
        this.records = data.map((rec) => {
            return {
                ...rec,
                database: undefined
            };
        });
        this.doneFetching();
    }
}

export const useTenantGridStore = makeGlobalStore(TenantGridStore);
