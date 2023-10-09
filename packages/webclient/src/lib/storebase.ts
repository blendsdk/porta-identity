import { DataStoreBase, RouterStore } from "@blendsdk/react";
import { IRouterCommonParams } from "../system/session/types";

export class StoreBase extends DataStoreBase {
    /**
     * Reference to the current router
     *
     * @protected
     * @type {RouterStore}
     * @memberof StoreBase
     */
    protected router: RouterStore;
    /**
     * Sets the router
     *
     * @param {RouterStore} router
     * @memberof StoreBase
     */
    public serRouter(router: RouterStore) {
        if (!this.router) {
            this.router = router;
        }
    }
    /**
     * Creates an instance of StoreBase.
     * @memberof StoreBase
     */
    public constructor() {
        super();
        this.router = undefined;
    }
    /**
     * Gets the current tenant
     *
     * @return {*}
     * @memberof StoreBase
     */
    public getCurrentTenant() {
        const { tenant } = this.router.getParameters<IRouterCommonParams>();
        if (!tenant) {
            throw new Error(`Unable to determine the tenant from route ${this.router.getRouteName()}`);
        }
        return tenant;
    }
}