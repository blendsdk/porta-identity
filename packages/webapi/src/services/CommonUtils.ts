import { IPortaApplicationSetting } from "../types";

class CommonUtils {
    /**
     * Gets the PORTA_REGISTRY_TENANT parameter
     *
     * @returns
     * @memberof CommonUtils
     */
    public getPortaRegistryTenant() {
        const { PORTA_REGISTRY_TENANT = undefined } = (process.env as any as IPortaApplicationSetting) || {};
        if (!PORTA_REGISTRY_TENANT) {
            throw new Error("Parameter PORTA_REGISTRY_TENANT is not set!");
        }
        return PORTA_REGISTRY_TENANT;
    }
}

export const commonUtils = new CommonUtils();