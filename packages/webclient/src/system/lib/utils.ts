import { getGlobalRouter } from "@blendsdk/react";

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
    debugger;

    if (router) {
        const { tenant } = router.getParameters<{ tenant: string; }>();
        if (tenant) {
            return {
                tenant,
                version: tenant
            };
        }
    }

    const url = new URL(window.location.href);
    const hostName = (url.hostname || url.host || "").toLocaleLowerCase();
    const parts = hostName.split(".");

    if (hostName === "localhost") {
        return {
            version: "develop",
            tenant: "develop"
        };
    } else if (parts.length !== 4 && parts.length !== 3) {
        throw new Error(`Unable to determine the tenant and the application version from ${hostName}`);
    }

    return parts.length === 4
        ? {
            version: parts[0],
            tenant: parts[1]
        }
        : {
            version: parts[0] === "next" ? "develop" : "prod",
            tenant: parts[0]
        };
}