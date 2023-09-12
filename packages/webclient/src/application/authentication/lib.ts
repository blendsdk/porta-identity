import Cookies from "js-cookie";
import { getBaseUrl } from "../../system/session";
import { portaAuthUtils } from "@porta/shared";

export const FIELD_SIZE = "large";

export interface IExistingAccountStorage {
    [client_id: string]: IExistingAccount[];
}

export interface IExistingAccount {
    account: string;
    tenant: string;
}

export interface IAuthenticationDialogModel {
    username: string;
    password: string;
    mfa: string;
}

/**
 * Enum describing the UI flow
 */
export const eFlowState = {
    SELECT_ACCOUNT: 1,
    REQUIRE_PASSWORD: 2,
    START_MFA: 3,
    COMPLETE: 4,
    LOGOUT_PROGRESS: 5,
    LOGOUT_CANCELED: 6,
    FORGOT_PASSWORD_GET_EMAIL: 7,
    FORGOT_PASSWORD_PROGRESS: 8,
    INVALID_SESSION: 99
};

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

export const isFlowExpired = (key: string) => {
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

/**
 * Get the current tenant from the cookies
 * @returns
 */
const getAuthenticatingTenant = () => {
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
