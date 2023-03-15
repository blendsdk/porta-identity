import { createApiStore } from "@blendsdk/react";
import { IAuthenticationFlowState, ICheckFlowRequest, ICheckFlowResponse } from "@porta/shared";
import Cookies from "js-cookie";
import { PortaApi } from "../api";

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
export const updateUserSelectList = (user?: string) => {
    const list = JSON.parse(Cookies.get("_ac") || "[]") as any[];
    if (user) {
        const tenant = getAuthenticatingTenant();
        const get = (user: string) => list.filter((i) => i.account === user)[0];
        if (!get(user) && list.length < 10) {
            list.unshift({
                account: user,
                tenant
            });
        }
        Cookies.set("_ac", JSON.stringify(list));
    }
    return list;
};
