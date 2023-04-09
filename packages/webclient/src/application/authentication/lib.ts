import { createApiStore } from "@blendsdk/react";
import {
    IAuthenticationFlowState,
    ICheckFlowRequest,
    ICheckFlowResponse,
    ILogoutFlowInfoRequest,
    ILogoutFlowInfoResponse,
    ILogoutFlowInfo,
    portaAuthUtils
} from "@porta/shared";
import Cookies from "js-cookie";
import { getBaseUrl } from "../../system/session";
import { PortaApi } from "../api";

/**
 * Gets the LogoutFlow info
 */
export const useGetLogoutFlow = createApiStore<ILogoutFlowInfo, ILogoutFlowInfoRequest, ILogoutFlowInfoResponse>({
    api: PortaApi.authorization.logoutFlowInfo
});

/**
 * The CheckFlow Store
 */
export const useCheckFlow = createApiStore<IAuthenticationFlowState, ICheckFlowRequest, ICheckFlowResponse>({
    api: PortaApi.authorization.checkFlow
});

/**
 * Form data validator
 * @param data
 * @param validator
 * @returns
 */
export const validateData = (data: any, validator: (data: any) => void) => {
    try {
        validator(data);
        return [true, undefined];
    } catch (err: any) {
        return [false, err.message];
    }
};

/**
 * Get the current tenant from the cookies
 * @returns
 */
export const getAuthenticatingTenant = () => {
    return Cookies.get("_at");
};

/**
 * Updated the list of authenticated users for next usage
 * The max number of users is 10
 * @param user
 * @returns
 */
export const updateUserSelectList = (tenant: string, user?: string) => {
    const system = getBaseUrl();
    const listKey = portaAuthUtils.getKeySignature(tenant, system, "user_list");
    const list = JSON.parse(Cookies.get(listKey) || "[]") as any[];
    if (user) {
        const tenant = getAuthenticatingTenant();
        const get = (user: string) => list.filter((i) => i.account === user)[0];
        if (!get(user) && list.length < 10) {
            list.unshift({
                account: user,
                tenant
            });
        }
        Cookies.set(listKey, JSON.stringify(list));
    }
    return list;
};

export const isExpired = (key: string) => {
    const now = Date.now();
    const _ls = Cookies.get(key);

    let expire = now - 1;

    if (_ls) {
        try {
            expire = parseInt(_ls);
        } catch {
            //no-op
        }
    }

    // edge case
    if (isNaN(expire)) {
        expire = now - 1;
    }

    return expire - Date.now() <= 0;
};
