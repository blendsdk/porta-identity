import { getGlobalRouter } from "@blendsdk/react";
import { useSystemError } from "./init";

export const getBaseUrl = () => {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}${hostname.toLowerCase().indexOf("localhost") !== -1 ? ":4000" : ""}`;
};

/**
 * Gets the current based on subdomain
 *
 * @export
 * @return {*}
 */
export function getTenant() {
    const router = getGlobalRouter();
    if (router) {
        const { tenant } = router.getParameters<{ tenant: string }>();
        if (tenant) {
            return {
                tenant,
                version: tenant
            };
        } else {
            throw new Error(
                `Unable to determine the tenant and the application version from ${window.location.hostname}`
            );
        }
    } else {
        throw new Error("Router not initialized!");
    }
}

export function useTenant() {
    const { catchSystemError } = useSystemError();
    try {
        const { tenant } = getTenant();
        return tenant;
    } catch (err: any) {
        catchSystemError(err);
    }
}
